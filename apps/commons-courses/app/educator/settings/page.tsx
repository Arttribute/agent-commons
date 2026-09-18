"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ConsolePage } from "@/components/educator/console-page";
import { Field, FieldGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Card, Disclosure, PageHeader } from "@/components/ui/surface";
import { SaveBar } from "@/components/ui/save-bar";
import { Segmented } from "@/components/ui/tabs";

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
  const { update } = useSession();
  const [profile, setProfile] = useState<Profile>({ settlementMode: "platform_rails" });
  const [saved, setSaved] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<"profile" | "payouts">("profile");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/educator/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile);
          setSaved(JSON.stringify(data.profile));
        } else {
          setIsNew(true);
        }
      })
      .catch(() => {});
  }, []);

  const patch = (value: Partial<Profile>) => setProfile((current) => ({ ...current, ...value }));
  const dirty = JSON.stringify(profile) !== saved;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const res = await fetch("/api/educator/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(JSON.stringify(profile));
      await update({ user: { role: "educator" } });
      if (isNew) router.push("/educator");
    }
  }

  return (
    <ConsolePage width="narrow">
      <PageHeader title={isNew ? "Set up your educator profile" : "Settings"} />
      <form onSubmit={onSubmit} className="space-y-5">
        <Segmented
          items={[
            { value: "profile", label: "Profile" },
            { value: "payouts", label: "Payouts" },
          ]}
          value={view}
          onChange={setView}
        />
        {view === "profile" ? (
          <Card className="space-y-4">
            <FieldGrid>
              <Field label="Display name">
                <Input
                  required
                  value={profile.displayName || ""}
                  onChange={(event) => patch({ displayName: event.target.value })}
                />
              </Field>
              <Field label="Organization" optional>
                <Input
                  value={profile.organization || ""}
                  onChange={(event) => patch({ organization: event.target.value })}
                />
              </Field>
            </FieldGrid>
            <Field label="Bio" optional>
              <Textarea rows={4} value={profile.bio || ""} onChange={(event) => patch({ bio: event.target.value })} />
            </Field>
          </Card>
        ) : (
          <Card className="space-y-4">
            <FieldGrid>
              <Field label="Payout email">
                <Input
                  value={profile.payoutEmail || ""}
                  onChange={(event) => patch({ payoutEmail: event.target.value })}
                />
              </Field>
              <Field label="Payout phone" optional>
                <Input
                  value={profile.payoutPhone || ""}
                  onChange={(event) => patch({ payoutPhone: event.target.value })}
                />
              </Field>
            </FieldGrid>
            <Field
              label="Settlement"
              info="Agent Commons rails collect payments and pay you out. Direct rails send payments to your own Paystack or Stripe account."
            >
              <Select
                value={profile.settlementMode || "platform_rails"}
                onChange={(event) => patch({ settlementMode: event.target.value as Profile["settlementMode"] })}
              >
                <option value="platform_rails">Agent Commons payment rails</option>
                <option value="educator_direct">My own payment accounts</option>
              </Select>
            </Field>
            <Disclosure
              title="Payment accounts"
              summary={
                [profile.paystackSubaccountCode ? "Paystack" : null, profile.stripeAccountId ? "Stripe" : null]
                  .filter(Boolean)
                  .join(" · ") || "Paystack subaccount and Stripe connected account"
              }
            >
              <FieldGrid>
                <Field label="Paystack subaccount code" optional>
                  <Input
                    value={profile.paystackSubaccountCode || ""}
                    onChange={(event) => patch({ paystackSubaccountCode: event.target.value })}
                  />
                </Field>
                <Field label="Stripe connected account" optional>
                  <Input
                    value={profile.stripeAccountId || ""}
                    onChange={(event) => patch({ stripeAccountId: event.target.value })}
                  />
                </Field>
              </FieldGrid>
            </Disclosure>
          </Card>
        )}
        <SaveBar type="submit" dirty={dirty || isNew} saving={saving} label={isNew ? "Continue" : "Save changes"} />
      </form>
    </ConsolePage>
  );
}
