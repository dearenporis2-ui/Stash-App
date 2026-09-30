// functions/debtLedger.js
// Admin settles a seller's 5% fee after receiving cash
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v1").https;

const { FieldValue } = admin.firestore;

async function settleDebt(adminId, userId, debtId) {
  if (typeof userId !== "string" || typeof debtId !== "string" || !userId || !debtId) {
    throw new HttpsError("invalid-argument", "Missing user or debt");
  }

  const db = admin.firestore();
  const adminRef = db.collection("users").doc(adminId);
  const debtRef = db.collection("debtLedger").doc(debtId);
  const userRef = db.collection("users").doc(userId);
  const unpaidQuery = db.collection("debtLedger")
    .where("userId", "==", userId)
    .where("status", "==", "unpaid");

  let accountUnlocked = false;

  await db.runTransaction(async (tx) => {
    accountUnlocked = false;
    const [adminSnap, debtSnap, unpaidSnap] = await Promise.all([
      tx.get(adminRef), tx.get(debtRef), tx.get(unpaidQuery)
    ]);

    if (!adminSnap.exists || adminSnap.data().isAdmin !== true) {
      throw new HttpsError("permission-denied", "Admins only");
    }
    if (!debtSnap.exists) throw new HttpsError("not-found", "Debt not found");
    const debt = debtSnap.data();
    if (debt.userId !== userId) throw new HttpsError("invalid-argument", "Debt doesn't belong to that user");
    if (debt.status === "paid") throw new HttpsError("failed-precondition", "Already paid");

    const remaining = unpaidSnap.docs.filter(d => d.id !== debtId).length;

    tx.update(debtRef, {
      status: "paid",
      paidAt: FieldValue.serverTimestamp(),
      settledByAdmin: adminId
    });

    if (remaining === 0) {
      tx.update(userRef, { accountLocked: false, pendingDebt: 0 });
      accountUnlocked = true;
    } else {
      tx.update(userRef, { pendingDebt: FieldValue.increment(-debt.amountSCR) });
    }
  });

  return { success: true, accountUnlocked };
}

module.exports = { settleDebt };