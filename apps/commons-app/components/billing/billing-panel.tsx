"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, CreditCard } from "lucide-react";

type PlanKey = "free" | "plus" | "pro" | "max";

interface Subscription {
  planKey: PlanKey;
  planName: string;
  monthlyCredits: number;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface CreditsData {
  balance: { balance: number } | null;
  ledger: Array<{
    entryId: string;
    amount: number;
    eventType: string;
    description?: string | null;
    createdAt: string;
  }>;
}

interface Invoice {
  id: string;
  number: string | null;
  created: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

const TOPUPS = [
  { key: "small", label: "$10", credits: "10,000" },
  { key: "medium", label: "$50", credits: "52,500" },
  { key: "large", label: "$100", credits: "110,000" },
];

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

// ── Section shell ───────────────────────────────────────────────────────────
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BillingPanel() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pms, setPms] = useState<{
    defaultPaymentMethodId: string | null;
    paymentMethods: PaymentMethod[];
  }>({ defaultPaymentMethodId: null, paymentMethods: [] });
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, credRes, invRes, pmRes, meRes] = await Promise.all([
        fetch("/api/billing/subscription", { cache: "no-store" }),
        fetch("/api/credits", { cache: "no-store" }),
        fetch("/api/billing/invoices", { cache: "no-store" }),
        fetch("/api/billing/payment-methods", { cache: "no-store" }),
        fetch("/api/auth/session", { cache: "no-store" }),
      ]);
      setSub((await subRes.json().catch(() => ({})))?.data ?? null);
      setCredits((await credRes.json().catch(() => ({}))) ?? null);
      setInvoices((await invRes.json().catch(() => ({})))?.data ?? []);
      setPms(
        (await pmRes.json().catch(() => ({})))?.data ?? {
          defaultPaymentMethodId: null,
          paymentMethods: [],
        },
      );
      setEmail((await meRes.json().catch(() => ({})))?.user?.email ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redirectTo(path: string, body: unknown, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.url) window.location.href = json.data.url as string;
      else setBusy(null);
    } catch {
      setBusy(null);
    }
  }

  const currentPlan = sub?.planKey ?? "free";
  const currentPlanName = sub?.planName ?? "Free";
  const isPaid = currentPlan !== "free";
  const balance = credits?.balance?.balance ?? 0;
  const renew = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Billing &amp; credits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Credits cover model usage and agent computer time.
          </p>
        </div>
        <Image
          src="/logo.jpg"
          alt="Agent Commons"
          width={110}
          height={28}
          className="shrink-0"
        />
      </div>

      {/* Current plan */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-medium">Agent Commons {currentPlanName}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : sub?.cancelAtPeriodEnd && renew
                ? `Cancels on ${renew}`
                : isPaid && renew
                  ? `Your plan auto-renews on ${renew}`
                  : "Free plan — 500 credits per month"}
          </div>
        </div>
        <Button variant="outline" onClick={() => router.push("/plans")}>
          {isPaid ? "Change plan" : "Upgrade"}
        </Button>
      </div>

      {/* Credits */}
      <Section title="Credits">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="text-sm text-muted-foreground">Balance</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">
              {loading ? "—" : balance.toLocaleString()}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Credits cover model usage and agent computer time.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {TOPUPS.map((t) => (
              <Button
                key={t.key}
                variant="outline"
                size="sm"
                disabled={busy !== null}
                title={`${t.credits} credits`}
                onClick={() =>
                  redirectTo(
                    "/api/billing/checkout/topup",
                    { packKey: t.key },
                    `topup-${t.key}`,
                  )
                }
              >
                {busy === `topup-${t.key}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Add ${t.label}`
                )}
              </Button>
            ))}
          </div>
        </div>
      </Section>

      {/* Payment methods */}
      <Section
        title="Payment methods"
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => redirectTo("/api/billing/portal", {}, "portal-pm")}
          >
            {busy === "portal-pm" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add new"
            )}
          </Button>
        }
      >
        {pms.paymentMethods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payment method on file.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {pms.paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium capitalize">
                      {pm.brand} •••• {pm.last4}
                    </div>
                    {pm.expMonth && (
                      <div className="text-xs text-muted-foreground">
                        Expires {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                      </div>
                    )}
                  </div>
                </div>
                {pm.id === pms.defaultPaymentMethodId && (
                  <Badge variant="secondary">Default</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Billing history */}
      <Section
        title="Billing history"
        action={
          invoices.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => redirectTo("/api/billing/portal", {}, "portal-hist")}
            >
              {busy === "portal-hist" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "View all"
              )}
            </Button>
          ) : undefined
        }
      >
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {inv.created
                    ? new Date(inv.created).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </span>
                <span className="tabular-nums">
                  {money(inv.amountPaid || inv.amountDue, inv.currency)}
                </span>
                <Badge
                  variant={inv.status === "paid" ? "secondary" : "outline"}
                  className={cn(
                    inv.status === "paid" &&
                      "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {inv.status ?? "—"}
                </Badge>
                {inv.hostedInvoiceUrl ? (
                  <a
                    href={inv.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Billing information */}
      <Section
        title="Billing information"
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => redirectTo("/api/billing/portal", {}, "portal-info")}
          >
            {busy === "portal-info" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Edit"
            )}
          </Button>
        }
      >
        <div className="text-sm">
          <div className="text-muted-foreground">Billing email</div>
          <div className="mt-0.5">{email ?? "—"}</div>
        </div>
      </Section>

      {/* Cancel plan */}
      {isPaid && !sub?.cancelAtPeriodEnd && (
        <Section title="Cancel plan">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              If you cancel, you&apos;ll keep full access to your plan features
              until the end of your billing period.
            </p>
            <Button
              variant="outline"
              className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={busy !== null}
              onClick={() => redirectTo("/api/billing/portal", {}, "portal-cancel")}
            >
              {busy === "portal-cancel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Cancel"
              )}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}
