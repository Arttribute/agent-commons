"use client";

import { usePathname } from "next/navigation";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { CanvasChat } from "@/components/canvas/canvas-chat";
import { LibraryNavigator } from "@/components/library/library-navigator";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";

/**
 * An open artifact fills the page: the main sidebar becomes a rail, the file
 * list sits beside it, and the chat stays mounted while moving between files.
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  if (!/^\/library\/[^/]+/.test(pathname)) return <>{children}</>;
  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={userAddress} />
        <LibraryNavigator />
        <main className="min-h-0 relative min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CanvasChat />
    </div>
  );
}
