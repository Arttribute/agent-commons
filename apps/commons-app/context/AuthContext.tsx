"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signOut as commonsSignOut,
  useSession,
} from "next-auth/react";

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
  const { data: session, status } = useSession();
  const ready = status !== "loading";
  const authenticated = status === "authenticated";

  const [authState, setAuthState] = useState<AuthState>({});

  // 1) On mount or changes in `user`, store needed details in localStorage
  useEffect(() => {
    if (!ready) return;

    // If not authenticated, clear everything
    if (!authenticated || !session?.user) {
      localStorage.removeItem("authState");
      setAuthState({});
      return;
    }

    // If authenticated, gather user data
    const storeAuthData = async () => {
      try {
        const username =
          session.user.name ||
          session.user.email ||
          session.user.id.slice(0, 12);
        // During the compatibility window, walletAddress doubles as the
        // principal identifier in older UI code. Real onchain actions must
        // still require an actual connected Privy wallet.
        const walletAddress = session.user.id;
        const profileImage = session.user.image || "";

        const newState: AuthState = {
          idToken: "commons-session",
          username,
          walletAddress,
          profileImage,
          userId: session.user.id,
          workspaceId: session.user.workspaceId,
        };

        setAuthState(newState);
        localStorage.setItem("authState", JSON.stringify(newState));
      } catch (error) {
        console.error("Error retrieving or storing tokens:", error);
      }
    };

    storeAuthData();
  }, [ready, authenticated, session]);

  // 2) Provide login, logout, and refresh
  const login = async () => {
    if (typeof window !== "undefined") {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      window.location.assign(
        `/api/auth/native/start?direct=1&callbackUrl=${encodeURIComponent(callbackUrl || "/agents")}`,
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
    // If you want to refresh from localStorage → set state
    const stored = localStorage.getItem("authState");
    if (stored) {
      const parsed = JSON.parse(stored) as AuthState;
      setAuthState(parsed);
    }
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
