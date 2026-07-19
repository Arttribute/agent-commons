"use client";
import React, { createContext, useContext, useEffect, useMemo } from "react";
import {
  signOut as commonsSignOut,
  useSession,
} from "next-auth/react";
import { DEFAULT_AUTH_CALLBACK } from "@/lib/auth-callback";

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
  const { data: session, status, update } = useSession();
  const ready = status !== "loading";
  const authenticated = status === "authenticated";

  // Derive this compatibility shape synchronously. Copying it in an effect
  // used to add another anonymous render after NextAuth had resolved the user.
  const authState = useMemo<AuthState>(() => {
    if (!authenticated || !session?.user?.id) return {};
    return {
      idToken: "commons-session",
      username:
        session.user.name ||
        session.user.email ||
        session.user.id.slice(0, 12),
      // Legacy UI calls this walletAddress, but it is the stable Commons user
      // principal. On-chain actions still require a connected wallet.
      walletAddress: session.user.id,
      profileImage: session.user.image || "",
      userId: session.user.id,
      workspaceId: session.user.workspaceId,
    };
  }, [authenticated, session]);

  // Keep the compatibility cache in sync for non-React integrations. It is
  // never read as proof of authentication.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      localStorage.removeItem("authState");
      return;
    }
    localStorage.setItem("authState", JSON.stringify(authState));
  }, [ready, authenticated, authState]);

  // 2) Provide login, logout, and refresh
  const login = async () => {
    if (typeof window !== "undefined") {
      window.location.assign(
        `/api/auth/native/start?direct=1&callbackUrl=${encodeURIComponent(DEFAULT_AUTH_CALLBACK)}`,
      );
    }
  };

  const logout = async () => {
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
