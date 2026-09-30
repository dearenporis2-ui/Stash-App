// functions/index.js
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const { reserveListing, expireTrade } = require("./escrow");
const { generateQR, verifyQRScan } = require("./qrHandshake");
const { settleDebt } = require("./debtLedger");

// Wraps every callable: requires login, passes clean errors to the client
function callable(handler) {
  return functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Please sign in");
    }
    try {
      return await handler(context.auth.uid, data || {});
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error(err);
      throw new functions.https.HttpsError("internal", "Something went wrong. Try again.");
    }
  });
}

exports.reserveListing = callable((uid, data) => reserveListing(uid, data.listingId));
exports.generateQR = callable((uid, data) => generateQR(uid, data.tradeId, data.scanData));
exports.verifyQRScan = callable((uid, data) => verifyQRScan(uid, data.qrPayload, data.scanData));
exports.settleDebt = callable((uid, data) => settleDebt(uid, data.userId, data.debtId));

// Hourly: expire stale reservations, re-list items, record no-show strikes
exports.checkExpiredTrades = functions.pubsub
  .schedule("every 60 minutes")
  .onRun(async () => {
    const snap = await admin.firestore()
      .collection("trades")
      .where("status", "==", "pending")
      .get();

    const now = Date.now();
    const expired = snap.docs.filter(d => d.data().expiresAt.toMillis() <= now);
    await Promise.all(expired.map(d => expireTrade(d.id)));
    console.log(`Expired ${expired.length} stale reservations`);
  });