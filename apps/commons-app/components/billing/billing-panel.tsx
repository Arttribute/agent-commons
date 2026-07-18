"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Gift, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type PlanKey = "free" | "plus" | "pro" | "max";

type Subscription = {
  planKey: PlanKey;
  planName: string;
  monthlyCredits: number;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  entitlements: {
    maxComputerAgents: number;
    maxConcurrentComputers: number;
    maxConcurrentRuns: number;
  };
};

type CreditSummary = {
  balance: { balance: number; reserved: number; available: number };
  month: { earned: number; spent: number };
  recent: Array<{
    entryId: string;
    amount: number;
    eventType: string;
    description?: string | null;
    createdAt: string;
  }>;
};

type Invoice = {
  id: string;
  created: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
};

type Catalog = {
  topups: Array<{ key: string; priceUsd: number; credits: number }>;
};

function messageFrom(payload: any, fallback: string) {
  const value = payload?.message ?? payload?.error?.message ?? payload?.error;
  return typeof value === "string" ? value : fallback;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function BillingPanel() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [giftAmount, setGiftAmount] = useState("50");
  const [giftMessage, setGiftMessage] = useState("");

  const load = useCallback(async () => {
    const [subscriptionRes, creditsRes, invoicesRes, catalogRes] =
      await Promise.all([
        fetch("/api/billing/subscription", { cache: "no-store" }),
        fetch("/api/credits", { cache: "no-store" }),
        fetch("/api/billing/invoices", { cache: "no-store" }),
        fetch("/api/billing/catalog", { cache: "no-store" }),
      ]);
    setSubscription(
      (await subscriptionRes.json().catch(() => ({})))?.data ?? null,
    );
    setSummary((await creditsRes.json().catch(() => ({})))?.data ?? null);
    setInvoices((await invoicesRes.json().catch(() => ({})))?.data ?? []);
    setCatalog((await catalogRes.json().catch(() => ({})))?.data ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balance = summary?.balance.available ?? 0;
  const renewal = useMemo(
    () =>
      subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
    [subscription?.currentPeriodEnd],
  );

  async function post(path: string, body: unknown, tag: string) {
    setBusy(tag);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(messageFrom(payload, "That could not be completed."));
      if (payload?.data?.url) {
        window.location.href = payload.data.url;
        return;
      }
      await load();
      return payload;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That could not be completed.",
      );
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function sendGift(event: FormEvent) {
    event.preventDefault();
    try {
      await post(
        "/api/credits/gifts",
        {
          recipientEmail: recipientEmail.trim(),
          amount: Number(giftAmount),
          message: giftMessage.trim() || undefined,
          idempotencyKey: `web-gift:${crypto.randomUUID()}`,
        },
        "gift",
      );
      setRecipientEmail("");
      setGiftMessage("");
      setNotice("Gift sent. 🎁");
    } catch {
      // The shared notice already contains the actionable API error.
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Credits &amp; billing
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
            Credits pay for the work your agents do. Your plan controls how
            many can keep a persistent computer.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/plans")}>
          Compare plans
        </Button>
      </header>

      {notice ? (
        <div className="rounded-xl border bg-white px-4 py-3 text-sm shadow-card">
          {notice}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-6 shadow-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" /> Available credits
        </div>
        <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">
          {summary ? balance.toLocaleString() : "—"}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>
            +{(summary?.month.earned ?? 0).toLocaleString()} earned this month
          </span>
          <span>−{(summary?.month.spent ?? 0).toLocaleString()} used</span>
          {summary?.balance.reserved ? (
            <span>
              {summary.balance.reserved.toLocaleString()} in active runs
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-medium">
              {subscription?.planName ?? "Free"}
              <Badge variant="secondary">{subscription?.status ?? "free"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscription?.monthlyCredits
                ? `${subscription.monthlyCredits.toLocaleString()} credits each month`
                : "Earn credits through daily use and platform rewards"}
              {renewal
                ? ` · ${subscription?.cancelAtPeriodEnd ? "Ends" : "Renews"} ${renewal}`
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {subscription?.planKey !== "free" ? (
              <Button
                variant="outline"
                onClick={() =>
                  void post("/api/billing/portal", {}, "portal").catch(
                    () => undefined,
                  )
                }
                disabled={busy !== null}
              >
                Manage billing
              </Button>
            ) : null}
            <Button onClick={() => router.push("/plans")}>
              {subscription?.planKey === "free" ? "Upgrade" : "Change plan"}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t pt-5 text-sm sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">Agents</div>
            <div className="mt-1 font-medium">Unlimited</div>
          </div>
          <div>
            <div className="text-muted-foreground">Computer slots</div>
            <div className="mt-1 font-medium">
              {subscription?.entitlements.maxComputerAgents ?? 0}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Parallel runs</div>
            <div className="mt-1 font-medium">
              {subscription?.entitlements.maxConcurrentRuns ?? 2}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-medium">Add credits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One-time packs never create a subscription.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(catalog?.topups ?? []).map((pack) => (
            <button
              key={pack.key}
              className="rounded-xl border bg-white p-4 text-left shadow-card transition-colors hover:border-stone-400 disabled:opacity-50"
              disabled={busy !== null}
              onClick={() =>
                void post(
                  "/api/billing/checkout/topup",
                  { packKey: pack.key },
                  `topup-${pack.key}`,
                ).catch(() => undefined)
              }
            >
              <div className="flex items-center justify-between font-medium">
                ${pack.priceUsd}
                {busy === `topup-${pack.key}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {pack.credits.toLocaleString()} credits
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-card">
        <div className="flex items-center gap-2 font-medium">
          <Gift className="h-4 w-4" /> Gift credits
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Send credits from your balance to a friend&rsquo;s Agent Commons
          account.
        </p>
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_auto]"
          onSubmit={sendGift}
        >
          <Input
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            type="email"
            placeholder="friend@example.com"
            required
          />
          <Input
            value={giftAmount}
            onChange={(event) => setGiftAmount(event.target.value)}
            type="number"
            min={10}
            step={1}
            required
          />
          <Button disabled={busy !== null || !recipientEmail.trim()}>
            {busy === "gift" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Send gift"
            )}
          </Button>
          <Input
            className="sm:col-span-3"
            value={giftMessage}
            onChange={(event) => setGiftMessage(event.target.value)}
            maxLength={240}
            placeholder="Add a note (optional)"
          />
        </form>
      </section>

      <section>
        <h2 className="font-medium">Recent activity</h2>
        <div className="mt-4 divide-y rounded-xl border bg-white shadow-card">
          {(summary?.recent ?? []).length ? (
            summary?.recent.map((entry) => (
              <div
                key={entry.entryId}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {entry.description || entry.eventType.replaceAll("_", " ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                </div>
                <div
                  className={`font-medium tabular-nums ${entry.amount > 0 ? "text-emerald-600" : ""}`}
                >
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount.toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No credit activity yet.
            </div>
          )}
        </div>
      </section>

      {invoices.length ? (
        <section>
          <h2 className="font-medium">Invoices</h2>
          <div className="mt-4 divide-y rounded-xl border bg-white shadow-card">
            {invoices.slice(0, 5).map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  {invoice.created
                    ? new Date(invoice.created).toLocaleDateString()
                    : "—"}
                </span>
                <span>
                  {formatMoney(
                    invoice.amountPaid || invoice.amountDue,
                    invoice.currency,
                  )}
                </span>
                {invoice.hostedInvoiceUrl ? (
                  <a
                    className="text-indigo-600 hover:underline"
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
