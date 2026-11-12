import { NextResponse } from "next/server";
import { requireEducator } from "./educator-auth";

/** Forward only this signed-in educator's own Commons credential. */
export async function educatorProjectCredentials() {
  const auth = await requireEducator();
  if (auth.error) return { error: auth.error };
  if (
    !auth.session.accessToken ||
    auth.session.accessTokenError ||
    !auth.session.identityUserId
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            "Sign in with your Commons account again to manage programmes.",
        },
        { status: 401 },
      ),
    };
  }
  return {
    headers: {
      Authorization: `Bearer ${auth.session.accessToken}`,
      "Content-Type": "application/json",
    },
    ownerId: auth.session.identityUserId,
  };
}
