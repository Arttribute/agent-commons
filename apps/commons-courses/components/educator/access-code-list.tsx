"use client";

import type { AccessCodeForm } from "@/components/educator/access-program-types";
import {
  EmptyState,
  Field,
  RowActions,
  SectionHeader,
  Select,
  updateItem,
} from "@/components/educator/access-program-fields";

export function AccessCodeList({
  title,
  description,
  currency,
  items,
  defaultAmount,
  onChange,
}: {
  title: string;
  description: string;
  currency: string;
  items: AccessCodeForm[];
  defaultAmount: number;
  onChange: (items: AccessCodeForm[]) => void;
}) {
  function addItem() {
    onChange([
      ...items,
      {
        id: `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        code: "",
        label: "",
        active: true,
        amountType: "percent",
        amount: defaultAmount,
      },
    ]);
  }

  return (
    <div>
      <SectionHeader title={title} description={description} onAdd={addItem} />
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_120px_120px_110px_auto]"
          >
            <Field
              label="Code"
              value={item.code}
              onChange={(code) => updateItem(items, onChange, index, { code })}
            />
            <Field
              label="Label"
              value={item.label || ""}
              onChange={(label) => updateItem(items, onChange, index, { label })}
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
                  amountType: amountType as AccessCodeForm["amountType"],
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
        {items.length === 0 && (
          <EmptyState label={`No ${title.toLowerCase()} yet.`} />
        )}
      </div>
    </div>
  );
}
