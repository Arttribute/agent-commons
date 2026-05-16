"use client";

import type { AffiliateForm } from "@/components/educator/access-program-types";
import {
  EmptyState,
  Field,
  RowActions,
  SectionHeader,
  Select,
  updateItem,
} from "@/components/educator/access-program-fields";

export function AffiliateList({
  items,
  onChange,
}: {
  items: AffiliateForm[];
  onChange: (items: AffiliateForm[]) => void;
}) {
  function addItem() {
    onChange([
      ...items,
      {
        id: `affiliate-${Date.now()}`,
        code: "",
        name: "",
        active: true,
        commissionType: "percent",
        commissionAmount: 10,
      },
    ]);
  }

  return (
    <div>
      <SectionHeader
        title="Affiliates"
        description="Track referral partners and expected commissions."
        onAdd={addItem}
      />
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_120px_120px_auto]"
          >
            <Field
              label="Code"
              value={item.code}
              onChange={(code) => updateItem(items, onChange, index, { code })}
            />
            <Field
              label="Partner"
              value={item.name}
              onChange={(name) => updateItem(items, onChange, index, { name })}
            />
            <Select
              label="Commission"
              value={item.commissionType}
              options={[
                ["percent", "%"],
                ["fixed", "Fixed"],
              ]}
              onChange={(commissionType) =>
                updateItem(items, onChange, index, {
                  commissionType: commissionType as AffiliateForm["commissionType"],
                })
              }
            />
            <Field
              label="Value"
              type="number"
              value={String(item.commissionAmount || "")}
              onChange={(commissionAmount) =>
                updateItem(items, onChange, index, {
                  commissionAmount: Number(commissionAmount) || 0,
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
        {items.length === 0 && <EmptyState label="No affiliates yet." />}
      </div>
    </div>
  );
}
