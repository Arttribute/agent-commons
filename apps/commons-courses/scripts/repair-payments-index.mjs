import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required.");
}

await mongoose.connect(uri);

const payments = mongoose.connection.collection("payments");

const missingStripeSession = await payments
  .find({
    provider: "paystack",
    $or: [{ stripeSessionId: { $exists: false } }, { stripeSessionId: null }],
  })
  .project({ _id: 1, providerReference: 1 })
  .toArray();

for (const payment of missingStripeSession) {
  await payments.updateOne(
    { _id: payment._id },
    { $set: { stripeSessionId: `paystack:${payment.providerReference}` } }
  );
}

const indexes = await payments.indexes();
const stripeSessionIndex = indexes.find((index) => index.name === "stripeSessionId_1");

if (stripeSessionIndex) {
  await payments.dropIndex("stripeSessionId_1");
}

await payments.createIndex(
  { stripeSessionId: 1 },
  {
    name: "stripeSessionId_1",
    unique: true,
    partialFilterExpression: { stripeSessionId: { $type: "string" } },
  }
);

console.log(
  `Repaired payments index and backfilled ${missingStripeSession.length} Paystack payments.`
);

await mongoose.disconnect();
