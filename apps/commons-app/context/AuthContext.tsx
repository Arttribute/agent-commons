"use client";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DesktopAccount } from "@agent-commons/desktop-contract";
import {
  signOut as commonsSignOut,
  useSession,
} from "next-auth/react";
import { DEFAULT_AUTH_CALLBACK } from "@/lib/auth-callback";
import { useWorkspaceMode } from "./WorkspaceModeContext";

declare module "@privy-io/react-auth" {
  interface Google {
    picture?: string;
  }

  interface Discord {
    picture?: string;
  }

  interface Twitter {
    picture?: string;
  }
}

// Define the shape of the data we'll store about the user
export interface AuthState {
  idToken?: string | null;
  username?: string;
  email?: string;
  walletAddress?: string;
  profileImage?: string;
  userId?: string;
  workspaceId?: string;
  // Feel free to add other fields
  // ...
}

// The context value we'll expose
interface AuthContextValue {
  authState: AuthState;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>; // e.g. to refresh from localStorage or from Privy
  ready: boolean;
  authenticated: boolean;
}

// Create a React Context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { mode, setMode } = useWorkspaceMode();
  const [localAccount, setLocalAccount] = useState<DesktopAccount | undefined>();
  const { data: session, status, update } = useSession();
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === "private-local" && mode === "cloud") void update();
    previousMode.current = mode;
  }, [mode, update]);
  const local = mode === "private-local";
  const ready = local || status !== "loading";
  const authenticated = local || status === "authenticated";

  useEffect(() => {
    if (!local || !window.agentCommonsLocal) return;
    const bridge = window.agentCommonsLocal;
    void bridge.getState().then((state) => setLocalAccount(state.account)).catch(() => undefined);
    return bridge.onEvent((event) => {
      if (event.type === "state") setLocalAccount(event.state.account);
    });
  }, [local]);

  // Derive this compatibility shape synchronously. Copying it in an effect
  // used to add another anonymous render after NextAuth had resolved the user.
  const authState = useMemo<AuthState>(() => {
    if (local) {
      const id = localAccount?.userId ?? "local-workspace";
      return {
        idToken: "local-workspace",
        username: localAccount?.displayName ?? "Local workspace",
        email: localAccount?.email,
        walletAddress: id,
        userId: id,
      };
    }
    if (!authenticated || !session?.user?.id) return {};
    return {
      idToken: "commons-session",
      username:
        session.user.name ||
        session.user.email ||
        session.user.id.slice(0, 12),
      email: session.user.email || undefined,
      // Legacy UI calls this walletAddress, but it is the stable Commons user
      // principal. On-chain actions still require a connected wallet.
      walletAddress: session.user.id,
      profileImage: session.user.image || "",
      userId: session.user.id,
      workspaceId: session.user.workspaceId,
    };
  }, [authenticated, session, local, localAccount]);

  // Keep the compatibility cache in sync for non-React integrations. It is
  // never read as proof of authentication.
  useEffect(() => {
    if (local) return;
    if (!ready) return;
    if (!authenticated) {
      localStorage.removeItem("authState");
      return;
    }
    localStorage.setItem("authState", JSON.stringify(authState));
  }, [ready, authenticated, authState, local]);

  // 2) Provide login, logout, and refresh
  const login = async () => {
    if (typeof window !== "undefined") {
      if (local) await setMode("cloud");
      if (window.agentCommonsDesktop) {
        await window.agentCommonsDesktop.beginSignIn();
        return;
      }
      window.location.assign(
        `/api/auth/native/start?direct=1&callbackUrl=${encodeURIComponent(DEFAULT_AUTH_CALLBACK)}`,
      );
    }
  };

  const logout = async () => {
    if (local) {
      await setMode("cloud");
      return;
    }
    try {
      await commonsSignOut({ callbackUrl: "/" });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const refresh = async () => {
    await update();
  };

  const value: AuthContextValue = {
    authState,
    login,
    logout,
    refresh,
    ready,
    authenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
