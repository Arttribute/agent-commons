"use client";
import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

export type RegistrationField = {
  key: string;
  label: string;
  type: "text" | "select" | "checkbox";
  required: boolean;
  options?: string[];
};
export type PublicEvent = {
  slug: string;
  status: string;
  title: string;
  summary: string;
  when: string;
  location: string;
  amountMinor: number;
  currency: string;
  capacity: number | null;
  available: number | null;
  maxPerOrder: number;
  participantLabel: string;
  participantPlural: string;
  contactLabel: string;
  eyebrow: string;
  fields: RegistrationField[];
  agreementText: string;
  terms: string;
  supportEmail: string;
  supportPhone: string;
  pageSlug?: string;
  theme: {
    accent: string;
    background: string;
    ink: string;
    logoUrl: string;
    imageUrl: string;
  };
};
type Receipt = {
  reference: string;
  bookingCode: string;
  status: string;
  paymentStatus: string;
  quantity: number;
  amountMinor: number;
  originalAmountMinor?: number;
  discountAmountMinor?: number;
  discountCode?: string | null;
  currency: string;
  checkoutUrl: string | null;
  paidAt: string | null;
  expiresAt: string;
  paymentDetails?: {
    reason?: string;
    amountMinor?: number;
    currency?: string;
  } | null;
};
export const eventMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 100 ? 2 : 0,
  })
    .format(amount / 100)
    .replace("KES", "KSh");

export function EventRegistration({
  event,
  apiBase = "https://api.agentcommons.io",
  reference,
  onAsk,
}: {
  event: PublicEvent;
  apiBase?: string;
  reference?: string;
  onAsk?: () => void;
}) {
  const [participants, setParticipants] = useState<
    Array<Record<string, string | boolean>>
  >([{}]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checking, setChecking] = useState(Boolean(reference)),
    [copied, setCopied] = useState(false);
  const [code, setCode] = useState(""),
    [quote, setQuote] = useState<{
      amountMinor: number;
      originalAmountMinor: number;
      discountAmountMinor: number;
      discountCode: string;
    } | null>(null),
    [codeError, setCodeError] = useState("");
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get("code");
    if (incoming && incoming.length <= 32)
      setCode(incoming.trim().toUpperCase());
  }, []);
  useEffect(() => {
    setQuote(null);
    setCodeError("");
    key.current = "";
  }, [participants.length]);
  const key = useRef(""),
    active = useRef(true);
  const root = `${apiBase.replace(/\/$/, "")}/v1/public-events/${encodeURIComponent(event.slug)}`;
  const full = event.status !== "open" || event.available === 0;
  const infoUrl = event.pageSlug ? `/p/${event.pageSlug}` : null;
  const style = {
    "--acer-accent": event.theme.accent,
    "--acer-paper": event.theme.background,
    "--acer-ink": event.theme.ink,
  } as CSSProperties;
  async function request<T = Receipt>(
    path: string,
    body?: unknown,
  ): Promise<T> {
    const r = await fetch(root + path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
    });
    const j = await r.json();
    if (!r.ok)
      throw new Error(
        typeof j.message === "string"
          ? j.message
          : "We could not complete that request. Please try again.",
      );
    return j.data as T;
  }
  useEffect(() => {
    active.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ref = /^ac_evt_[a-f0-9]{48}$/.test(reference || "")
      ? reference
      : null;
    if (ref) {
      const check = async (attempt = 0) => {
        try {
          const r = await request(
            `/payments/${ref}${attempt === 0 || attempt === 5 ? "/verify" : ""}`,
            attempt === 0 || attempt === 5 ? {} : undefined,
          );
          if (!active.current) return;
          setReceipt(r);
          setChecking(false);
          if (r.status === "pending" && attempt < 8)
            timer = setTimeout(() => void check(attempt + 1), 2500);
        } catch (e) {
          if (active.current) {
            setError(e instanceof Error ? e.message : "Please try again.");
            setChecking(false);
          }
        }
      };
      void check();
    } else setChecking(false);
    return () => {
      active.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [reference, root]);
  const participantValue = (
    index: number,
    field: string,
    value: string | boolean,
  ) =>
    setParticipants((old) =>
      old.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  const startAgain = () => {
    key.current = "";
    setReceipt(null);
    setError("");
    setCode("");
    setQuote(null);
    setCodeError("");
    window.history.replaceState({}, "", window.location.pathname);
  };
  async function applyDiscount() {
    setBusy(true);
    setCodeError("");
    setError("");
    try {
      const result = await request<{
        amountMinor: number;
        originalAmountMinor: number;
        discountAmountMinor: number;
        discountCode: string;
      }>("/quote", { quantity: participants.length, code });
      setQuote(result);
      setCode(result.discountCode || "");
      key.current = "";
    } catch (e) {
      setQuote(null);
      setCodeError(e instanceof Error ? e.message : "Please check the code.");
    } finally {
      setBusy(false);
    }
  }
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || full) return;
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    if (code.trim() && !quote) {
      setError("Apply or remove the discount code before continuing.");
      setBusy(false);
      return;
    }
    key.current ||= crypto.randomUUID();
    const input = {
      idempotencyKey: key.current,
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      agreed: data.get("agreed") === "on",
      website: data.get("website") || "",
      participants,
      discountCode: quote?.discountCode || "",
      expectedAmountMinor: quote?.amountMinor,
    };
    try {
      let result = await request("/checkout", input);
      // A concurrent retry may reach the server while Paystack is initializing.
      for (
        let n = 0;
        n < 4 && result.status === "pending" && !result.checkoutUrl;
        n++
      ) {
        await new Promise((r) => setTimeout(r, 700));
        result = await request("/checkout", input);
      }
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?reference=${result.reference}`,
      );
      if (result.status === "confirmed" || result.status === "review") {
        setReceipt(result);
        return;
      }
      if (!result.checkoutUrl)
        throw new Error("Checkout is still preparing. Please try again.");
      const url = new URL(result.checkoutUrl);
      if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com")
        throw new Error("The checkout address is invalid.");
      // Keep only the opaque reference, never family details, in browser storage.
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?reference=${result.reference}`,
      );
      window.location.assign(url.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const total = quote?.amountMinor ?? event.amountMinor * participants.length;
  const confirmed = receipt?.status === "confirmed";
  return (
    <div className="acer" style={style}>
      <div className="acer-shell">
        <header className="acer-nav">
          {event.theme.logoUrl ? (
            <img
              src={event.theme.logoUrl}
              alt={event.title}
              className="acer-logo"
            />
          ) : (
            <span className="acer-wordmark">{event.title}</span>
          )}
          {infoUrl && <a href={infoUrl}>← Programme</a>}
        </header>
        <main className="acer-grid">
          <aside className="acer-summary">
            <span className="acer-eyebrow">
              {receipt ? "Your booking" : event.eyebrow}
            </span>
            <h1>{event.title}</h1>
            <p className="acer-description">{event.summary}</p>
            {event.theme.imageUrl && (
              <img className="acer-hero" src={event.theme.imageUrl} alt="" />
            )}
            <dl className="acer-facts">
              <div>
                <dt>When</dt>
                <dd>{event.when}</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>{event.location}</dd>
              </div>
            </dl>
            <div className="acer-price">
              <strong>{eventMoney(event.amountMinor, event.currency)}</strong>
              <span>per {event.participantLabel.toLowerCase()}</span>
            </div>
            {event.capacity !== null && (
              <p className="acer-small">{event.capacity} places in total</p>
            )}
            {onAsk && (
              <button
                className="acer-text-button"
                type="button"
                onClick={onAsk}
              >
                Ask the guide a question ↗
              </button>
            )}
          </aside>
          <section className="acer-card" aria-label="Registration">
            {checking ? (
              <div role="status">
                <h2>Checking your payment…</h2>
                <p>You can keep this page open while we confirm it.</p>
              </div>
            ) : receipt ? (
              <>
                <div className="acer-status" aria-hidden="true">
                  {confirmed ? "✓" : receipt.status === "review" ? "!" : "…"}
                </div>
                <h2>
                  {confirmed
                    ? "You’re registered."
                    : receipt.status === "review"
                      ? "Payment received. Let’s check your place."
                      : "Your payment is not confirmed yet."}
                </h2>
                <p>
                  {confirmed
                    ? `We look forward to welcoming ${receipt.quantity === 1 ? "you" : `your ${receipt.quantity} participants`}. Save your booking reference below.`
                    : receipt.status === "review"
                      ? "The team needs to review this booking. Please keep your reference and payment receipt."
                      : "A successful checkout will confirm your place here. You can check again or return to checkout."}
                </p>
                <dl className="acer-receipt">
                  <div>
                    <dt>Booking reference</dt>
                    <dd>{receipt.bookingCode}</dd>
                  </div>
                  <div>
                    <dt>
                      {receipt.paymentStatus === "paid" ? "Paid" : "Total"}
                    </dt>
                    <dd>
                      {eventMoney(
                        receipt.paymentDetails?.amountMinor ??
                          receipt.amountMinor,
                        receipt.paymentDetails?.currency ?? receipt.currency,
                      )}
                    </dd>
                  </div>
                  {Boolean(receipt.discountAmountMinor) && (
                    <div>
                      <dt>Discount {receipt.discountCode}</dt>
                      <dd>
                        −
                        {eventMoney(
                          receipt.discountAmountMinor!,
                          receipt.currency,
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      {receipt.quantity > 1
                        ? event.participantPlural
                        : event.participantLabel}
                    </dt>
                    <dd>{receipt.quantity}</dd>
                  </div>
                </dl>
                {confirmed && (
                  <p className="acer-small">
                    We’ll use your contact details to share joining information.
                  </p>
                )}
                <div className="acer-actions">
                  <button
                    type="button"
                    className="acer-button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(window.location.href)
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError(
                            "Copy the link from your address bar to save it.",
                          ),
                        );
                    }}
                  >
                    {copied ? "Link copied" : "Save booking link"}
                  </button>
                  {confirmed && (
                    <button
                      className="acer-secondary"
                      type="button"
                      onClick={() => window.print()}
                    >
                      Print receipt
                    </button>
                  )}
                </div>
                {!confirmed && receipt.status !== "review" && (
                  <div className="acer-actions">
                    <button
                      className="acer-secondary"
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          setReceipt(
                            await request(
                              `/payments/${receipt.reference}/verify`,
                              {},
                            ),
                          );
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Please try again.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Check payment
                    </button>
                    {receipt.checkoutUrl && (
                      <a className="acer-secondary" href={receipt.checkoutUrl}>
                        Continue payment
                      </a>
                    )}
                  </div>
                )}
                <button
                  className="acer-text-button"
                  type="button"
                  onClick={startAgain}
                >
                  Make another booking
                </button>
              </>
            ) : full ? (
              <>
                <h2>
                  {event.available === 0
                    ? "All places are currently taken."
                    : "Registration is closed."}
                </h2>
                <p>
                  {event.available === 0
                    ? "Some places may be held in checkout. Please try again later."
                    : "Please check the programme page for the latest information."}
                </p>
                {infoUrl && (
                  <a className="acer-button" href={infoUrl}>
                    Back to the programme
                  </a>
                )}
              </>
            ) : (
              <>
                <span className="acer-eyebrow">Your place starts here</span>
                <h2>Register in a moment.</h2>
                <p className="acer-small">
                  Your details, then secure checkout. No account needed.
                </p>
                <form onSubmit={submit}>
                  <div className="acer-field">
                    <label htmlFor="acer-name">{event.contactLabel}</label>
                    <input
                      id="acer-name"
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </div>
                  <div className="acer-field">
                    <label htmlFor="acer-email">Email</label>
                    <input
                      id="acer-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={200}
                    />
                  </div>
                  <div className="acer-field">
                    <label htmlFor="acer-phone">Phone number</label>
                    <input
                      id="acer-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="e.g. +254 7…"
                      required
                      minLength={7}
                      maxLength={30}
                    />
                  </div>
                  <div aria-hidden="true" className="acer-honey">
                    <label>
                      Website
                      <input name="website" autoComplete="off" tabIndex={-1} />
                    </label>
                  </div>
                  {participants.map((p, i) => (
                    <fieldset key={i} className="acer-participant">
                      <legend>
                        {event.participantLabel}
                        {participants.length > 1 ? ` ${i + 1}` : ""}
                      </legend>
                      {participants.length > 1 && (
                        <button
                          className="acer-remove"
                          type="button"
                          aria-label={`Remove ${event.participantLabel.toLowerCase()} ${i + 1}`}
                          onClick={() =>
                            setParticipants((old) =>
                              old.filter((_, n) => n !== i),
                            )
                          }
                        >
                          Remove
                        </button>
                      )}
                      {event.fields.map((f) => (
                        <div className="acer-field" key={f.key}>
                          <label htmlFor={`acer-${i}-${f.key}`}>
                            {f.label}
                            {!f.required && <span> (optional)</span>}
                          </label>
                          {f.type === "select" ? (
                            <select
                              id={`acer-${i}-${f.key}`}
                              value={String(p[f.key] || "")}
                              required={f.required}
                              onChange={(e) =>
                                participantValue(i, f.key, e.target.value)
                              }
                            >
                              <option value="">Choose</option>
                              {f.options?.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : f.type === "checkbox" ? (
                            <input
                              id={`acer-${i}-${f.key}`}
                              type="checkbox"
                              checked={p[f.key] === true}
                              required={f.required}
                              onChange={(e) =>
                                participantValue(i, f.key, e.target.checked)
                              }
                            />
                          ) : (
                            <input
                              id={`acer-${i}-${f.key}`}
                              value={String(p[f.key] || "")}
                              maxLength={300}
                              required={f.required}
                              onChange={(e) =>
                                participantValue(i, f.key, e.target.value)
                              }
                            />
                          )}
                        </div>
                      ))}
                    </fieldset>
                  ))}
                  {participants.length <
                    Math.min(event.maxPerOrder, event.available ?? 10) && (
                    <button
                      type="button"
                      className="acer-text-button"
                      onClick={() => setParticipants((old) => [...old, {}])}
                    >
                      + Add another {event.participantLabel.toLowerCase()}
                    </button>
                  )}
                  {event.amountMinor > 0 && (
                    <details className="acer-code">
                      <summary>Have a discount code?</summary>
                      <div className="acer-field">
                        <label htmlFor="acer-code">Discount code</label>
                        <div className="acer-code-input">
                          <input
                            id="acer-code"
                            value={code}
                            maxLength={32}
                            autoComplete="off"
                            onChange={(e) => {
                              setCode(e.target.value.toUpperCase());
                              setQuote(null);
                              setCodeError("");
                              key.current = "";
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void applyDiscount();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="acer-secondary"
                            disabled={busy || !code.trim()}
                            onClick={() => void applyDiscount()}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                      {codeError && (
                        <p className="acer-error" role="alert">
                          {codeError}
                        </p>
                      )}
                      {quote && (
                        <p className="acer-code-success" role="status">
                          {quote.discountCode} applied. You save{" "}
                          {eventMoney(
                            quote.discountAmountMinor,
                            event.currency,
                          )}
                          .<br />
                          <strong>
                            Total:{" "}
                            {eventMoney(quote.amountMinor, event.currency)}
                          </strong>{" "}
                          <button
                            type="button"
                            className="acer-text-button"
                            onClick={() => {
                              setCode("");
                              setQuote(null);
                              key.current = "";
                            }}
                          >
                            Remove
                          </button>
                        </p>
                      )}
                    </details>
                  )}
                  <label className="acer-agreement">
                    <input type="checkbox" name="agreed" required />
                    <span>{event.agreementText}</span>
                  </label>
                  {event.terms && (
                    <details className="acer-terms">
                      <summary>Registration details</summary>
                      <p>{event.terms}</p>
                    </details>
                  )}
                  <button
                    className="acer-button acer-pay"
                    disabled={busy}
                    type="submit"
                  >
                    {busy
                      ? "Preparing checkout…"
                      : total
                        ? `Register & pay ${eventMoney(total, event.currency)}`
                        : "Confirm registration"}
                    <span aria-hidden="true">↗</span>
                  </button>
                  <p className="acer-secure">
                    {event.amountMinor
                      ? "Secure payment with Paystack. Card details stay with Paystack."
                      : "Your place is confirmed when you complete registration."}
                  </p>
                </form>
              </>
            )}
            {error && (
              <p className="acer-error" role="alert">
                {error}
                {/expired|start again|changed|did not finish/i.test(error) && (
                  <button
                    type="button"
                    className="acer-text-button"
                    onClick={startAgain}
                  >
                    Start a new checkout
                  </button>
                )}
              </p>
            )}
            {(event.supportEmail || event.supportPhone) && (
              <p className="acer-small acer-support">
                Booking help:{" "}
                {event.supportEmail && (
                  <a href={`mailto:${event.supportEmail}`}>
                    {event.supportEmail}
                  </a>
                )}
                {event.supportPhone && <span> {event.supportPhone}</span>}
              </p>
            )}
          </section>
        </main>
        <footer className="acer-footer">
          Made for curious minds.
          {infoUrl && <a href={infoUrl}>Programme details ↗</a>}
        </footer>
      </div>
    </div>
  );
}
