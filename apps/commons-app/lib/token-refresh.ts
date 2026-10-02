// A failed refresh must not be retried by every request that follows: a studio
// view fires a dozen API calls, middleware and the route both run the jwt
// callback, and Commons Identity rate limits its token endpoint. Retrying a
// dead grant on each of them used up that limit for everyone else.
export const REFRESH_RETRY_MS = 30_000;

type RefreshState = {
  accessTokenError?: string;
  refreshRetryAt?: number;
};

/** Whether this token must not attempt a refresh right now. */
export function refreshBlocked(token: RefreshState, now = Date.now()) {
  if (token.accessTokenError === "RefreshTokenRejected") return true;
  return Boolean(token.refreshRetryAt && now < Number(token.refreshRetryAt));
}

/** The token to keep after a refresh attempt fails. */
export function refreshFailure<T extends RefreshState>(
  token: T,
  response?: Response | null,
  now = Date.now(),
): T {
  // invalid_grant / invalid_client: the grant is gone, and only a new sign-in
  // restores the user token. Signed-in requests keep working on the app's
  // service credential meanwhile.
  if (response?.status === 400 || response?.status === 401) {
    return {
      ...token,
      accessTokenError: "RefreshTokenRejected",
      refreshRetryAt: undefined,
    };
  }
  const retryAfter = Number(
    response?.headers.get("retry-after") ?? response?.headers.get("x-retry-after"),
  );
  return {
    ...token,
    accessTokenError:
      response?.status === 429 ? "RefreshRateLimited" : "RefreshAccessTokenError",
    refreshRetryAt:
      now +
      (Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : REFRESH_RETRY_MS),
  };
}
