"use client";
import React, { useEffect, useRef, useState, type FormEvent } from "react";

export type PublicGuidePage = {
  slug: string;
  title: string;
  chatEnabled: boolean;
  chatName?: string;
  chatAvatarUrl?: string;
  chatGreeting?: string;
};
type Message = { role: "user" | "assistant"; content: string };
export function PublicPageChat({
  page,
  open,
  onOpenChange,
  apiBase = "https://api.agentcommons.io",
  floatingTrigger = true,
}: {
  page: PublicGuidePage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase?: string;
  floatingTrigger?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null),
    entry = useRef<HTMLTextAreaElement>(null),
    end = useRef<HTMLDivElement>(null),
    pending = useRef<AbortController | null>(null);
  const name = page.chatName || "Page guide";
  useEffect(() => {
    setMessages([]);
    setError("");
    setInput("");
  }, [page.slug]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    entry.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),textarea:not(:disabled),a[href]",
        ) || [],
      );
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [open, onOpenChange]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy, error]);
  useEffect(() => () => pending.current?.abort(), []);
  if (!page.chatEnabled) return null;
  const avatar = (large = false) =>
    page.chatAvatarUrl ? (
      <img
        src={page.chatAvatarUrl}
        alt=""
        className={large ? "acpg-avatar acpg-avatar-large" : "acpg-avatar"}
      />
    ) : (
      <span className="acpg-avatar acpg-avatar-fallback" aria-hidden="true">
        ✦
      </span>
    );
  const ask = async (question: string) => {
    if (pending.current || !question.trim()) return;
    const thread: Message[] = [
      ...messages,
      { role: "user", content: question.trim() },
    ];
    setMessages(thread);
    setInput("");
    setError("");
    setBusy(true);
    const abort = new AbortController();
    pending.current = abort;
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
      const response = await fetch(
        `${apiBase.replace(/\/$/, "")}/v1/project-pages/${encodeURIComponent(page.slug)}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify({
            messages: thread
              .slice(-8)
              .map((m) => ({ ...m, content: m.content.slice(0, 1600) })),
          }),
          signal: abort.signal,
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.message === "string"
            ? result.message
            : "The guide is busy. Please try again in a moment.",
        );
      if (!result.data?.answer)
        throw new Error("The guide could not answer just now.");
      setMessages((old) => [
        ...old,
        { role: "assistant", content: result.data.answer },
      ]);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "AbortError"
          ? e.message
          : "The guide took too long. Please try again.",
      );
    } finally {
      clearTimeout(timer);
      pending.current = null;
      setBusy(false);
      entry.current?.focus();
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };
  return (
    <>
      {floatingTrigger && !open && (
        <button
          className="acpg-trigger"
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={`Ask ${name}`}
          aria-haspopup="dialog"
        >
          {avatar()}
          <span>Ask {name}</span>
          <span aria-hidden="true">↗</span>
        </button>
      )}
      {open && (
        <div className="acpg-overlay">
          <button
            className="acpg-backdrop"
            aria-label="Close guide"
            type="button"
            onClick={() => onOpenChange(false)}
            tabIndex={-1}
          />
          <div
            className="acpg-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="acpg-title"
            ref={dialog}
          >
            <header className="acpg-header">
              {avatar()}
              <div>
                <h2 id="acpg-title">{name}</h2>
                <p>Here to help you plan</p>
              </div>
              <button
                className="acpg-close"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close guide"
              >
                ×
              </button>
            </header>
            <div
              className="acpg-messages"
              aria-live="polite"
              aria-relevant="additions text"
            >
              <div className="acpg-welcome">
                {avatar(true)}
                <h3>A question before you join?</h3>
                <p>
                  {page.chatGreeting ||
                    "Hi! Ask me about the programme, practical details or registration."}
                </p>
              </div>
              {!messages.length && (
                <div className="acpg-suggestions">
                  {["What can I expect?", "How do I register?"].map((q) => (
                    <button key={q} type="button" onClick={() => void ask(q)}>
                      {q} <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`acpg-message acpg-${m.role}`}>
                  <span className="acpg-sr">
                    {m.role === "user" ? "You" : name}:{" "}
                  </span>
                  {m.content}
                </div>
              ))}
              {busy && (
                <p className="acpg-thinking" role="status">
                  Thinking…
                </p>
              )}
              {error && (
                <div className="acpg-error" role="alert">
                  {error}
                </div>
              )}
              <div ref={end} />
            </div>
            <footer className="acpg-footer">
              <form onSubmit={submit}>
                <label htmlFor="acpg-question" className="acpg-sr">
                  Your question
                </label>
                <textarea
                  id="acpg-question"
                  ref={entry}
                  value={input}
                  maxLength={1600}
                  rows={2}
                  placeholder="Ask your question…"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask(input);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send question"
                >
                  ↑
                </button>
              </form>
              <p>AI guide. Keep personal and payment details out of chat.</p>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

export function EventRegistrationExperience({
  event,
  apiBase,
  reference,
}: {
  event: import("./event-registration").PublicEvent;
  apiBase?: string;
  reference?: string;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState<PublicGuidePage | null>(null);
  useEffect(() => {
    if (!event.pageSlug) return;
    const abort = new AbortController();
    fetch(
      `${(apiBase || "https://api.agentcommons.io").replace(/\/$/, "")}/v1/project-pages/${encodeURIComponent(event.pageSlug)}`,
      { credentials: "omit", signal: abort.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (r?.data?.chatEnabled) setPage(r.data);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [event.pageSlug, apiBase]);
  return (
    <>
      <Registration
        event={event}
        apiBase={apiBase}
        reference={reference}
        onAsk={page ? () => setOpen(true) : undefined}
      />
      {page && (
        <PublicPageChat
          page={page}
          apiBase={apiBase}
          open={open}
          onOpenChange={setOpen}
          floatingTrigger={false}
        />
      )}
    </>
  );
}
import { EventRegistration as Registration } from "./event-registration";
