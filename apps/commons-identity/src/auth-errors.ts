// What to tell a person when signing in fails. Keys are Better Auth error codes
// and OAuth callback errors, which arrive as `?error=` or in an error body.
const MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED:
    "Your email isn't verified yet. We've sent you a new link: open it to finish signing in.",
  INVALID_EMAIL_OR_PASSWORD:
    "That email and password don't match. If you signed up with Google, use Continue with Google, or reset your password.",
  USER_ALREADY_EXISTS:
    "There's already an account with this email. Sign in instead, or reset your password.",
  PASSWORD_TOO_SHORT: "Use a password with at least 8 characters.",
  INVALID_TOKEN: "This link has expired or was already used. Request a new one.",
  access_denied: "Google sign-in was cancelled. Try again when you're ready.",
  account_not_linked:
    "This email already has an account. Sign in with your email and password, or reset your password.",
  unable_to_link_account:
    "We couldn't connect Google to the account for this email. Sign in with your email and password, or reset your password.",
  email_not_found:
    "Google didn't share an email address. Try another Google account, or sign in with email.",
  invalid_signature: "This sign-in page expired. Please try again.",
};

const RESTART =
  "That sign-in took too long or was finished in another tab. Please try again.";
for (const code of [
  "state_mismatch",
  "state_not_found",
  "please_restart_the_process",
  "invalid_callback_request",
  "no_code",
  "invalid_code",
  "no_callback_url",
]) {
  MESSAGES[code] = RESTART;
}

/** Every message by code, for pages that map errors in the browser. */
export function authErrorMessages() {
  return { ...MESSAGES };
}

export function authErrorMessage(code: string | null | undefined) {
  if (!code) return "";
  return MESSAGES[code] ?? "We couldn't sign you in. Please try again.";
}
