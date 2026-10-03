// /login needs a fresh, signed sign-in request from identity before it can
// show its buttons, so a visit without one restarts sign-in through
// /api/auth/native/start. Identity reports outcomes back to /login, and those
// must survive that restart or people never see them.

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

/** Auth.js reports its own failures as /login?error=<type>. */
function authJsMessage(type: string) {
  if (!type) return "";
  return type === "Configuration"
    ? "Sign-in could not start because the server auth provider is not configured correctly."
    : "Sign-in failed. Please try again.";
}

/** Outcome identity, Auth.js or a failed start reported back to /login. */
export function loginOutcome(params: Params) {
  return {
    authError: (first(params.authError) || authJsMessage(first(params.error))).slice(0, 300),
    registered: params.registered === "1",
    // Opening the verification link signed the person in at identity.
    verified: params.verified === "1",
    // Starting sign-in itself failed: show the error instead of retrying it.
    startFailed: params.failed === "1",
  };
}

/** Where /login sends a visit that has no signed sign-in request yet. */
export function restartSignInUrl(callbackUrl: string, params: Params) {
  const outcome = loginOutcome(params);
  const query = new URLSearchParams({ callbackUrl });
  // Identity already has a session: go straight through to finish sign-in.
  if (outcome.verified) query.set("direct", "1");
  if (outcome.authError) query.set("authError", outcome.authError);
  if (outcome.registered) query.set("registered", "1");
  return `/api/auth/native/start?${query}`;
}

/** The /login page with a fresh sign-in request and the outcome to show. */
export function loginPageUrl(
  oauthQuery: string,
  callbackUrl: string,
  outcome: { authError?: string; registered?: boolean },
) {
  const query = new URLSearchParams({ oauth_query: oauthQuery, callbackUrl });
  if (outcome.authError) query.set("authError", outcome.authError);
  if (outcome.registered) query.set("registered", "1");
  return `/login?${query}`;
}

/** /login after starting sign-in failed. It must not restart again. */
export function startFailedUrl(callbackUrl: string, message: string) {
  return `/login?${new URLSearchParams({ callbackUrl, authError: message, failed: "1" })}`;
}
