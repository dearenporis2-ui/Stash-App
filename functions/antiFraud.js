// functions/antiFraud.js
// Server-side checks for the QR handshake.
// Note: GPS and device ID come from the client, so treat them as soft signals.
const admin = require("firebase-admin");

const MAX_MEETUP_DISTANCE_M = 500;
const MIN_MEETUP_DISTANCE_M = 1;
const PAIR_LIMIT_PER_DAY = 1;
const BUYER_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const MESSAGES = {
  SELF_TRADE: "You can't trade with yourself.",
  SAME_DEVICE: "Both accounts are on the same device.",
  BUYER_LOCATION_MISSING: "Turn on location access so we can verify the meetup.",
  SELLER_LOCATION_MISSING: "The seller's location wasn't shared. Ask them to reopen the QR screen.",
  GPS_TOO_CLOSE: "Location check failed.",
  GPS_TOO_FAR: "You two don't seem to be at the same place.",
  PAIR_LIMIT: "You've already completed a trade with this person today.",
  DAILY_LIMIT: "You've hit the daily trade limit."
};

async function runAntiFraudChecks({ buyerId, sellerId, buyerInfo, sellerInfo }) {
  const db = admin.firestore();
  const errors = [];

  // 1. Self-trade
  if (buyerId === sellerId) errors.push("SELF_TRADE");

  // 2. Same device on both accounts
  if (buyerInfo.deviceId && sellerInfo.deviceId && buyerInfo.deviceId === sellerInfo.deviceId) {
    errors.push("SAME_DEVICE");
  }

  // 3. GPS: both sides required, must be near each other but not identical
  if (!buyerInfo.gps) errors.push("BUYER_LOCATION_MISSING");
  if (!sellerInfo.gps) errors.push("SELLER_LOCATION_MISSING");
  if (buyerInfo.gps && sellerInfo.gps) {
    const d = getDistanceMeters(
      buyerInfo.gps.lat, buyerInfo.gps.lng,
      sellerInfo.gps.lat, sellerInfo.gps.lng
    );
    if (d < MIN_MEETUP_DISTANCE_M) errors.push("GPS_TOO_CLOSE");
    if (d > MAX_MEETUP_DISTANCE_M) errors.push("GPS_TOO_FAR");
  }

  // 4. Velocity (equality-only queries, so no composite index is needed)
  const since = Date.now() - DAY_MS;
  const recent = (snap) => snap.docs.filter(d => {
    const t = d.data().completedAt;
    return t && t.toMillis() >= since;
  }).length;

  const trades = db.collection("trades");
  const [forward, reverse, mine] = await Promise.all([
    trades.where("buyerId", "==", buyerId).where("sellerId", "==", sellerId)
      .where("status", "==", "completed").get(),
    trades.where("buyerId", "==", sellerId).where("sellerId", "==", buyerId)
      .where("status", "==", "completed").get(),
    trades.where("buyerId", "==", buyerId).where("status", "==", "completed").get()
  ]);

  if (recent(forward) + recent(reverse) >= PAIR_LIMIT_PER_DAY) errors.push("PAIR_LIMIT");
  if (recent(mine) >= BUYER_DAILY_LIMIT) errors.push("DAILY_LIMIT");

  return {
    passed: errors.length === 0,
    errors,
    messages: errors.map(e => MESSAGES[e] || "Verification failed.")
  };
}

// Haversine distance in meters
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * (Math.PI / 180); }

module.exports = { runAntiFraudChecks };