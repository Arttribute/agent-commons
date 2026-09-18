"use client";

import { useState } from "react";
import { BadgePercent, Gift, Plus, Tag, Ticket, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FieldGrid, Input, Select, SwitchRow } from "@/components/ui/field";
import { Badge, Card, EmptyState, List, ListRow } from "@/components/ui/surface";
import { Segmented, useQueryTab } from "@/components/ui/tabs";
import type {
  AccessCodeForm,
  AccessProgramForm,
  AffiliateForm,
  EarlyPaymentDiscountForm,
} from "@/components/educator/access-program-types";
import { normalizeAccessProgramForm } from "@/components/educator/access-program-types";
import type { CourseForm, CourseViewProps } from "./types";

const TABS = ["pricing", "offers", "affiliates"] as const;
type OfferKind = "discounts" | "earlyPaymentDiscounts" | "scholarships" | "passes";

const offerKinds: Array<{ value: OfferKind; label: string; icon: typeof Tag; info: string; defaultAmount: number }> = [
  { value: "discounts", label: "Promo codes", icon: Tag, info: "Reduce the checkout price by a percentage or fixed amount.", defaultAmount: 10 },
  { value: "earlyPaymentDiscounts", label: "Early payment", icon: BadgePercent, info: "Applies automatically when learners pay before a deadline.", defaultAmount: 15 },
  { value: "scholarships", label: "Scholarships", icon: Gift, info: "Partial or full tuition support.", defaultAmount: 100 },
  { value: "passes", label: "Passes", icon: Ticket, info: "Private access for partners, staff or cohorts.", defaultAmount: 100 },
];

let idSequence = 0;

/** Stable-enough client id for a new offer or affiliate row. */
function newRowId(prefix: string) {
  idSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSequence}`;
}

export function SalesView({ course, setCourse }: Pick<CourseViewProps, "course" | "setCourse">) {
  const [tab] = useQueryTab(TABS, "pricing");
  const accessProgram = normalizeAccessProgramForm(course.accessProgram);
  const setProgram = (next: AccessProgramForm) =>
    setCourse((current) => ({ ...current, accessProgram: next }));

  if (tab === "offers") {
    return <OffersView program={accessProgram} currency={course.currency} onChange={setProgram} />;
  }
  if (tab === "affiliates") {
    return (
      <AffiliatesView
        items={accessProgram.affiliates}
        currency={course.currency}
        onChange={(affiliates) => setProgram({ ...accessProgram, affiliates })}
      />
    );
  }
  return <PricingView course={course} setCourse={setCourse} />;
}

function PricingView({ course, setCourse }: Pick<CourseViewProps, "course" | "setCourse">) {
  const patch = (value: Partial<CourseForm>) => setCourse((current) => ({ ...current, ...value }));
  const setProvider = (provider: "stripe" | "paystack", enabled: boolean) =>
    setCourse((current) => ({
      ...current,
      paymentProviders: enabled
        ? Array.from(new Set([...current.paymentProviders, provider]))
        : current.paymentProviders.filter((item) => item !== provider),
    }));
  const plan = course.installmentPlan;
  const setPlan = (value: Partial<CourseForm["installmentPlan"]>) =>
    setCourse((current) => ({ ...current, installmentPlan: { ...current.installmentPlan, ...value } }));
  const kesWithoutPaystack =
    !course.isFree && course.currency.toUpperCase() === "KES" && !course.paymentProviders.includes("paystack");

  return (
    <div className="space-y-5">
      <Card>
        <FieldGrid>
          <Field label="Price" info="Set to 0 for a free course.">
            <Input
              type="number"
              min={0}
              value={String(course.price)}
              onChange={(event) => {
                const price = Number(event.target.value);
                patch({ price, isFree: price <= 0 });
              }}
            />
          </Field>
          <Field label="Currency">
            <Input value={course.currency} onChange={(event) => patch({ currency: event.target.value.toUpperCase() })} />
          </Field>
        </FieldGrid>
      </Card>

      <Card className="divide-y divide-border py-2">
        <SwitchRow
          label="Stripe"
          info="Cards and international payments."
          checked={course.paymentProviders.includes("stripe")}
          onChange={(checked) => setProvider("stripe", checked)}
        />
        <SwitchRow
          label="Paystack"
          info="Recommended for KES courses. Enables M-Pesa and mobile money."
          checked={course.paymentProviders.includes("paystack")}
          onChange={(checked) => setProvider("paystack", checked)}
        />
      </Card>
      {kesWithoutPaystack ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Turn on Paystack so KES learners can pay with M-Pesa.
        </p>
      ) : null}
      {!course.isFree && course.paymentProviders.length === 0 ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Paid courses need at least one payment provider.
        </p>
      ) : null}

      <Card className="space-y-4">
        <SwitchRow
          label="Installments (lipa mdogo mdogo)"
          info="Let learners pay in parts. Access is released according to the rule you choose."
          checked={plan.enabled}
          onChange={(enabled) => setPlan({ enabled })}
        />
        {plan.enabled ? (
          <FieldGrid columns={3}>
            <Field label="Amount per installment">
              <Input
                type="number"
                min={0}
                value={String(plan.installmentAmount || "")}
                onChange={(event) => setPlan({ installmentAmount: Number(event.target.value) || undefined })}
              />
            </Field>
            <Field label="Installments">
              <Input
                type="number"
                min={1}
                value={String(plan.installmentCount)}
                onChange={(event) => setPlan({ installmentCount: Number(event.target.value) || 4 })}
              />
            </Field>
            <Field label="Access release">
              <Select
                value={plan.releaseAccess}
                onChange={(event) =>
                  setPlan({ releaseAccess: event.target.value as CourseForm["installmentPlan"]["releaseAccess"] })
                }
              >
                <option value="module_by_module">Module by module</option>
                <option value="full_after_first_payment">Full after first payment</option>
                <option value="full_after_completion">Full after completion</option>
              </Select>
            </Field>
          </FieldGrid>
        ) : null}
      </Card>
    </div>
  );
}

function OffersView({
  program,
  currency,
  onChange,
}: {
  program: AccessProgramForm;
  currency: string;
  onChange: (program: AccessProgramForm) => void;
}) {
  const [kind, setKind] = useState<OfferKind>("discounts");
  const [editing, setEditing] = useState<string | null>(null);
  const config = offerKinds.find((item) => item.value === kind)!;
  const items = program[kind] as Array<AccessCodeForm | EarlyPaymentDiscountForm>;
  const editingIndex = items.findIndex((item) => item.id === editing);
  const editingItem = editingIndex >= 0 ? items[editingIndex] : null;

  function setItems(next: Array<AccessCodeForm | EarlyPaymentDiscountForm>) {
    onChange({ ...program, [kind]: next } as AccessProgramForm);
  }

  function addItem() {
    const id = newRowId(kind);
    const base = { id, label: "", active: true, amountType: "percent" as const, amount: config.defaultAmount };
    setItems([...items, kind === "earlyPaymentDiscounts" ? { ...base, deadline: "" } : { ...base, code: "" }]);
    setEditing(id);
  }

  function patchItem(patch: Partial<AccessCodeForm & EarlyPaymentDiscountForm>) {
    setItems(items.map((item, index) => (index === editingIndex ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          items={offerKinds.map(({ value, label }) => ({ value, label }))}
          value={kind}
          onChange={(value) => {
            setKind(value);
            setEditing(null);
          }}
        />
        <Button icon={Plus} onClick={addItem}>
          Add {config.label.toLowerCase().replace(/s$/, "")}
        </Button>
      </div>

      {items.length ? (
        <List>
          {items.map((item) => {
            const code = "code" in item ? item.code : undefined;
            const deadline = "deadline" in item ? item.deadline : undefined;
            return (
              <ListRow
                key={item.id}
                onClick={() => setEditing(item.id)}
                leading={
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <config.icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                }
                title={code || item.label || (kind === "earlyPaymentDiscounts" ? "Early payment discount" : "New code")}
                meta={[
                  `${formatAmount(item.amountType, item.amount, currency)} off`,
                  deadline ? `until ${deadline}` : null,
                  item.maxRedemptions ? `${item.redeemedCount || 0} of ${item.maxRedemptions} used` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={<Badge tone={item.active ? "success" : "neutral"}>{item.active ? "Active" : "Paused"}</Badge>}
              />
            );
          })}
        </List>
      ) : (
        <EmptyState icon={config.icon} title={`No ${config.label.toLowerCase()} yet`} description={config.info} />
      )}

      <Drawer
        open={Boolean(editingItem)}
        onClose={() => setEditing(null)}
        title={config.label}
        footer={
          <>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              className="mr-auto"
              onClick={() => {
                setItems(items.filter((_, index) => index !== editingIndex));
                setEditing(null);
              }}
            >
              Delete
            </Button>
            <Button variant="primary" onClick={() => setEditing(null)}>
              Done
            </Button>
          </>
        }
      >
        {editingItem ? (
          <div className="space-y-4">
            <SwitchRow label="Active" checked={editingItem.active} onChange={(active) => patchItem({ active })} />
            {kind !== "earlyPaymentDiscounts" ? (
              <Field label="Code" info="Learners enter this at checkout.">
                <Input
                  value={"code" in editingItem ? editingItem.code : ""}
                  onChange={(event) => patchItem({ code: event.target.value })}
                />
              </Field>
            ) : null}
            <Field label="Label" optional>
              <Input value={editingItem.label || ""} onChange={(event) => patchItem({ label: event.target.value })} />
            </Field>
            <FieldGrid>
              <Field label="Type">
                <Select
                  value={editingItem.amountType}
                  onChange={(event) => patchItem({ amountType: event.target.value as "percent" | "fixed" })}
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed {currency.toUpperCase()}</option>
                </Select>
              </Field>
              <Field label="Value">
                <Input
                  type="number"
                  min={0}
                  value={String(editingItem.amount || "")}
                  onChange={(event) => patchItem({ amount: Number(event.target.value) || 0 })}
                />
              </Field>
              {kind === "earlyPaymentDiscounts" ? (
                <Field label="Deadline">
                  <Input
                    type="date"
                    value={"deadline" in editingItem ? editingItem.deadline || "" : ""}
                    onChange={(event) => patchItem({ deadline: event.target.value })}
                  />
                </Field>
              ) : null}
              <Field label="Usage limit" optional>
                <Input
                  type="number"
                  min={0}
                  value={String(editingItem.maxRedemptions || "")}
                  onChange={(event) => patchItem({ maxRedemptions: Number(event.target.value) || undefined })}
                />
              </Field>
            </FieldGrid>
            <p className="text-xs text-muted-foreground">Changes apply when you save.</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function AffiliatesView({
  items,
  currency,
  onChange,
}: {
  items: AffiliateForm[];
  currency: string;
  onChange: (items: AffiliateForm[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const index = items.findIndex((item) => item.id === editing);
  const item = index >= 0 ? items[index] : null;
  const patch = (value: Partial<AffiliateForm>) =>
    onChange(items.map((current, i) => (i === index ? { ...current, ...value } : current)));

  function addItem() {
    const id = newRowId("affiliate");
    onChange([
      ...items,
      { id, code: "", name: "", active: true, commissionType: "percent", commissionAmount: 10 },
    ]);
    setEditing(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} affiliate{items.length === 1 ? "" : "s"}
        </p>
        <Button variant="primary" icon={Plus} onClick={addItem}>
          Add affiliate
        </Button>
      </div>
      {items.length ? (
        <List>
          {items.map((affiliate) => (
            <ListRow
              key={affiliate.id}
              onClick={() => setEditing(affiliate.id)}
              leading={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                </span>
              }
              title={affiliate.name || affiliate.code || "New affiliate"}
              meta={[
                affiliate.code,
                `${formatAmount(affiliate.commissionType, affiliate.commissionAmount, currency)} commission`,
                affiliate.conversions ? `${affiliate.conversions} conversions` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={<Badge tone={affiliate.active ? "success" : "neutral"}>{affiliate.active ? "Active" : "Paused"}</Badge>}
            />
          ))}
        </List>
      ) : (
        <EmptyState icon={Users} title="No affiliates yet" description="Track referral partners and their commission." />
      )}

      <Drawer
        open={Boolean(item)}
        onClose={() => setEditing(null)}
        title="Affiliate"
        footer={
          <>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              className="mr-auto"
              onClick={() => {
                onChange(items.filter((_, i) => i !== index));
                setEditing(null);
              }}
            >
              Delete
            </Button>
            <Button variant="primary" onClick={() => setEditing(null)}>
              Done
            </Button>
          </>
        }
      >
        {item ? (
          <div className="space-y-4">
            <SwitchRow label="Active" checked={item.active} onChange={(active) => patch({ active })} />
            <FieldGrid>
              <Field label="Name">
                <Input value={item.name} onChange={(event) => patch({ name: event.target.value })} />
              </Field>
              <Field label="Code">
                <Input value={item.code} onChange={(event) => patch({ code: event.target.value })} />
              </Field>
              <Field label="Commission type">
                <Select
                  value={item.commissionType}
                  onChange={(event) => patch({ commissionType: event.target.value as AffiliateForm["commissionType"] })}
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed {currency.toUpperCase()}</option>
                </Select>
              </Field>
              <Field label="Commission">
                <Input
                  type="number"
                  min={0}
                  value={String(item.commissionAmount || "")}
                  onChange={(event) => patch({ commissionAmount: Number(event.target.value) || 0 })}
                />
              </Field>
            </FieldGrid>
            <p className="text-xs text-muted-foreground">Changes apply when you save.</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function formatAmount(type: "percent" | "fixed", amount: number, currency: string) {
  return type === "percent" ? `${amount || 0}%` : `${currency.toUpperCase()} ${amount || 0}`;
}
