import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { normalizePrincipalId } from "@/lib/principal-id";

export type CurrentCommonsUser = {
  userId: string;
  workspaceId?: string;
};

export async function getCurrentCommonsUser(): Promise<CurrentCommonsUser | null> {
  const session = await auth();
  const userId = normalizePrincipalId(session?.user?.id);
  if (!userId) return null;
  return {
    userId,
    workspaceId: session?.user?.workspaceId,
  };
}

export async function requireCurrentCommonsUser() {
  const user = await getCurrentCommonsUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}
