"use client";
import React from "react";
import { useAuth } from "@/context/AuthContext"; // the file we created
import AppBar from "@/components/layout/AppBar";

export default function HomePage() {
  const { authState, login, logout } = useAuth();
  const { idToken, username, walletAddress, profileImage } = authState;

  const isAuthenticated = !!idToken;

  return (
    <div>
      <AppBar />
      <div className="min-h-screen  mt-16">
        <h1>Welcome to My Next.js + Privy App</h1>

        {isAuthenticated ? (
          <>
            <div style={{ margin: "20px 0" }}>
              <img
                src={profileImage ?? ""}
                alt="profile"
                style={{ width: 80, height: 80, borderRadius: "50%" }}
              />
              <p>
                <strong>Username:</strong> {username}
              </p>
              <p>
                <strong>Wallet:</strong> {walletAddress}
              </p>
              <p>
                <strong>ID Token:</strong> {idToken?.slice(0, 20)}...{" "}
              </p>
            </div>

            <button onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <p>You are not logged in</p>
            <button onClick={login}>Login with Privy</button>
          </>
        )}
      </div>
    </div>
  );
}
