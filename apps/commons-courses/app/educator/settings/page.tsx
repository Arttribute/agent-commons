"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";

type Profile = {
  displayName?: string;
  bio?: string;
  organization?: string;
  payoutEmail?: string;
  payoutPhone?: string;
  settlementMode?: "platform_rails" | "educator_direct";
  paystackSubaccountCode?: string;
  stripeAccountId?: string;
};

export default function EducatorSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({ settlementMode: "platform_rails" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/educator/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => {});
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const res = await fetch("/api/educator/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    if (res.ok) router.push("/educator");
  }

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          Educator settings
        </p>
        <h1 className="mb-8 text-3xl font-bold text-slate-950">
          Profile and payout setup
        </h1>

        <form onSubmit={onSubmit} className="space-y-5">
          <Field
            label="Display name"
            value={profile.displayName || ""}
            onChange={(value) => setProfile({ ...profile, displayName: value })}
            required
          />
          <Field
            label="Organization"
            value={profile.organization || ""}
            onChange={(value) => setProfile({ ...profile, organization: value })}
          />
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Bio</span>
            <textarea
              value={profile.bio || ""}
              onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
              className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Payout email"
              value={profile.payoutEmail || ""}
              onChange={(value) => setProfile({ ...profile, payoutEmail: value })}
            />
            <Field
              label="Payout phone"
              value={profile.payoutPhone || ""}
              onChange={(value) => setProfile({ ...profile, payoutPhone: value })}
            />
          </div>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Settlement mode</span>
            <select
              value={profile.settlementMode || "platform_rails"}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  settlementMode: event.target.value as Profile["settlementMode"],
                })
              }
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            >
              <option value="platform_rails">Agent Commons payment rails</option>
              <option value="educator_direct">Educator direct payment rails</option>
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Paystack subaccount code"
              value={profile.paystackSubaccountCode || ""}
              onChange={(value) =>
                setProfile({ ...profile, paystackSubaccountCode: value })
              }
            />
            <Field
              label="Stripe connected account"
              value={profile.stripeAccountId || ""}
              onChange={(value) => setProfile({ ...profile, stripeAccountId: value })}
            />
          </div>
          <button
            disabled={saving}
            className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}
