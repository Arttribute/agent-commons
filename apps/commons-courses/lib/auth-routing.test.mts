import { test } from "node:test";
import assert from "node:assert/strict";
import { commonsIdentityConfigured, shouldUseDirectGoogle, linkedIdentityForSession } from "./auth-routing.ts";

test("live Google signups use Commons Identity when configured, preserving canonical credits", () => {
  const values = { COMMONS_IDENTITY_ISSUER: "https://auth.example.com/api/auth\n", COMMONS_IDENTITY_CLIENT_ID: "client\n", GOOGLE_CLIENT_ID: "google", GOOGLE_CLIENT_SECRET: "secret" };
  assert.equal(commonsIdentityConfigured(values), true);
  assert.equal(shouldUseDirectGoogle("/live/workshop", values), false);
  assert.equal(shouldUseDirectGoogle("/courses/workshop", values), false);
  assert.equal(shouldUseDirectGoogle("/live/workshop", { GOOGLE_CLIENT_ID: "google", GOOGLE_CLIENT_SECRET: "secret" }), true);
  assert.equal(shouldUseDirectGoogle("/live/workshop", {}), false);
});

test("existing local sessions can pick up a verified canonical link without changing local ownership", () => {
  const profile = { email: "learner@example.com", emailVerifiedAt: new Date(), identityUserId: "usr_shared", identityWorkspaceId: "wsp_shared" };
  assert.deepEqual(linkedIdentityForSession("LEARNER@example.com", profile), { identityUserId: "usr_shared", identityWorkspaceId: "wsp_shared", workspaceId: "wsp_shared" });
  assert.equal(linkedIdentityForSession("other@example.com", profile), null);
  assert.equal(linkedIdentityForSession(profile.email, { ...profile, emailVerifiedAt: null }), null);
  assert.equal(linkedIdentityForSession(profile.email, { ...profile, identityUserId: "legacy-user" }), null);
});
