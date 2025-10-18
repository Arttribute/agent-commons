"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

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
  // Get user + login + logout from Privy
  const {
    ready,
    authenticated,
    user, // The user object from Privy
    login: privyLogin,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy();

  const [authState, setAuthState] = useState<AuthState>({});

  // 1) On mount or changes in `user`, store needed details in localStorage
  useEffect(() => {
    if (!ready) return;

    // If not authenticated, clear everything
    if (!authenticated || !user) {
      localStorage.removeItem("authState");
      setAuthState({});
      return;
    }

    // If authenticated, gather user data
    const storeAuthData = async () => {
      try {
        // If you have Privy’s identity token enabled, you can fetch that:
        // 1. token = user.identityToken
        // Or simply get the user’s access token if you prefer:
        const token = await getAccessToken();

        // Basic details from user
        const username =
          user.email?.address ||
          user.google?.email ||
          user.discord?.username ||
          user.wallet?.address ||
          user.id.slice(0, 10); // fallback

        const walletAddress = user.wallet?.address;
        const profileImage =
          user.google?.picture ||
          user.discord?.picture ||
          user.twitter?.picture ||
          ""; // fallback or handle differently

        const newState: AuthState = {
          idToken: token, // or identity token if you enabled that
          username,
          walletAddress,
          profileImage,
        };

        setAuthState(newState);
        localStorage.setItem("authState", JSON.stringify(newState));
      } catch (error) {
        console.error("Error retrieving or storing tokens:", error);
      }
    };

    storeAuthData();
  }, [ready, authenticated, user, getAccessToken]);

  // 2) Provide login, logout, and refresh
  const login = async () => {
    try {
      await privyLogin();
      // After login completes, the `useEffect` above will run
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const logout = async () => {
    try {
      await privyLogout();
      // `useEffect` will clear local storage
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
