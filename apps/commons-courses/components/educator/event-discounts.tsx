"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { eventMoney } from "@agent-commons/ui";
import { List, ListRow, Badge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { eventRequest } from "@/lib/project-events-client";
type Discount = {
  discount_id: string;
  code: string;
  label: string;
  active: boolean;
  amount_type: "percent" | "fixed";
  amount: string;
  max_redemptions: number | null;
  expires_at: string | null;
  reserved_or_redeemed: number;
};
const input =
  "mt-1 h-9 w-full rounded-lg border border-border bg-white px-3 text-sm";
export function EventDiscounts({
  projectId,
  eventId,
  currency,
  price,
}: {
  projectId: string;
  eventId: string;
  currency: string;
  price: number;
}) {
  const [items, setItems] = useState<Discount[]>([]),
    [selected, setSelected] = useState<Discount | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const path = `/${projectId}/events/${eventId}/discounts`;
  const load = useCallback(async () => {
    try {
      setItems(await eventRequest<Discount[]>(path));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load codes.");
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Percent or fixed discounts, with an expiry and booking limit.
        </p>
        <Button
          icon={Plus}
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
        >
          New code
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <List>
        {items.map((d) => (
          <ListRow
            key={d.discount_id}
            title={d.code}
            meta={`${d.amount_type === "percent" ? `${Number(d.amount)}% off` : `${eventMoney(Math.round(Number(d.amount) * 100), currency)} off the booking`} · ${d.reserved_or_redeemed}${d.max_redemptions ? ` / ${d.max_redemptions}` : ""} bookings in use${d.expires_at ? ` · Ends ${new Date(d.expires_at).toLocaleDateString()}` : ""}`}
            onClick={() => {
              setSelected(d);
              setOpen(true);
            }}
            trailing={
              <Badge tone={d.active ? "success" : "neutral"}>
                {d.active ? "Active" : "Disabled"}
              </Badge>
            }
          />
        ))}
        {!items.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No discount codes yet.
          </p>
        )}
      </List>
      <p className="mt-4 text-xs text-muted-foreground">
        One code per booking. Fixed discounts apply once to the total. Codes are
        checked on the server, including active checkout holds.
      </p>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={selected ? "Edit discount code" : "New discount code"}
      >
        <DiscountForm
          key={selected?.discount_id || "new"}
          value={selected}
          currency={currency}
          price={price}
          busy={busy}
          onSave={async (body) => {
            setBusy(true);
            try {
              setItems(await eventRequest<Discount[]>(path, "POST", body));
              setOpen(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Drawer>
    </>
  );
}
function DiscountForm({
  value,
  currency,
  price,
  busy,
  onSave,
}: {
  value: Discount | null;
  currency: string;
  price: number;
  busy: boolean;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [code, setCode] = useState(value?.code || ""),
    [label, setLabel] = useState(value?.label || ""),
    [kind, setKind] = useState(value?.amount_type || "percent"),
    [amount, setAmount] = useState(value ? Number(value.amount) : 10),
    [maximum, setMaximum] = useState(value?.max_redemptions?.toString() || ""),
    [expiry, setExpiry] = useState(
      value?.expires_at
        ? new Date(value.expires_at).toISOString().slice(0, 16)
        : "",
    ),
    [active, setActive] = useState(value?.active ?? true),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await onSave({
        discountId: value?.discount_id,
        code,
        label,
        amountType: kind,
        amount,
        active,
        maxRedemptions: maximum ? Number(maximum) : null,
        expiresAt: expiry ? new Date(expiry + "Z").toISOString() : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the code.");
    }
  }
  const deduction =
    kind === "percent"
      ? Math.round((price * amount) / 100)
      : Math.round(amount * 100);
  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm">
        Code
        <input
          className={input}
          value={code}
          maxLength={32}
          pattern="[A-Z0-9][A-Z0-9_-]{1,31}"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
      </label>
      <label className="block text-sm">
        Label, optional
        <input
          className={input}
          value={label}
          maxLength={100}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Discount type
        <select
          className={input}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="percent">Percentage</option>
          <option value="fixed">Fixed amount per booking</option>
        </select>
      </label>
      <label className="block text-sm">
        {kind === "percent" ? "Percentage off" : `Amount off (${currency})`}
        <input
          className={input}
          type="number"
          min="0.01"
          step="0.01"
          max={kind === "percent" ? 100 : 10000000}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          required
        />
      </label>
      <p className="text-sm text-muted-foreground">
        One participant would pay{" "}
        <strong>{eventMoney(Math.max(0, price - deduction), currency)}</strong>.
      </p>
      <label className="block text-sm">
        Maximum bookings, optional
        <input
          className={input}
          type="number"
          min="1"
          value={maximum}
          onChange={(e) => setMaximum(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Expiry in UTC, optional
        <input
          className={input}
          type="datetime-local"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Active
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy}>
        Save code
      </Button>
    </form>
  );
}
