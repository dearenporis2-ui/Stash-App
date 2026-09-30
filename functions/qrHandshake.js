// functions/qrHandshake.js
const admin = require("firebase-admin");
const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v1").https;
const { runAntiFraudChecks } = require("./antiFraud");
const { completeTrade } = require("./escrow");

const { FieldValue, Timestamp } = admin.firestore;

const QR_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

// Accepts { gps: {lat,lng}, deviceId } (also the older buyerGPS / buyerDeviceId keys)
function cleanInfo(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const g = r.gps || r.buyerGPS || null;
  const gps = g && Number.isFinite(g.lat) && Number.isFinite(g.lng)
    ? { lat: g.lat, lng: g.lng }
    : null;
  const id = r.deviceId || r.buyerDeviceId;
  const deviceId = typeof id === "string" ? id.slice(0, 100) : null;
  return { gps, deviceId };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const INVALID_QR = "This QR code isn't valid anymore. Ask the seller for a new one.";

// Seller generates a one-time QR (token is stored where clients can't read it)
async function generateQR(sellerId, tradeId, scanData) {
  if (typeof tradeId !== "string" || !tradeId) {
    throw new HttpsError("invalid-argument", "Missing trade");
  }
  const db = admin.firestore();
  const tradeSnap = await db.collection("trades").doc(tradeId).get();
  if (!tradeSnap.exists) throw new HttpsError("not-found", "Trade not found");
  const trade = tradeSnap.data();

  if (trade.sellerId !== sellerId) {
    throw new HttpsError("permission-denied", "Only the seller can generate this QR.");
  }
  if (trade.status !== "pending") {
    throw new HttpsError("failed-precondition", "This trade isn't active.");
  }
  if (trade.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("failed-precondition", "This reservation has expired.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAtMs = Date.now() + QR_TTL_MS;

  // Overwrites any earlier token, so old QR codes stop working
  await db.collection("qrTokens").doc(tradeId).set({
    token,
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    sellerInfo: cleanInfo(scanData),
    failedAttempts: 0,
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    payload: JSON.stringify({ tradeId, token }),
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

// Buyer scans the QR: validate token, run fraud checks, complete the trade
async function verifyQRScan(buyerId, qrPayload, scanData) {
  if (typeof qrPayload !== "string" || qrPayload.length > 500) {
    throw new HttpsError("invalid-argument", "That QR code isn't valid.");
  }
  let parsed;
  try {
    parsed = JSON.parse(qrPayload);
  } catch {
    throw new HttpsError("invalid-argument", "That QR code isn't valid.");
  }
  const { tradeId, token } = parsed || {};
  if (typeof tradeId !== "string" || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "That QR code isn't valid.");
  }

  const db = admin.firestore();
  const tradeRef = db.collection("trades").doc(tradeId);
  const tokenRef = db.collection("qrTokens").doc(tradeId);
  const [tradeSnap, tokenSnap] = await Promise.all([tradeRef.get(), tokenRef.get()]);

  if (!tradeSnap.exists || !tokenSnap.exists) {
    throw new HttpsError("failed-precondition", INVALID_QR);
  }
  const trade = tradeSnap.data();
  const tokenDoc = tokenSnap.data();

  if (!safeEqual(tokenDoc.token, token)) {
    throw new HttpsError("failed-precondition", INVALID_QR);
  }
  if (tokenDoc.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("failed-precondition", "This QR code expired. Ask the seller for a new one.");
  }
  if (trade.buyerId !== buyerId) {
    throw new HttpsError("permission-denied", "This trade belongs to a different buyer.");
  }
  if (trade.status !== "pending") {
    throw new HttpsError("failed-precondition", "This trade isn't active.");
  }

  const fraud = await runAntiFraudChecks({
    buyerId,
    sellerId: trade.sellerId,
    buyerInfo: cleanInfo(scanData),
    sellerInfo: tokenDoc.sellerInfo || {}
  });

  if (!fraud.passed) {
    const attempts = (tokenDoc.failedAttempts || 0) + 1;
    await Promise.all([
      tradeRef.update({
        fraudAttempt: true,
        fraudErrors: fraud.errors,
        fraudAt: FieldValue.serverTimestamp()
      }),
      attempts >= MAX_FAILED_ATTEMPTS
        ? tokenRef.delete()
        : tokenRef.update({ failedAttempts: attempts })
    ]);
    throw new HttpsError("failed-precondition", fraud.messages[0]);
  }

  await completeTrade(tradeId);
  return { success: true };
}

module.exports = { generateQR, verifyQRScan };