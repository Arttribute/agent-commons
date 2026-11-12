"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ExternalLink, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { eventMoney } from "@agent-commons/ui";
import {
  projectEventsApi,
  type ProjectEvent,
  type EventSettings,
  type EventBooking,
  type EventPaymentAccount,
} from "@/hooks/use-project-events";

function initialConfig(title: string): EventSettings {
  return {
    title,
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
      "I agree to the registration details and to being contacted about this event.",
    terms: "",
    supportEmail: "",
    supportPhone: "",
    surface: "commons",
    theme: {
      accent: "#325ad2",
      background: "#faf8f2",
      ink: "#21314b",
      logoUrl: "",
      imageUrl: "",
    },
  };
}
function SettingsForm({
  value,
  onSave,
  busy,
}: {
  value: ProjectEvent | { slug: string; status: string; config: EventSettings };
  onSave: (value: {
    slug: string;
    status: string;
    config: EventSettings;
  }) => Promise<void>;
  busy: boolean;
}) {
  const [v, setV] = useState(value),
    [fields, setFields] = useState(
      JSON.stringify(value.config.fields, null, 2),
    ),
    [problem, setProblem] = useState("");
  const set = <K extends keyof EventSettings>(
    key: K,
    value: EventSettings[K],
  ) => setV((old) => ({ ...old, config: { ...old.config, [key]: value } }));
  const text = (
    key:
      | "title"
      | "summary"
      | "when"
      | "location"
      | "participantLabel"
      | "participantPlural"
      | "contactLabel"
      | "eyebrow"
      | "agreementText"
      | "terms"
      | "supportEmail"
      | "supportPhone"
      | "pageSlug",
    label: string,
    required = false,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={"ev-" + key}>{label}</Label>
      <Input
        id={"ev-" + key}
        value={v.config[key] || ""}
        onChange={(e) => set(key, e.target.value)}
        required={required}
      />
    </div>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem("");
    try {
      const custom = JSON.parse(fields);
      if (!Array.isArray(custom))
        throw new Error("Participant fields must be a JSON list");
      await onSave({ ...v, config: { ...v.config, fields: custom } });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Please check the settings");
    }
  }
  return (
    <form className="space-y-5" onSubmit={submit}>
      {text("title", "Event name", true)}
      {!("eventId" in value) && (
        <div className="space-y-2">
          <Label htmlFor="ev-slug">Registration address</Label>
          <Input
            id="ev-slug"
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value })}
            required
            pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
            placeholder="my-event"
          />
          <p className="text-xs text-muted-foreground">
            The last part of /register/my-event. This stays fixed after
            creation.
          </p>
        </div>
      )}
      {text("summary", "Short introduction")}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("when", "Dates and times")}
        {text("location", "Venue")}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="ev-price">Price per participant</Label>
          <Input
            id="ev-price"
            type="number"
            min="0"
            step="0.01"
            value={v.config.amountMinor / 100}
            onChange={(e) =>
              set("amountMinor", Math.round(Number(e.target.value) * 100))
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ev-currency">Currency</Label>
          <select
            id="ev-currency"
            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            value={v.config.currency}
            onChange={(e) => set("currency", e.target.value)}
          >
            {["KES", "NGN", "GHS", "ZAR", "USD"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ev-capacity">Total places</Label>
          <Input
            id="ev-capacity"
            type="number"
            min="1"
            placeholder="No limit"
            value={v.config.capacity ?? ""}
            onChange={(e) =>
              set("capacity", e.target.value ? Number(e.target.value) : null)
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ev-status">Registration</Label>
        <select
          id="ev-status"
          className="h-10 w-full rounded-md border bg-white px-3 text-sm"
          value={v.status}
          onChange={(e) => setV({ ...v, status: e.target.value })}
        >
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Brand, form and programme details
        </summary>
        <div className="mt-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ev-surface">Page home</Label>
            <select
              id="ev-surface"
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
              value={v.config.surface}
              onChange={(e) =>
                set("surface", e.target.value as EventSettings["surface"])
              }
            >
              <option value="commons">Commons</option>
              <option value="commonlab">CommonLab</option>
              <option value="business">Business</option>
            </select>
          </div>
          {text("pageSlug", "Linked project page address")}
          {text("eyebrow", "Short heading above the event name")}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("participantLabel", "Participant label, singular")}
            {text("participantPlural", "Participant label, plural")}
          </div>
          {text("contactLabel", "Name field label")}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("supportEmail", "Booking help email")}
            {text("supportPhone", "Booking help phone")}
          </div>
          {(["logoUrl", "imageUrl"] as const).map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={"ev-" + key}>
                {key === "logoUrl" ? "Logo image URL" : "Leading image URL"}
              </Label>
              <Input
                id={"ev-" + key}
                type="url"
                value={v.config.theme[key]}
                onChange={(e) =>
                  set("theme", { ...v.config.theme, [key]: e.target.value })
                }
              />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-4">
            {(["accent", "background", "ink"] as const).map((key) => (
              <div key={key}>
                <Label htmlFor={"ev-" + key}>{key}</Label>
                <Input
                  id={"ev-" + key}
                  type="color"
                  className="mt-2"
                  value={v.config.theme[key]}
                  onChange={(e) =>
                    set("theme", { ...v.config.theme, [key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
          {text("agreementText", "Required registration agreement", true)}
          <div className="space-y-2">
            <Label htmlFor="ev-terms">Registration details</Label>
            <Textarea
              id="ev-terms"
              value={v.config.terms}
              onChange={(e) => set("terms", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Shown behind a disclosure next to the agreement. Include your own
              cancellation and joining arrangements.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-fields">Participant questions</Label>
            <Textarea
              id="ev-fields"
              className="min-h-40 font-mono text-xs"
              value={fields}
              onChange={(e) => setFields(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A JSON list of key, label, type (text, select or checkbox),
              required and options. Coding tools can use the same schema through
              the API.
            </p>
          </div>
        </div>
      </details>
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save registration"}
      </Button>
    </form>
  );
}

export function ProjectEventsSection({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [items, setItems] = useState<ProjectEvent[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      projectEventsApi
        .list(projectId)
        .then(setItems)
        .catch((e) => setError(e.message)),
    [projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const router = useRouter();
  return (
    <section className="mt-8 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Registrations</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Branded booking pages and verified payments.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New event
        </Button>
      </div>
      {items.length ? (
        <div className="mt-4 divide-y">
          {items.map((e) => (
            <Link
              key={e.eventId}
              href={`/projects/${projectId}/events/${e.eventId}`}
              className="flex items-center justify-between gap-4 py-3 hover:text-primary"
            >
              <div>
                <p className="text-sm font-medium">{e.config.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {eventMoney(e.config.amountMinor, e.config.currency)} ·{" "}
                  {e.status}
                  {e.config.capacity ? ` · ${e.config.capacity} places` : ""}
                </p>
              </div>
              <span className="text-sm">Manage →</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Create a registration page, connect Paystack, and link it from any
          custom site.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New event</DrawerTitle>
            <DrawerDescription>
              Start with a draft. Connect payments before opening paid
              registration.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-auto px-5 pb-6">
            <SettingsForm
              value={{
                slug: "",
                status: "draft",
                config: initialConfig(projectName),
              }}
              busy={busy}
              onSave={async (input) => {
                setBusy(true);
                try {
                  const e = await projectEventsApi.save(projectId, input);
                  setOpen(false);
                  router.push(
                    `/projects/${projectId}/events/${e.eventId}?tab=settings`,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

export function ProjectEventManager({
  projectId,
  eventId,
}: {
  projectId: string;
  eventId: string;
}) {
  const [event, setEvent] = useState<ProjectEvent | null>(null),
    [account, setAccount] = useState<EventPaymentAccount>({ connected: false }),
    [bookings, setBookings] = useState<EventBooking[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<EventBooking | null>(null),
    [secretKey, setSecretKey] = useState(""),
    [signingSecret, setSigningSecret] = useState("");
  const query = useSearchParams(),
    router = useRouter();
  const tab =
    query.get("tab") === "settings"
      ? "settings"
      : query.get("tab") === "payments"
        ? "payments"
        : "bookings";
  const load = useCallback(async () => {
    try {
      const [events, a, b] = await Promise.all([
        projectEventsApi.list(projectId),
        projectEventsApi.account(projectId),
        projectEventsApi.registrations(projectId, eventId),
      ]);
      const found = events.find((e) => e.eventId === eventId);
      if (!found) throw new Error("Registration not found");
      setEvent(found);
      setAccount(a);
      setBookings(b.registrations);
      setNextOffset(b.nextOffset);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load registrations");
    }
  }, [projectId, eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed");
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const escape = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+\-@\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const table = [
      [
        "Reference",
        "Status",
        "Payment",
        "Quantity",
        "Name",
        "Email",
        "Phone",
        "Amount",
        "Currency",
        "Paid at",
      ],
      ...bookings.map((r) => [
        r.reference,
        r.status,
        r.payment_status,
        r.quantity,
        r.contact.name,
        r.contact.email,
        r.contact.phone,
        Number(r.amount_minor) / 100,
        r.currency,
        r.paid_at,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([table.map((r) => r.map(escape).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event?.slug || "event"}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!event)
    return (
      <div className="p-6">
        <p role={error ? "alert" : "status"}>
          {error || "Loading registration…"}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b px-6 py-5">
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-muted-foreground"
        >
          ← Project
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium">{event.config.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {event.status} ·{" "}
              {eventMoney(event.config.amountMinor, event.config.currency)}
              {event.config.capacity
                ? ` · ${event.config.capacity} places`
                : ""}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={event.registrationUrl} target="_blank" rel="noreferrer">
              Open registration
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
        <nav className="mt-5 flex gap-5" aria-label="Registration views">
          {(["bookings", "settings", "payments"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => router.replace(`?tab=${t}`)}
              className={`border-b-2 pb-2 text-sm capitalize ${tab === t ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
            >
              {t === "bookings" ? "Registrations" : t}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          {error && (
            <p className="mb-5 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-5 text-sm text-green-800" role="status">
              {notice}
            </p>
          )}
          {tab === "settings" ? (
            <div className="max-w-2xl">
              <SettingsForm
                key={event.eventId + JSON.stringify(event.config)}
                value={event}
                busy={busy}
                onSave={async (input) => {
                  setBusy(true);
                  try {
                    setEvent(
                      await projectEventsApi.save(
                        projectId,
                        input,
                        event.eventId,
                      ),
                    );
                    setNotice("Registration saved.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          ) : tab === "payments" ? (
            <div className="max-w-xl space-y-5">
              <h2 className="text-lg font-medium">Paystack</h2>
              <p className="text-sm text-muted-foreground">
                {account.connected
                  ? `Connected in ${account.mode} mode.`
                  : "Connect the Paystack account that will receive these event payments."}{" "}
                Credentials are encrypted and used only on the server.
              </p>
              {account.webhookUrl && (
                <div className="space-y-2">
                  <Label htmlFor="event-webhook">Webhook address</Label>
                  <Input
                    id="event-webhook"
                    readOnly
                    value={account.webhookUrl}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use this in Paystack’s API configuration. Existing CommonLab
                    accounts also route event notifications through their
                    current payment webhook.
                  </p>
                </div>
              )}
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    setAccount(
                      await projectEventsApi.connect(projectId, {
                        secretKey,
                        signingSecret,
                      }),
                    );
                    setSecretKey("");
                    setSigningSecret("");
                    setNotice("Paystack connected.");
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="event-secret">Paystack secret key</Label>
                  <Input
                    id="event-secret"
                    type="password"
                    autoComplete="new-password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    required
                    placeholder="sk_live_…"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-signing">
                    Webhook signing secret, if enabled
                  </Label>
                  <Input
                    id="event-signing"
                    type="password"
                    autoComplete="new-password"
                    value={signingSecret}
                    onChange={(e) => setSigningSecret(e.target.value)}
                    placeholder="whsec_…"
                  />
                </div>
                <Button disabled={busy} type="submit">
                  {busy
                    ? "Connecting…"
                    : account.connected
                      ? "Update connection"
                      : "Connect Paystack"}
                </Button>
              </form>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {bookings
                    .filter((b) => b.status === "confirmed")
                    .reduce((n, b) => n + b.quantity, 0)}{" "}
                  confirmed places in this view
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void load()}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportCsv}
                    disabled={!bookings.length}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Export this view
                  </Button>
                </div>
              </div>
              {bookings.length ? (
                <div className="divide-y rounded-xl border bg-white">
                  {bookings.map((b) => (
                    <button
                      type="button"
                      key={b.registration_id}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40"
                      onClick={() => setSelected(b)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {b.contact.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {b.quantity}{" "}
                          {b.quantity === 1
                            ? event.config.participantLabel.toLowerCase()
                            : event.config.participantPlural.toLowerCase()}{" "}
                          · {b.reference.slice(-10).toUpperCase()}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-xs ${b.status === "review" ? "text-orange-800" : b.status === "confirmed" ? "text-green-800" : "text-muted-foreground"}`}
                        >
                          {b.status}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {eventMoney(Number(b.amount_minor), b.currency)} ·{" "}
                          {b.payment_status}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Registrations will appear here when families begin booking.
                </p>
              )}
              {nextOffset !== null && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() =>
                    void run(async () => {
                      const next = await projectEventsApi.registrations(
                        projectId,
                        eventId,
                        nextOffset,
                      );
                      setBookings((old) => [...old, ...next.registrations]);
                      setNextOffset(next.nextOffset);
                    })
                  }
                >
                  Load more
                </Button>
              )}
              <p className="mt-5 text-xs text-muted-foreground">
                These contact and participant details are private to this
                project’s owner. Keep exports out of the shared programme Drive.
              </p>
            </>
          )}
        </div>
      </div>
      <Drawer
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Booking details</DrawerTitle>
            <DrawerDescription>{selected?.reference}</DrawerDescription>
          </DrawerHeader>
          {selected && (
            <div className="space-y-5 overflow-auto px-5 pb-6">
              <dl className="space-y-3 text-sm">
                {[
                  ["Name", selected.contact.name],
                  ["Email", selected.contact.email],
                  ["Phone", selected.contact.phone],
                  ["Registration", selected.status],
                  ["Payment", selected.payment_status],
                  [
                    "Total",
                    eventMoney(
                      Number(selected.amount_minor),
                      selected.currency,
                    ),
                  ],
                  [
                    "Paid at",
                    selected.paid_at
                      ? new Date(selected.paid_at).toLocaleString()
                      : "Not paid",
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-1 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.payment_details?.reason && (
                <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
                  {selected.payment_details.reason}
                </p>
              )}
              {selected.participants.map((p, i) => (
                <div key={i} className="rounded-lg border p-3 text-sm">
                  <p className="mb-2 font-medium">
                    {event.config.participantLabel} {i + 1}
                  </p>
                  {Object.entries(p).map(([key, value]) => (
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
        </DrawerContent>
      </Drawer>
    </div>
  );
}
