// functions/escrow.js
// Reservation lifecycle: reserve, complete, expire
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v1").https;

const { FieldValue, Timestamp } = admin.firestore;

const RESERVATION_MS = 48 * 60 * 60 * 1000;
const MAX_ACTIVE_RESERVATIONS = 2;
const FLAKES_BEFORE_PAUSE = 2;
const PAUSE_MS = 7 * 24 * 60 * 60 * 1000;
const FEE_RATE = 0.05;

// Buyer reserves an active listing (free)
async function reserveListing(buyerId, listingId) {
  if (typeof listingId !== "string" || !listingId) {
    throw new HttpsError("invalid-argument", "Missing listing");
  }

  const db = admin.firestore();
  const buyerRef = db.collection("users").doc(buyerId);
  const listingRef = db.collection("listings").doc(listingId);
  const tradeRef = db.collection("trades").doc();
  const activeQuery = db.collection("trades")
    .where("buyerId", "==", buyerId)
    .where("status", "==", "pending");

  await db.runTransaction(async (tx) => {
    const [buyerSnap, listingSnap, activeSnap] = await Promise.all([
      tx.get(buyerRef), tx.get(listingRef), tx.get(activeQuery)
    ]);

    if (!buyerSnap.exists) throw new HttpsError("not-found", "Account not found");
    const buyer = buyerSnap.data();

    if (buyer.accountLocked) {
      throw new HttpsError("failed-precondition", "Your account is restricted until your platform fee is settled.");
    }
    if (buyer.reserveBannedUntil && buyer.reserveBannedUntil.toMillis() > Date.now()) {
      throw new HttpsError("failed-precondition", "Reservations are paused on your account after missed meetups. Try again later.");
    }

    if (!listingSnap.exists) throw new HttpsError("not-found", "Listing not found");
    const listing = listingSnap.data();

    if (listing.status !== "active") {
      throw new HttpsError("failed-precondition", "This item is no longer available.");
    }
    if (listing.intent === "grail") {
      throw new HttpsError("failed-precondition", "This item is a Personal Grail and isn't for sale or trade.");
    }
    if (listing.sellerId === buyerId) {
      throw new HttpsError("failed-precondition", "You can't reserve your own item.");
    }
    if (activeSnap.size >= MAX_ACTIVE_RESERVATIONS) {
      throw new HttpsError("failed-precondition", `You can only hold ${MAX_ACTIVE_RESERVATIONS} reservations at a time.`);
    }

    tx.update(listingRef, {
      status: "reserved",
      reservedBy: buyerId,
      reservedAt: FieldValue.serverTimestamp()
    });

    tx.set(tradeRef, {
      buyerId,
      sellerId: listing.sellerId,
      listingId,
      priceSCR: listing.priceSCR, // locked in at reservation time
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + RESERVATION_MS),
      qrVerified: false
    });
  });

  return { tradeId: tradeRef.id };
}

// Called after a successful QR handshake + fraud checks
async function completeTrade(tradeId) {
  const db = admin.firestore();
  const tradeRef = db.collection("trades").doc(tradeId);
  const tokenRef = db.collection("qrTokens").doc(tradeId);
  let feeOwed = 0;

  await db.runTransaction(async (tx) => {
    feeOwed = 0;
    const tradeSnap = await tx.get(tradeRef);
    if (!tradeSnap.exists) throw new HttpsError("not-found", "Trade not found");
    const trade = tradeSnap.data();

    if (trade.status !== "pending") {
      throw new HttpsError("failed-precondition", "This trade is already settled.");
    }
    if (trade.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("deadline-exceeded", "This reservation has expired.");
    }

    const price = Number(trade.priceSCR);
    feeOwed = Number.isFinite(price) ? Math.round(price * FEE_RATE * 100) / 100 : 0;

    tx.update(db.collection("users").doc(trade.buyerId), {
      traderRep: FieldValue.increment(1)
    });

    const sellerUpdate = { traderRep: FieldValue.increment(1) };
    if (feeOwed > 0) {
      sellerUpdate.pendingDebt = FieldValue.increment(feeOwed);
      sellerUpdate.accountLocked = true;
      tx.set(db.collection("debtLedger").doc(), {
        userId: trade.sellerId,
        tradeId,
        amountSCR: feeOwed,
        status: "unpaid",
        createdAt: FieldValue.serverTimestamp()
      });
    }
    tx.update(db.collection("users").doc(trade.sellerId), sellerUpdate);

    tx.update(tradeRef, {
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      qrVerified: true
    });
    tx.update(db.collection("listings").doc(trade.listingId), { status: "sold" });
    tx.delete(tokenRef);
  });

  return { feeOwed };
}

// Expire a reservation nobody completed: re-list the item, strike the buyer
async function expireTrade(tradeId) {
  const db = admin.firestore();
  const tradeRef = db.collection("trades").doc(tradeId);

  await db.runTransaction(async (tx) => {
    const tradeSnap = await tx.get(tradeRef);
    if (!tradeSnap.exists) return;
    const trade = tradeSnap.data();
    if (trade.status !== "pending") return;
    if (trade.expiresAt.toMillis() > Date.now()) return;

    const listingRef = db.collection("listings").doc(trade.listingId);
    const buyerRef = db.collection("users").doc(trade.buyerId);
    const [listingSnap, buyerSnap] = await Promise.all([tx.get(listingRef), tx.get(buyerRef)]);

    tx.update(tradeRef, {
      status: "expired",
      expiredAt: FieldValue.serverTimestamp()
    });
    tx.delete(db.collection("qrTokens").doc(tradeId));

    if (
      listingSnap.exists &&
      listingSnap.data().status === "reserved" &&
      listingSnap.data().reservedBy === trade.buyerId
    ) {
      tx.update(listingRef, { status: "active", reservedBy: null, reservedAt: null });
    }

    if (buyerSnap.exists) {
      const flakes = (buyerSnap.data().flakeCount || 0) + 1;
      tx.update(buyerRef, flakes >= FLAKES_BEFORE_PAUSE
        ? { flakeCount: 0, reserveBannedUntil: Timestamp.fromMillis(Date.now() + PAUSE_MS) }
        : { flakeCount: flakes });
    }
  });
}

module.exports = { reserveListing, completeTrade, expireTrade };