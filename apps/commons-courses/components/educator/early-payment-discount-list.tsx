"use client";

import type { EarlyPaymentDiscountForm } from "@/components/educator/access-program-types";
import {
  EmptyState,
  Field,
  RowActions,
  SectionHeader,
  Select,
  updateItem,
} from "@/components/educator/access-program-fields";

export function EarlyPaymentDiscountList({
  currency,
  items,
  onChange,
}: {
  currency: string;
  items: EarlyPaymentDiscountForm[];
  onChange: (items: EarlyPaymentDiscountForm[]) => void;
}) {
  function addItem() {
    onChange([
      ...items,
      {
        id: `early-${Date.now()}`,
        label: "",
        active: true,
        amountType: "percent",
        amount: 15,
        deadline: "",
      },
    ]);
  }

  return (
    <div>
      <SectionHeader
        title="Early payment"
        description="Apply automatically when learners pay before a deadline."
        onAdd={addItem}
      />
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_155px_120px_120px_110px_auto]"
          >
            <Field
              label="Label"
              value={item.label || ""}
              onChange={(label) => updateItem(items, onChange, index, { label })}
            />
            <Field
              label="Pay before"
              type="date"
              value={toDateInputValue(item.deadline)}
              onChange={(deadline) =>
                updateItem(items, onChange, index, { deadline })
              }
            />
            <Select
              label="Type"
              value={item.amountType}
              options={[
                ["percent", "%"],
                ["fixed", currency.toUpperCase()],
              ]}
              onChange={(amountType) =>
                updateItem(items, onChange, index, {
                  amountType: amountType as EarlyPaymentDiscountForm["amountType"],
                })
              }
            />
            <Field
              label="Value"
              type="number"
              value={String(item.amount || "")}
              onChange={(amount) =>
                updateItem(items, onChange, index, { amount: Number(amount) || 0 })
              }
            />
            <Field
              label="Limit"
              type="number"
              value={String(item.maxRedemptions || "")}
              onChange={(maxRedemptions) =>
                updateItem(items, onChange, index, {
                  maxRedemptions: Number(maxRedemptions) || undefined,
                })
              }
            />
            <RowActions
              active={item.active}
              onToggle={(active) => updateItem(items, onChange, index, { active })}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        {items.length === 0 && <EmptyState label="No early payment discounts yet." />}
      </div>
    </div>
  );
}

function toDateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}
