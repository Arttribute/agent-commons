"use client";

import { useState } from "react";
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
};

type LedgerEntry = { id: string; type: string; gross: string; net: string; status: string };

const statusTone = (status: string) =>
  status === "completed" || status === "paid" ? "success" : status === "failed" ? "danger" : "neutral";

export function PaymentsTabs({ transactions, ledger }: { transactions: Transaction[]; ledger: LedgerEntry[] }) {
  const [view, setView] = useState<"transactions" | "ledger">("transactions");
  return (
    <div className="space-y-4">
      <Segmented
        items={[
          { value: "transactions", label: `Transactions (${transactions.length})` },
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
              chevron={false}
              title={item.name}
              meta={[item.date ? formatDate(item.date) : null, item.provider, item.codes || null, item.reference || null]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                <>
                  <span className="text-right text-sm tabular-nums">
                    {item.amount}
                    {item.discount ? <span className="block text-xs text-muted-foreground">{item.discount}</span> : null}
                  </span>
                  <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                </>
              }
            />
          ))}
          {!transactions.length ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions.</p> : null}
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
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
