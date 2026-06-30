import type { Session } from "next-auth";
import User from "@/models/User";

export type CommonsPrincipal = {
  identityUserId: string;
  identityWorkspaceId?: string;
};

export async function getCommonsPrincipal(
  session: Session | null,
): Promise<CommonsPrincipal | null> {
  const sessionUser = session?.user as
    | {
        id?: string;
        identityUserId?: string;
        identityWorkspaceId?: string;
        workspaceId?: string;
      }
    | undefined;

  if (sessionUser?.identityUserId) {
    return {
      identityUserId: sessionUser.identityUserId,
      identityWorkspaceId:
        sessionUser.identityWorkspaceId || sessionUser.workspaceId,
    };
  }

  if (!sessionUser?.id) return null;
  const user = await User.findById(sessionUser.id)
    .select("identityUserId identityWorkspaceId")
    .lean<{ identityUserId?: string; identityWorkspaceId?: string }>();

  if (!user?.identityUserId) return null;
  return {
    identityUserId: user.identityUserId,
    identityWorkspaceId: user.identityWorkspaceId,
  };
}
