"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-bold">Sign in to Agent Commons</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Your Commons account works across Courses, Agent Commons, Common OS,
        and the CLI.
      </p>
      <button
        className="rounded-md bg-black px-4 py-3 font-semibold text-white"
        onClick={() => signIn("commons", { callbackUrl: "/agents" })}
      >
        Continue with Commons
      </button>
    </main>
  );
}
