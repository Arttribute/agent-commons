"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Copy,
  Gift,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";

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
  campaigns: Array<{
    campaignKey: string;
    name: string;
    description?: string | null;
    rewardCredits: number;
    claimable: boolean;
    claimed: boolean;
  }>;
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
  const { authState } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
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

  const daily = summary?.campaigns.find(
    (item) => item.campaignKey === "daily-check-in",
  );
  const balance = summary?.balance.available ?? 0;
  const principalId = normalizePrincipalId(authState.walletAddress);
  const renewal = useMemo(
    () =>
      subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString(
            undefined,
            {
              month: "short",
              day: "numeric",
              year: "numeric",
            },
          )
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

  async function claimDaily() {
    try {
      await post("/api/credits/daily", {}, "daily");
      setNotice(`Added ${daily?.rewardCredits ?? 10} credits.`);
    } catch {
      // The shared notice already contains the actionable API error.
    }
  }

  async function claimCampaign(campaignKey: string, rewardCredits: number) {
    try {
      await post(
        "/api/credits/campaigns/claim",
        { campaignKey },
        `campaign-${campaignKey}`,
      );
      setNotice(`Added ${rewardCredits.toLocaleString()} credits.`);
    } catch {
      // The shared notice already contains the actionable API error.
    }
  }

  async function sendGift(event: FormEvent) {
    event.preventDefault();
    try {
      await post(
        "/api/credits/gifts",
        {
          recipientPrincipalId: recipient.trim(),
          amount: Number(giftAmount),
          message: giftMessage.trim() || undefined,
          idempotencyKey: `web-gift:${crypto.randomUUID()}`,
        },
        "gift",
      );
      setRecipient("");
      setGiftMessage("");
      setNotice("Gift sent.");
    } catch {
      // The shared notice already contains the actionable API error.
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-16">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Account</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Credits & billing
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Create as many agents as you like. Credits pay for the work they do;
            your plan controls how many can keep a persistent computer.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/plans")}>
          Compare plans
        </Button>
      </header>

      {notice ? (
        <div className="rounded-xl border bg-white px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Available credits</span>
            {summary?.balance.reserved ? (
              <span className="text-xs text-slate-400">
                {summary.balance.reserved.toLocaleString()} in active runs
              </span>
            ) : null}
          </div>
          <div className="mt-3 text-4xl font-semibold tabular-nums">
            {summary ? balance.toLocaleString() : "—"}
          </div>
          <div className="mt-6 flex gap-6 text-xs text-slate-300">
            <span>
              +{(summary?.month.earned ?? 0).toLocaleString()} earned this month
            </span>
            <span>−{(summary?.month.spent ?? 0).toLocaleString()} used</span>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-amber-500" /> Daily check-in
          </div>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            A small boost for showing up and building. Daily rewards are capped
            so a paid plan remains the best value.
          </p>
          <Button
            className="mt-5 w-full"
            size="sm"
            disabled={!daily?.claimable || busy !== null}
            onClick={claimDaily}
          >
            {busy === "daily" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : daily?.claimed ? (
              <>
                <Check className="h-4 w-4" /> Claimed today
              </>
            ) : (
              `Claim ${daily?.rewardCredits ?? 10} credits`
            )}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-medium">
              {subscription?.planName ?? "Free"}
              <Badge variant="secondary">
                {subscription?.status ?? "free"}
              </Badge>
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

      {(summary?.campaigns ?? []).filter(
        (campaign) => campaign.campaignKey !== "daily-check-in",
      ).length ? (
        <section>
          <h2 className="font-medium">Ways to earn</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete useful work across Agent Commons and CommonLab.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summary?.campaigns
              .filter((campaign) => campaign.campaignKey !== "daily-check-in")
              .map((campaign) => (
                <div
                  key={campaign.campaignKey}
                  className="rounded-xl border bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{campaign.name}</span>
                    <Badge variant="secondary">
                      +{campaign.rewardCredits.toLocaleString()}
                    </Badge>
                  </div>
                  {campaign.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {campaign.description}
                    </p>
                  ) : null}
                  {campaign.claimable ? (
                    <Button
                      className="mt-4 w-full"
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        void claimCampaign(
                          campaign.campaignKey,
                          campaign.rewardCredits,
                        )
                      }
                    >
                      {busy === `campaign-${campaign.campaignKey}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Claim reward"
                      )}
                    </Button>
                  ) : null}
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-medium">Add credits</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One-time packs never create a subscription.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(catalog?.topups ?? []).map((pack) => (
            <button
              key={pack.key}
              className="rounded-xl border bg-white p-4 text-left transition-colors hover:border-slate-400 disabled:opacity-50"
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

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-center gap-2 font-medium">
          <Gift className="h-4 w-4" /> Gift credits
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Send from your available balance using the recipient&apos;s Agent
          Commons ID.
        </p>
        {principalId ? (
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground hover:bg-slate-100"
            onClick={() => void navigator.clipboard.writeText(principalId)}
            title="Copy your Agent Commons ID"
          >
            Your ID:{" "}
            <span className="max-w-[320px] truncate font-mono text-foreground">
              {principalId}
            </span>
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_auto]"
          onSubmit={sendGift}
        >
          <Input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="Recipient ID"
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
          <Button disabled={busy !== null || !recipient.trim()}>
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
        <div className="mt-4 divide-y rounded-xl border bg-white">
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
          <div className="mt-4 divide-y rounded-xl border bg-white">
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
