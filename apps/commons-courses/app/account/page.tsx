"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/nav";

type AccountUser = {
  name: string;
  email: string;
  role?: string;
  emailVerifiedAt?: string;
  authProvider?: string;
  hasPassword: boolean;
};

export default function AccountPage() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user || null));
  }, []);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/account/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not update password.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password updated.");
    setUser(user ? { ...user, hasPassword: true } : user);
  }

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="text-sm font-bold text-slate-500">
          Back to dashboard
        </Link>
        <h1 className="mb-8 mt-4 text-3xl font-bold text-slate-950">
          Account
        </h1>

        <section className="mb-6 rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold text-slate-900">Profile</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-600">
            <p>
              <span className="font-bold text-slate-900">Name:</span>{" "}
              {user?.name || "Loading..."}
            </p>
            <p>
              <span className="font-bold text-slate-900">Email:</span>{" "}
              {user?.email || "Loading..."}
            </p>
            <p>
              <span className="font-bold text-slate-900">Email status:</span>{" "}
              {user?.emailVerifiedAt ? "Verified" : "Not verified"}
            </p>
            <p>
              <span className="font-bold text-slate-900">Sign-in:</span>{" "}
              {user?.authProvider === "google" ? "Google" : "Email and password"}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold text-slate-900">Password</h2>
          <p className="mt-1 text-sm text-slate-500">
            {user?.hasPassword
              ? "Change your password."
              : "Add a password so you can sign in without Google."}
          </p>
          <form onSubmit={updatePassword} className="mt-5 space-y-4">
            {user?.hasPassword && (
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            )}
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            {message && <p className="text-sm text-lime-700">{message}</p>}
            <button
              disabled={saving}
              className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save password"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
