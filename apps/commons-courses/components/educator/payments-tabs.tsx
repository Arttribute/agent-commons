"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, List, ListRow } from "@/components/ui/surface";
import { Segmented } from "@/components/ui/tabs";

type Transaction = {
  id: string;
  name: string;
  reference: string;
  codes: string;
  amount: string;
  discount: string;
  provider: string;
  status: string;
  date: string;
  email?: string;
  receiptEmailStatus?: string;
  registration?: {
    status: string;
    quantity: number;
    contact: { name: string; email: string; phone: string };
    participants: Array<Record<string, string | boolean>>;
    reviewReason?: string;
  };
};

type LedgerEntry = {
  id: string;
  type: string;
  gross: string;
  net: string;
  status: string;
};

const statusTone = (status: string) =>
  status === "completed" || status === "paid"
    ? "success"
    : status === "failed"
      ? "danger"
      : "neutral";

export function PaymentsTabs({
  transactions,
  ledger,
  courseSlug,
}: {
  transactions: Transaction[];
  ledger: LedgerEntry[];
  courseSlug?: string;
}) {
  const [view, setView] = useState<"transactions" | "ledger">("transactions");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [receiptBusy, setReceiptBusy] = useState(false),
    [receiptMessage, setReceiptMessage] = useState("");
  async function emailReceipt() {
    if (!selected || !courseSlug || receiptBusy) return;
    setReceiptBusy(true);
    setReceiptMessage("");
    try {
      const response = await fetch(
        `/api/educator/courses/${courseSlug}/payments/${selected.id}/receipt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resend: selected.receiptEmailStatus === "sent",
            requestId: crypto.randomUUID(),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Receipt email could not be sent");
      setSelected({ ...selected, receiptEmailStatus: "sent" });
      setReceiptMessage("Receipt emailed to the payer.");
    } catch (error) {
      setReceiptMessage(
        error instanceof Error ? error.message : "Please try again",
      );
    } finally {
      setReceiptBusy(false);
    }
  }

  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  function exportCSV() {
    const rows = [
      [
        "Parent / registrant",
        "Email",
        "Phone",
        "Participants",
        "Participant choices",
        "Payment reference",
        "Amount",
        "Payment status",
        "Registration status",
        "Codes",
      ],
      ...transactions.map((t) => [
        t.registration?.contact.name || t.name,
        t.registration?.contact.email || "",
        t.registration?.contact.phone || "",
        String(t.registration?.quantity || 1),
        t.registration ? JSON.stringify(t.registration.participants) : "",
        t.reference,
        t.amount,
        t.status,
        t.registration?.status || "",
        t.codes,
      ]),
    ];
    const clean = (s: string) =>
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"';
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((r) => r.map(clean).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "registrations-and-payments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-4">
      {transactions.some((t) => t.registration) && (
        <button
          type="button"
          onClick={exportCSV}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Export registrations
        </button>
      )}
      <dialog
        ref={dialog}
        onClose={() => setSelected(null)}
        className="m-auto w-[min(92vw,560px)] rounded-xl border bg-white p-6 text-slate-900 backdrop:bg-black/40"
      >
        {selected && (
          <>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {selected.registration?.contact.name || selected.name}
              </h2>
              <button
                type="button"
                aria-label="Close booking"
                onClick={() => dialog.current?.close()}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm">
              {selected.registration?.contact.email || selected.email}
              <br />
              {selected.registration?.contact.phone}
            </p>
            <p className="my-4 text-sm">
              {selected.amount} · {selected.status} ·{" "}
              {selected.registration?.status}
            </p>
            <p className="break-all text-xs">{selected.reference}</p>
            {selected.registration?.reviewReason && (
              <p className="my-3 text-sm text-amber-800">
                {selected.registration.reviewReason}
              </p>
            )}
            {courseSlug && selected.status === "completed" && (
              <div className="my-5">
                <button
                  type="button"
                  disabled={receiptBusy}
                  onClick={emailReceipt}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  {receiptBusy
                    ? "Sending…"
                    : selected.receiptEmailStatus === "sent"
                      ? "Resend receipt"
                      : "Email receipt"}
                </button>
                {receiptMessage && (
                  <p role="status" className="mt-2 text-sm">
                    {receiptMessage}
                  </p>
                )}
              </div>
            )}
            <div className="mt-5 space-y-4">
              {selected.registration?.participants.map((fields, i) => (
                <div key={i}>
                  <h3 className="text-sm font-semibold">Participant {i + 1}</h3>
                  {Object.entries(fields).map(([key, value]) => (
                    <p key={key} className="text-sm text-slate-600">
                      {key}: {String(value)}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </dialog>
      <Segmented
        items={[
          {
            value: "transactions",
            label: `Transactions (${transactions.length})`,
          },
          { value: "ledger", label: `Payout ledger (${ledger.length})` },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "transactions" ? (
        <List>
          {transactions.map((item) => (
            <ListRow
              key={item.id}
              chevron={true}
              onClick={() => {
                setReceiptMessage("");
                setSelected(item);
              }}
              title={item.name}
              meta={[
                item.date ? formatDate(item.date) : null,
                item.provider,
                item.codes || null,
                item.reference || null,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                <>
                  <span className="text-right text-sm tabular-nums">
                    {item.amount}
                    {item.discount ? (
                      <span className="block text-xs text-muted-foreground">
                        {item.discount}
                      </span>
                    ) : null}
                  </span>
                  <Badge
                    tone={
                      item.registration?.status === "review"
                        ? "danger"
                        : statusTone(item.status)
                    }
                  >
                    {item.registration?.status === "review"
                      ? "Payment needs review"
                      : item.status}
                  </Badge>
                </>
              }
            />
          ))}
          {!transactions.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No transactions.
            </p>
          ) : null}
        </List>
      ) : (
        <List>
          {ledger.map((entry) => (
            <ListRow
              key={entry.id}
              chevron={false}
              title={<span className="capitalize">{entry.type}</span>}
              meta={`Gross ${entry.gross}`}
              trailing={
                <>
                  <span className="text-sm tabular-nums">{entry.net} net</span>
                  <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
                </>
              }
            />
          ))}
          {!ledger.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Entries appear after completed payments.
            </p>
          ) : null}
        </List>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
