import assert from "node:assert/strict";
import test from "node:test";
import { loginOutcome, loginPageUrl, restartSignInUrl, startFailedUrl } from "./login-flow.ts";

function query(url) {
  return new URL(url, "https://www.test").searchParams;
}

test("an error from identity survives restarting sign-in", () => {
  const restart = restartSignInUrl("/studio", { authError: "That email and password don't match." });
  assert.equal(query(restart).get("authError"), "That email and password don't match.");
  const page = loginPageUrl("client_id=x&sig=y", "/studio", loginOutcome(Object.fromEntries(query(restart))));
  assert.equal(query(page).get("authError"), "That email and password don't match.");
  assert.equal(query(page).get("oauth_query"), "client_id=x&sig=y");
});

test("a new sign-up still sees 'check your email' after the restart", () => {
  const restart = restartSignInUrl("/studio", { registered: "1", commons_app: "agent-commons" });
  assert.equal(query(restart).get("registered"), "1");
  assert.equal(query(loginPageUrl("q", "/studio", loginOutcome({ registered: "1" }))).get("registered"), "1");
});

test("a verified email goes straight through to finish signing in", () => {
  const restart = restartSignInUrl("/studio", { verified: "1", commons_app: "agent-commons" });
  assert.equal(query(restart).get("direct"), "1");
  assert.equal(query(restart).get("callbackUrl"), "/studio");
});

test("a failed start is shown once instead of restarting forever", () => {
  const failed = startFailedUrl("/studio", "Could not start sign-in");
  assert.equal(loginOutcome(Object.fromEntries(query(failed))).startFailed, true);
  assert.equal(loginOutcome({}).startFailed, false);
});

test("an Auth.js error survives restarting sign-in", () => {
  const restart = restartSignInUrl("/studio", { error: "OAuthCallbackError" });
  assert.equal(query(restart).get("authError"), "Sign-in failed. Please try again.");
});
