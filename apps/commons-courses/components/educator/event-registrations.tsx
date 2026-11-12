"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, Plus, RefreshCw, Pencil } from "lucide-react";
import { eventMoney } from "@agent-commons/ui";
import {
  PageHeader,
  List,
  ListRow,
  Badge,
  EmptyState,
} from "@/components/ui/surface";
import { Button, ButtonLink } from "@/components/ui/button";
import { Tabs, useQueryTab } from "@/components/ui/tabs";
import { Drawer } from "@/components/ui/drawer";
import {
  eventRequest,
  bookingsCsv,
  type ProgrammeEvent,
  type Booking,
  type PaymentAccount,
  type EventSettings,
} from "@/lib/project-events-client";

import { EventDiscounts } from "./event-discounts";

const inputClass =
  "mt-1 h-9 w-full rounded-lg border border-border bg-white px-3 text-sm";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
const tone = (s: string) =>
  s === "confirmed" ? "success" : s === "review" ? "warning" : "neutral";
const base = (id: string) => `/${encodeURIComponent(id)}/events`;

function EventForm({
  event,
  projectId,
  onSave,
}: {
  event?: ProgrammeEvent;
  projectId: string;
  onSave: (event: ProgrammeEvent) => void;
}) {
  const [v, setV] = useState({
    slug: event?.slug || "",
    status: event?.status || "draft",
    config:
      event?.config ||
      ({
        title: "",
        summary: "",
        when: "",
        location: "",
        amountMinor: 0,
        currency: "KES",
        capacity: null,
        maxPerOrder: 4,
        participantLabel: "Participant",
        participantPlural: "Participants",
        contactLabel: "Your full name",
        eyebrow: "Join us",
        fields: [],
        agreementText:
          "I agree to the registration details and to being contacted about this programme.",
        terms: "",
        supportEmail: "",
        supportPhone: "",
        surface: "commonlab",
        theme: {
          accent: "#325ad2",
          background: "#faf8f2",
          ink: "#21314b",
          logoUrl: "",
          imageUrl: "",
        },
      } as EventSettings),
  });
  const [advanced, setAdvanced] = useState(JSON.stringify(v.config, null, 2)),
    [editingAdvanced, setEditingAdvanced] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) =>
    setV((old) => {
      const config = { ...old.config, [key]: value };
      if (editingAdvanced) setAdvanced(JSON.stringify(config, null, 2));
      return { ...old, config };
    });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const config = editingAdvanced ? JSON.parse(advanced) : v.config;
      const result = await eventRequest<ProgrammeEvent>(
        base(projectId) + (event ? `/${event.eventId}` : ""),
        event ? "PATCH" : "POST",
        { ...v, config },
      );
      onSave(result);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        Programme name
        <input
          className={inputClass}
          value={v.config.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </label>
      {!event && (
        <label className="block text-sm">
          Registration address
          <input
            className={inputClass}
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value })}
            pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
            required
          />
          <span className="text-xs text-muted-foreground">
            /register/{v.slug || "your-programme"}
          </span>
        </label>
      )}
      <label className="block text-sm">
        Short introduction
        <textarea
          className={inputClass + " h-20 py-2"}
          value={v.config.summary}
          onChange={(e) => set("summary", e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Dates and times
        <input
          className={inputClass}
          value={v.config.when}
          onChange={(e) => set("when", e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Venue
        <input
          className={inputClass}
          value={v.config.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          Fee per participant ({v.config.currency})
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={v.config.amountMinor / 100}
            onChange={(e) =>
              set("amountMinor", Math.round(Number(e.target.value) * 100))
            }
            required
          />
        </label>
        <label className="block text-sm">
          Total places
          <input
            className={inputClass}
            type="number"
            min="1"
            value={v.config.capacity ?? ""}
            placeholder="No limit"
            onChange={(e) =>
              set("capacity", e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
      </div>
      <label className="block text-sm">
        Registration
        <select
          className={inputClass}
          value={v.status}
          onChange={(e) => setV({ ...v, status: e.target.value })}
        >
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <details
        className="rounded-lg border p-3"
        onToggle={(e) => {
          const open = e.currentTarget.open;
          if (open) setAdvanced(JSON.stringify(v.config, null, 2));
          setEditingAdvanced(open);
        }}
      >
        <summary className="cursor-pointer text-sm">
          Brand and form configuration
        </summary>
        <p className="my-3 text-xs text-muted-foreground">
          Customise images, colours, participant questions, agreement and
          support details. Your coding tool can use this same configuration.
        </p>
        <textarea
          aria-label="Programme configuration JSON"
          className="min-h-80 w-full rounded-lg border p-3 font-mono text-xs"
          value={advanced}
          onChange={(e) => {
            setAdvanced(e.target.value);
            try {
              const config = JSON.parse(e.target.value);
              setV((old) => ({ ...old, config }));
            } catch {}
          }}
        />
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy}>
        Save programme
      </Button>
    </form>
  );
}

export function EducatorRegistrations() {
  const [events, setEvents] = useState<ProgrammeEvent[]>([]),
    [projects, setProjects] = useState<
      Array<{ projectId: string; name: string }>
    >([]),
    [project, setProject] = useState(""),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await eventRequest<{
        events: ProgrammeEvent[];
        projects: typeof projects;
      }>();
      setEvents(data.events);
      setProjects(data.projects);
      setProject((old) => old || data.projects[0]?.projectId || "");
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <PageHeader
        title="Registrations"
        info="Bookings and verified payments for your programmes."
        actions={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            New programme
          </Button>
        }
      />
      {error && (
        <p className="mb-4 text-sm text-red-700" role="alert">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading programmes…</p>
      ) : events.length ? (
        <List>
          {events.map((e) => (
            <ListRow
              key={e.eventId}
              href={`/educator/registrations/${e.projectId}/${e.eventId}`}
              title={e.config.title}
              meta={`${e.projectName} · ${eventMoney(e.config.amountMinor, e.config.currency)}${e.config.capacity ? ` · ${e.config.capacity} places` : ""}`}
              trailing={<Badge>{e.status}</Badge>}
            />
          ))}
        </List>
      ) : !error ? (
        <EmptyState title="No programme registrations yet" />
      ) : null}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New programme"
        description="Link registration to one of your Commons projects."
      >
        <label className="mb-5 block text-sm">
          Project
          <select
            className={inputClass}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {project ? (
          <EventForm
            key={project}
            projectId={project}
            onSave={() => {
              setOpen(false);
              void load();
            }}
          />
        ) : (
          <ButtonLink href="/educator/pages">
            Create a project page first
          </ButtonLink>
        )}
      </Drawer>
    </>
  );
}

export function EducatorEvent({
  projectId,
  eventId,
}: {
  projectId: string;
  eventId: string;
}) {
  const [event, setEvent] = useState<ProgrammeEvent | null>(null),
    [items, setItems] = useState<Booking[]>([]),
    [account, setAccount] = useState<PaymentAccount>({ connected: false }),
    [next, setNext] = useState<number | null>(null),
    [selected, setSelected] = useState<Booking | null>(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(""),
    [signing, setSigning] = useState("");
  const [tab, setTab] = useQueryTab(
    ["registrations", "details", "discounts", "payments"] as const,
    "registrations",
  );
  const path = base(projectId);
  const load = useCallback(async () => {
    try {
      const [events, a, b] = await Promise.all([
        eventRequest<ProgrammeEvent[]>(base(projectId)),
        eventRequest<PaymentAccount>(base(projectId) + "/paystack"),
        eventRequest<{ registrations: Booking[]; nextOffset: number | null }>(
          base(projectId) + `/${eventId}/registrations`,
        ),
      ]);
      const found = events.find((e) => e.eventId === eventId);
      if (!found) throw new Error("Programme not found in this account.");
      setEvent(found);
      setAccount(a);
      setItems(b.registrations);
      setNext(b.nextOffset);
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, [projectId, eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([bookingsCsv(items)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event?.slug}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!event)
    return (
      <>
        <PageHeader title="Programme registrations" />
        {error ? (
          <p role="alert">
            {error} <button onClick={() => void load()}>Retry</button>
          </p>
        ) : (
          <p>Loading…</p>
        )}
      </>
    );
  return (
    <>
      <Link
        href="/educator/registrations"
        className="text-xs text-muted-foreground"
      >
        ← Registrations
      </Link>
      <PageHeader
        title={event.config.title}
        meta={`${eventMoney(event.config.amountMinor, event.config.currency)}${event.config.capacity ? ` · ${event.config.capacity} places` : ""} · ${event.status}`}
        actions={
          <ButtonLink href={event.registrationUrl} external>
            Open registration
          </ButtonLink>
        }
      />
      <Tabs
        items={[
          { value: "registrations", label: "Registrations" },
          { value: "details", label: "Programme details" },
          { value: "discounts", label: "Discount codes" },
          { value: "payments", label: "Payment connection" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-sm text-green-800" role="status">
          {notice}
        </p>
      )}
      <div className="mt-5">
        {tab === "details" ? (
          <>
            <div className="mb-5 flex justify-end">
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit programme
              </Button>
            </div>
            <List>
              {[
                ["About", event.config.summary],
                ["When", event.config.when],
                ["Where", event.config.location],
                ["Registration link", event.registrationUrl],
              ].map(([title, text]) => (
                <ListRow
                  key={title}
                  title={title}
                  meta={text}
                  chevron={false}
                />
              ))}
            </List>
            {event.config.pageSlug && (
              <ButtonLink
                className="mt-4"
                href={`/p/${event.config.pageSlug}`}
                external
              >
                Open programme page
              </ButtonLink>
            )}
          </>
        ) : tab === "discounts" ? (
          <EventDiscounts
            projectId={projectId}
            eventId={eventId}
            currency={event.config.currency}
            price={event.config.amountMinor}
          />
        ) : tab === "payments" ? (
          <div className="max-w-lg space-y-5">
            <p className="text-sm">
              {account.connected
                ? `Paystack is connected in ${account.mode} mode.`
                : "Connect the Paystack account that will receive this programme’s payments."}
            </p>
            {account.webhookUrl && (
              <label className="block text-sm">
                Webhook address
                <input
                  readOnly
                  className={inputClass}
                  value={account.webhookUrl}
                />
                <span className="text-xs text-muted-foreground">
                  Existing CommonLab payment accounts also receive event
                  notifications through their current webhook.
                </span>
              </label>
            )}
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  setAccount(
                    await eventRequest<PaymentAccount>(
                      path + "/paystack",
                      "POST",
                      { secretKey: key, signingSecret: signing },
                    ),
                  );
                  setKey("");
                  setSigning("");
                  setNotice("Paystack connected.");
                });
              }}
            >
              <label className="block text-sm">
                Paystack secret key
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                Webhook signing secret, if enabled
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={signing}
                  onChange={(e) => setSigning(e.target.value)}
                />
              </label>
              <Button type="submit" variant="primary" loading={busy}>
                Connect Paystack
              </Button>
            </form>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {items
                  .filter((b) => b.status === "confirmed")
                  .reduce((n, b) => n + b.quantity, 0)}{" "}
                confirmed places in this view
              </p>
              <div className="flex gap-2">
                <Button icon={RefreshCw} size="sm" onClick={() => void load()}>
                  Refresh
                </Button>
                <Button
                  icon={Download}
                  size="sm"
                  onClick={download}
                  disabled={!items.length}
                >
                  Export this view
                </Button>
              </div>
            </div>
            <List>
              {items.map((b) => (
                <ListRow
                  key={b.registration_id}
                  title={b.contact.name}
                  meta={`${b.quantity} ${b.quantity === 1 ? event.config.participantLabel.toLowerCase() : event.config.participantPlural.toLowerCase()} · ${b.contact.email}`}
                  onClick={() => setSelected(b)}
                  trailing={
                    <>
                      <span className="text-right text-xs">
                        {eventMoney(Number(b.amount_minor), b.currency)}
                        <span className="block text-muted-foreground">
                          {b.payment_status}
                        </span>
                      </span>
                      <Badge tone={tone(b.status)}>{b.status}</Badge>
                    </>
                  }
                />
              ))}
              {!items.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Bookings and payment confirmations will appear here.
                </p>
              )}
            </List>
            {next !== null && (
              <Button
                className="mt-4"
                loading={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await eventRequest<{
                      registrations: Booking[];
                      nextOffset: number | null;
                    }>(path + `/${eventId}/registrations?offset=${next}`);
                    setItems((old) => [...old, ...data.registrations]);
                    setNext(data.nextOffset);
                  })
                }
              >
                Load more
              </Button>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Contact and participant details are private to the project owner.
            </p>
          </>
        )}
      </div>
      <Drawer
        open={editing}
        onClose={() => setEditing(false)}
        title="Programme details"
      >
        <EventForm
          event={event}
          projectId={projectId}
          onSave={(e) => {
            setEvent(e);
            setEditing(false);
            setNotice("Programme updated.");
          }}
        />
      </Drawer>
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Booking details"
        description={selected?.reference}
      >
        {selected && (
          <div className="space-y-5">
            <dl className="space-y-4 text-sm">
              {[
                ["Contact", selected.contact.name],
                ["Email", selected.contact.email],
                ["Phone", selected.contact.phone],
                ["Registration", selected.status],
                ["Payment", selected.payment_status],
                ["Discount code", selected.discount_code || "None"],
                [
                  "Total",
                  eventMoney(Number(selected.amount_minor), selected.currency),
                ],
                [
                  "Paid at",
                  selected.paid_at
                    ? new Date(selected.paid_at).toLocaleString()
                    : "Not paid",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.payment_details?.reason && (
              <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
                {selected.payment_details.reason}
              </p>
            )}
            {selected.participants.map((participant, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <p className="mb-2 font-medium">
                  {event.config.participantLabel} {i + 1}
                </p>
                {Object.entries(participant).map(([key, value]) => (
                  <p key={key}>
                    {event.config.fields.find((f) => f.key === key)?.label ||
                      key}
                    : {String(value)}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
