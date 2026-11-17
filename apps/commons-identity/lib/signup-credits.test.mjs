import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueSignupCredits,
  signupCreditDelivery,
} from "./signup-credits.ts";

test("signup eligibility starts at midnight Nairobi on 17 November", async () => {
  const queued = [];
  const database = {
    query: async (_sql, values) => {
      queued.push(values);
      return { rows: [] };
    },
  };
  await enqueueSignupCredits(database, {
    id: "usr_old",
    createdAt: "2026-11-16T20:59:59.999Z",
  });
  await enqueueSignupCredits(database, {
    id: "usr_new",
    createdAt: "2026-11-16T21:00:00.000Z",
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0][0], "usr_new");
});

test("an uncertain HTTP response remains pending and retries the same signup", async () => {
  let acknowledged = false;
  let grants = 0;
  const requests = [];
  const database = {
    query: async (sql) => {
      if (sql.startsWith("select"))
        return {
          rows: acknowledged
            ? []
            : [
                {
                  user_id: "usr_retry",
                  signed_up_at: "2026-11-17T00:00:00+03:00",
                },
              ],
        };
      if (sql.includes("returning user_id"))
        return { rows: [{ user_id: "usr_retry" }] };
      if (sql.includes("delivered_at = now()")) acknowledged = true;
      return { rows: [] };
    },
  };
  const fetcher = async (url, options) => {
    if (url.endsWith("/oauth2/token"))
      return Response.json({ access_token: "service-token", expires_in: 600 });
    requests.push(JSON.parse(options.body));
    grants++;
    if (grants === 1) throw new Error("Response lost after server committed");
    return Response.json({
      data: { principalId: "usr_retry", entryId: "same-entry" },
    });
  };
  const deliver = signupCreditDelivery(
    database,
    {
      COMMONS_IDENTITY_ISSUER: "https://identity.test/api/auth",
      SIGNUP_CREDITS_API_URL: "https://credits.test",
      SIGNUP_CREDITS_CLIENT_ID: "signup-service",
      SIGNUP_CREDITS_CLIENT_SECRET: "test-secret",
    },
    fetcher,
  );
  await deliver("usr_retry");
  assert.equal(acknowledged, false);
  await deliver();
  assert.equal(acknowledged, true);
  assert.deepEqual(requests[0], requests[1]);
  await deliver();
  assert.equal(grants, 2);
});
