export const SIGNUP_CREDITS_START_AT = new Date("2026-11-17T00:00:00+03:00");

type Database = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};
type Signup = { id: string; createdAt: Date | string };
type Delivery = { user_id: string; signed_up_at: Date | string };

export async function enqueueSignupCredits(database: Database, user: Signup) {
  const createdAt = new Date(user.createdAt);
  if (createdAt < SIGNUP_CREDITS_START_AT) return;
  await database.query(
    `insert into commons_signup_credit_grant (user_id, signed_up_at)
     values ($1, $2) on conflict (user_id) do nothing`,
    [user.id, createdAt],
  );
}

/** Pending deliveries survive signup failures, process restarts and API outages. */
export function signupCreditDelivery(
  database: Database,
  env = process.env,
  fetcher = fetch,
) {
  let token: { value: string; expiresAt: number } | undefined;
  let running = false;
  async function accessToken() {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value;
    const response = await fetcher(
      `${env.COMMONS_IDENTITY_ISSUER}/oauth2/token`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${env.SIGNUP_CREDITS_CLIENT_ID}:${env.SIGNUP_CREDITS_CLIENT_SECRET}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "credits:write",
          resource: "commons-platform",
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error("Signup credit service authentication failed");
    const result = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!result.access_token)
      throw new Error("Signup credit service returned no token");
    token = {
      value: result.access_token,
      expiresAt:
        Date.now() + Math.min(Number(result.expires_in) || 600, 600) * 1000,
    };
    return token.value;
  }

  return async function deliver(userId?: string) {
    if (
      !env.SIGNUP_CREDITS_API_URL ||
      !env.SIGNUP_CREDITS_CLIENT_ID ||
      !env.SIGNUP_CREDITS_CLIENT_SECRET
    )
      return;
    if (running && !userId) return;
    if (!userId) running = true;
    try {
      const pending = await database.query(
        `select user_id, signed_up_at from commons_signup_credit_grant
         where delivered_at is null and ($1::text is null or user_id = $1)
           and ($1::text is not null or signed_up_at < $2)
           and (last_attempt_at is null or last_attempt_at < $2)
         order by signed_up_at limit 25`,
        [userId ?? null, new Date(Date.now() - 30_000)],
      );
      for (const row of pending.rows) {
        const delivery = row as Delivery;
        try {
          const claimed = await database.query(
            `update commons_signup_credit_grant set attempts = attempts + 1, last_attempt_at = $2
             where user_id = $1 and delivered_at is null
               and (last_attempt_at is null or last_attempt_at < $3)
             returning user_id`,
            [delivery.user_id, new Date(), new Date(Date.now() - 30_000)],
          );
          if (!claimed.rows.length) continue;
          const response = await fetcher(
            `${env.SIGNUP_CREDITS_API_URL.replace(/\/$/, "")}/v1/credits/signup`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${await accessToken()}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                principalId: delivery.user_id,
                signedUpAt: new Date(delivery.signed_up_at).toISOString(),
              }),
              signal: AbortSignal.timeout(15_000),
            },
          );
          if (!response.ok) {
            if (response.status === 401) token = undefined;
            throw new Error(
              `Signup credit delivery returned ${response.status}`,
            );
          }
          const result = (await response.json()) as {
            data?: { principalId?: string; entryId?: string };
          };
          if (
            result.data?.principalId !== delivery.user_id ||
            !result.data.entryId
          )
            throw new Error("Invalid signup credit acknowledgement");
          await database.query(
            `update commons_signup_credit_grant set delivered_at = now() where user_id = $1`,
            [delivery.user_id],
          );
        } catch {
          console.error("Signup credit delivery deferred", {
            userId: delivery.user_id,
          });
        }
      }
    } catch {
      console.error("Signup credit queue unavailable");
    } finally {
      if (!userId) running = false;
    }
  };
}
