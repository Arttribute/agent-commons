// Runs against an isolated, disposable database on a Mongo replica set.
// The provider is mocked. These tests never initialize or charge a real payment.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const app = path.resolve(__dirname, "..");
const dbName = "cl_registration_test_" + crypto.randomBytes(6).toString("hex");

const providerCalls = [];
const stubs = {
  "@/lib/db": { connectDB: async () => mongoose },
  "@/lib/app-url": { getAppBaseUrl: () => "https://commonlab.example.invalid" },
  "@/lib/email/resend": {
    sendEnrollmentEmail: async () => {},
    sendVerificationEmail: async () => {},
  },
  "@/lib/paystack": {
    initializePaystackTransaction: async (input) => {
      providerCalls.push(input);
      return {
        authorization_url: "https://checkout.paystack.com/verification",
        access_code: "mock",
        reference: input.reference,
      };
    },
    verifyPaystackTransaction: async (reference) => ({
      reference,
      status: "ongoing",
    }),
  },
};
const originalLoad = Module._load,
  originalResolve = Module._resolveFilename;
Module._load = function (spec, parent, main) {
  if (stubs[spec]) return stubs[spec];
  return originalLoad.call(this, spec, parent, main);
};
Module._resolveFilename = function (spec, parent, ...rest) {
  if (spec.startsWith("@/")) spec = path.join(app, spec.slice(2));
  return originalResolve.call(this, spec, parent, ...rest);
};
require.extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
process.env.PAYSTACK_SECRET_KEY = "sk_test_registration_verification_only";
const {
  publicRegistration,
  quoteRegistration,
  startRegistration,
  completeRegistration,
  registrationReceipt,
} = require("../lib/course-registration.ts");
const Course = require("../models/Course.ts").default;
const Payment = require("../models/Payment.ts").default;
const Ledger = require("../models/PayoutLedger.ts").default;
const Enrollment = require("../models/Enrollment.ts").default;
const User = require("../models/User.ts").default;
const { fulfillCompletedPayment } = require("../lib/payment-fulfillment.ts");
let counter = 0;
async function course(overrides = {}) {
  counter++;
  return Course.create({
    title: "Registration verification",
    slug: "registration-test-" + counter,
    tagline: "Verification",
    description: "Test programme",
    longDescription: "Test programme",
    instructor: "Test organisers",
    duration: "Three mornings",
    price: 8000,
    currency: "KES",
    isFree: false,
    published: true,
    courseType: "live",
    maxEnrollments: 30,
    paymentProviders: ["paystack"],
    modules: [],
    lessonsCount: 0,
    modulesCount: 0,
    educator: { userId: new mongoose.Types.ObjectId(), platformFeePercent: 0 },
    registration: {
      enabled: true,
      status: "open",
      agreementText: "I agree to this staging verification.",
      fields: [
        {
          key: "age",
          label: "Age band",
          type: "select",
          required: true,
          options: ["7–9", "10–13"],
        },
      ],
      theme: {},
    },
    accessProgram: {
      discounts: [
        {
          id: "team-test",
          code: "TEAM10",
          active: true,
          amountType: "fixed",
          amount: 7990,
          maxRedemptions: 5,
          redeemedCount: 0,
        },
      ],
    },
    ...overrides,
  });
}
function input(code = "TEAM10") {
  return {
    idempotencyKey: crypto.randomUUID(),
    name: "Verification adult",
    email: "parent@example.invalid",
    phone: "+254700000000",
    participants: [{ age: "7–9" }],
    agreed: true,
    discountCode: code,
    ...(code ? { expectedAmountMinor: 1000 } : {}),
  };
}
const verified = (ref, extras = {}) => ({
  reference: ref,
  status: "success",
  amount: 1000,
  currency: "KES",
  domain: "test",
  id: crypto.randomUUID(),
  channel: "card",
  ...extras,
});
test.before(async () => {
  assert(
    process.env.MONGODB_TEST_URI,
    "Set MONGODB_TEST_URI to a Mongo replica set",
  );
  await mongoose.connect(process.env.MONGODB_TEST_URI, {
    dbName,
    serverSelectionTimeoutMS: 20000,
  });
  await Promise.all([
    Course.init(),
    Payment.init(),
    Enrollment.init(),
    User.init(),
    Ledger.init(),
  ]);
});
test.after(async () => {
  assert(
    mongoose.connection.name === dbName &&
      dbName.startsWith("cl_registration_test_"),
  );
  try {
    await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});
test("the same Common Courses discount gives KSh10 for one child and KSh8010 for two", async () => {
  const c = await course();
  assert.equal(
    (await quoteRegistration(c.slug, { quantity: 1, code: "team10" }))
      .amountMinor,
    1000,
  );
  assert.equal(
    (await quoteRegistration(c.slug, { quantity: 2, code: "TEAM10" }))
      .amountMinor,
    801000,
  );
});
test("a retry returns the same existing Payment row and initializes Paystack only once", async () => {
  const c = await course(),
    body = input(),
    before = providerCalls.length;
  const a = await startRegistration(c.slug, body),
    b = await startRegistration(c.slug, body);
  assert.equal(a.reference, b.reference);
  assert.equal(providerCalls.length, before + 1);
  assert.equal(await Payment.countDocuments({ courseId: c._id }), 1);
  await assert.rejects(
    startRegistration(c.slug, { ...body, phone: "+254700000001" }),
    /changed/,
  );
});
test("concurrent checkouts cannot exceed the course capacity", async () => {
  const c = await course({ maxEnrollments: 2 });
  const result = await Promise.allSettled(
    [1, 2, 3].map(() => startRegistration(c.slug, input())),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal((await publicRegistration(c.slug)).available, 0);
});
test("concurrent checkouts share the existing code limit, including pending holds", async () => {
  const c = await course({
    accessProgram: {
      discounts: [
        {
          id: "one",
          code: "TEAM10",
          active: true,
          amountType: "fixed",
          amount: 7990,
          maxRedemptions: 1,
          redeemedCount: 0,
        },
      ],
    },
  });
  const result = await Promise.allSettled([
    startRegistration(c.slug, input()),
    startRegistration(c.slug, input()),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
});
test("callback and webhook retries produce one enrolment, one conversion and one ledger sale", async () => {
  const c = await course(),
    p = await startRegistration(c.slug, input());
  await Promise.all([
    completeRegistration(p.reference, verified(p.reference)),
    fulfillCompletedPayment({
      provider: "paystack",
      providerReference: p.reference,
      verified: verified(p.reference),
    }),
  ]);
  const stored = await Payment.findOne({ providerReference: p.reference });
  assert.equal(stored.status, "completed");
  assert.equal(stored.metadata.registration.status, "confirmed");
  assert.equal((await Enrollment.findOne({ courseId: c._id })).paidAmount, 10);
  assert.equal(
    (await Course.findById(c._id)).accessProgram.discounts[0].redeemedCount,
    1,
  );
  assert.equal(await Ledger.countDocuments({ courseId: c._id }), 1);
});
test("wrong paid amount goes to review and never grants a place", async () => {
  const c = await course(),
    p = await startRegistration(c.slug, input());
  await completeRegistration(
    p.reference,
    verified(p.reference, { amount: 500 }),
  );
  const stored = await Payment.findOne({ providerReference: p.reference });
  assert.equal(stored.metadata.registration.status, "review");
  assert.equal(stored.amount, 5);
  assert.equal(await Enrollment.countDocuments({ courseId: c._id }), 0);
  assert.equal((await publicRegistration(c.slug)).available, 30);
});
test("a test/live mismatch never records a completed live payment", async () => {
  const c = await course(),
    p = await startRegistration(c.slug, input());
  await completeRegistration(
    p.reference,
    verified(p.reference, { domain: "live" }),
  );
  const stored = await Payment.findOne({ providerReference: p.reference });
  assert.equal(stored.status, "failed");
  assert.equal(stored.metadata.registration.status, "review");
  assert.equal(await Enrollment.countDocuments({ courseId: c._id }), 0);
});
test("late payment after the last place was taken requires review", async () => {
  const c = await course({ maxEnrollments: 1 });
  const first = await startRegistration(c.slug, input());
  await Payment.updateOne(
    { providerReference: first.reference },
    {
      $set: {
        "metadata.registration.expiresAt": new Date(
          Date.now() - 1000,
        ).toISOString(),
      },
    },
  );
  const next = await startRegistration(c.slug, input());
  await completeRegistration(next.reference, verified(next.reference));
  await completeRegistration(first.reference, verified(first.reference));
  assert.equal(
    (await Payment.findOne({ providerReference: first.reference })).metadata
      .registration.status,
    "review",
  );
  assert.equal((await publicRegistration(c.slug)).available, 0);
});
test("an expired coupon hold cannot claim a second redemption after the code was used", async () => {
  const c = await course({
    accessProgram: {
      discounts: [
        {
          id: "one",
          code: "TEAM10",
          active: true,
          amountType: "fixed",
          amount: 7990,
          maxRedemptions: 1,
          redeemedCount: 0,
        },
      ],
    },
  });
  const first = await startRegistration(c.slug, input());
  await Payment.updateOne(
    { providerReference: first.reference },
    {
      $set: {
        "metadata.registration.expiresAt": new Date(
          Date.now() - 1000,
        ).toISOString(),
      },
    },
  );
  const next = await startRegistration(c.slug, input());
  await completeRegistration(next.reference, verified(next.reference));
  await completeRegistration(first.reference, verified(first.reference));
  assert.equal(
    (await Payment.findOne({ providerReference: first.reference })).metadata
      .registration.status,
    "review",
  );
  assert.equal(
    (await Course.findById(c._id)).accessProgram.discounts[0].redeemedCount,
    1,
  );
});
test("a complete discount uses the same payment and enrolment records without Paystack", async () => {
  const c = await course({
    accessProgram: {
      discounts: [
        {
          id: "free",
          code: "FREE",
          active: true,
          amountType: "percent",
          amount: 100,
          redeemedCount: 0,
        },
      ],
    },
  });
  const body = input("FREE");
  body.expectedAmountMinor = 0;
  const before = providerCalls.length,
    p = await startRegistration(c.slug, body);
  assert.equal(p.status, "confirmed");
  assert.equal(p.paymentStatus, "free");
  assert.equal(providerCalls.length, before);
  assert.equal(
    (await Enrollment.findOne({ courseId: c._id })).paymentStatus,
    "free",
  );
});
test("the opaque receipt contains no contact or participant details", async () => {
  const c = await course(),
    p = await startRegistration(c.slug, input());
  const receipt = registrationReceipt(
    await Payment.findOne({ providerReference: p.reference }),
  );
  const text = JSON.stringify(receipt);
  for (const value of [
    "parent@example.invalid",
    "+254700000000",
    "Verification adult",
    "7–9",
  ])
    assert(!text.includes(value));
  assert.equal(receipt.amountMinor, 1000);
});

test("a currency mismatch stays in review and the shared ledger records the actual currency", async () => {
  const c = await course(),
    p = await startRegistration(c.slug, input());
  await completeRegistration(
    p.reference,
    verified(p.reference, { amount: 500, currency: "USD" }),
  );
  const stored = await Payment.findOne({ providerReference: p.reference });
  assert.equal(stored.metadata.registration.status, "review");
  assert.equal(stored.amount, 5);
  assert.equal(stored.currency, "usd");
  assert.equal((await Ledger.findOne({ courseId: c._id })).currency, "usd");
  assert.equal(await Enrollment.countDocuments({ courseId: c._id }), 0);
});
