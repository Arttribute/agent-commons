"use client";

/**
 * Context-aware results interpreter.
 *
 * Renders workflow output by what it actually IS — an image as an image, text
 * as formatted text, audio/video with players, an email or calendar event as an
 * interactive card, generic/custom tool output as a clean card — instead of the
 * old grey JSON dump. Driven by the string-first `WorkflowValue` envelope
 * (`lib/workflows/workflow-value.ts`); unknown shapes fall back to pretty JSON.
 */

import { useState, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CalendarClock,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WorkflowValue,
  WorkflowValueKind,
  toWorkflowValues,
} from "@/lib/workflows/workflow-value";

interface WorkflowResultProps {
  /** Pre-normalized envelopes from the backend (nodeResults[*].value). */
  value?: WorkflowValue[] | null;
  /** Raw value (final output / legacy run) — normalized on the fly. */
  raw?: unknown;
  label?: string;
  /** Denser layout for inline per-step previews. */
  compact?: boolean;
  className?: string;
}

export function WorkflowResult({ value, raw, label, compact, className }: WorkflowResultProps) {
  const values = value && value.length ? value : toWorkflowValues(raw, label);
  if (!values.length) {
    return <p className={cn("text-xs text-muted-foreground", className)}>No output</p>;
  }
  return (
    <div className={cn("space-y-2", className)}>
      {values.map((v, i) => (
        <ValueRenderer key={i} value={v} compact={compact} />
      ))}
    </div>
  );
}

function ValueRenderer({ value, compact }: { value: WorkflowValue; compact?: boolean }) {
  const Renderer = RENDERERS[value.kind] ?? RENDERERS.json;
  return <Renderer value={value} compact={compact} />;
}

type RendererProps = { value: WorkflowValue; compact?: boolean };
type Renderer = (props: RendererProps) => ReactElement;

const mediaMax = (compact?: boolean) => (compact ? "max-h-40" : "max-h-72");

/* ── per-kind renderers ─────────────────────────────────────────────────── */

const TextRenderer: Renderer = ({ value }) => (
  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
    {value.text || <span className="text-muted-foreground">—</span>}
  </p>
);

const MarkdownRenderer: Renderer = ({ value }) => (
  <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-pre:my-2 prose-pre:bg-muted">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, ...props }) => (
          <a target="_blank" rel="noopener noreferrer" {...props} />
        ),
        img: ({ node, ...props }) => (
          <img className="rounded-md" loading="lazy" {...props} />
        ),
      }}
    >
      {value.text}
    </ReactMarkdown>
  </div>
);

const ImageRenderer: Renderer = ({ value, compact }) => {
  const url = value.data?.url ?? value.text;
  if (!url) return <JsonRenderer value={value} compact={compact} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={value.label ?? "Result image"}
        loading="lazy"
        className={cn(
          "w-auto rounded-lg border border-border object-contain",
          mediaMax(compact),
        )}
      />
    </a>
  );
};

const AudioRenderer: Renderer = ({ value }) => {
  const url = value.data?.url ?? value.text;
  return <audio controls src={url} className="w-full" />;
};

const VideoRenderer: Renderer = ({ value, compact }) => {
  const url = value.data?.url ?? value.text;
  return (
    <video
      controls
      src={url}
      className={cn("w-full rounded-lg border border-border", mediaMax(compact))}
    />
  );
};

const LinkRenderer: Renderer = ({ value }) => {
  const url = value.data?.url ?? value.text;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-primary transition-colors hover:bg-muted"
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{value.text || url}</span>
    </a>
  );
};

const FileRenderer: Renderer = ({ value }) => {
  const url = value.data?.url;
  const name = value.data?.name ?? value.text ?? "File";
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-2.5">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{name}</p>
        {value.mime && <p className="text-[10px] text-muted-foreground">{value.mime}</p>}
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
        >
          <Download className="h-3 w-3" />
          Open
        </a>
      )}
    </div>
  );
};

const EmailRenderer: Renderer = ({ value }) => {
  const d = value.data ?? {};
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium">{d.status ? `Email · ${d.status}` : "Email"}</span>
      </div>
      <div className="space-y-1.5 p-3 text-xs">
        {d.to && <Field label="To" value={String(d.to)} />}
        {d.from && <Field label="From" value={String(d.from)} />}
        {d.subject && <Field label="Subject" value={String(d.subject)} bold />}
        {d.body && (
          <p className="whitespace-pre-wrap break-words pt-1 text-muted-foreground">
            {String(d.body)}
          </p>
        )}
      </div>
    </div>
  );
};

const CalendarRenderer: Renderer = ({ value }) => {
  const d = value.data ?? {};
  const when = [d.start, d.end].filter(Boolean).join(" → ");
  const attendees = Array.isArray(d.attendees)
    ? d.attendees
        .map((a: any) => (typeof a === "string" ? a : a?.email ?? a?.name))
        .filter(Boolean)
    : [];
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{d.title ?? value.text ?? "Event"}</span>
      </div>
      <div className="space-y-1.5 p-3 text-xs">
        {when && <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarClock className="h-3 w-3" />{when}</div>}
        {d.location && <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3" />{String(d.location)}</div>}
        {attendees.length > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3 w-3" />
            <span className="truncate">{attendees.join(", ")}</span>
          </div>
        )}
        {d.description && <p className="whitespace-pre-wrap pt-1 text-muted-foreground">{String(d.description)}</p>}
        {d.link && (
          <a href={String(d.link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 pt-1 text-primary">
            <ExternalLink className="h-3 w-3" /> Open event
          </a>
        )}
      </div>
    </div>
  );
};

const ToolResultRenderer: Renderer = ({ value }) => {
  const status = value.data?.status ?? (value.data?.success === false ? "failed" : value.data?.success === true ? "ok" : undefined);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{value.text || "Tool result"}</span>
        {status && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{String(status)}</span>
        )}
      </div>
      {value.data && <RawDisclosure data={value.data} />}
    </div>
  );
};

const NumberBoolRenderer: Renderer = ({ value }) => (
  <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-sm">
    {value.text}
  </span>
);

const JsonRenderer: Renderer = ({ value }) => {
  const text = value.text || (value.data ? JSON.stringify(value.data, null, 2) : "—");
  return (
    <div className="group relative">
      <CopyButton text={text} />
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2.5 font-mono text-[11px] text-muted-foreground">
        {text}
      </pre>
    </div>
  );
};

const RENDERERS: Record<WorkflowValueKind, Renderer> = {
  text: TextRenderer,
  markdown: MarkdownRenderer,
  number: NumberBoolRenderer,
  boolean: NumberBoolRenderer,
  json: JsonRenderer,
  image: ImageRenderer,
  audio: AudioRenderer,
  video: VideoRenderer,
  file: FileRenderer,
  link: LinkRenderer,
  email: EmailRenderer,
  calendar_event: CalendarRenderer,
  tool_result: ToolResultRenderer,
};

/* ── shared bits ────────────────────────────────────────────────────────── */

function Field({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-words", bold && "font-medium")}>{value}</span>
    </div>
  );
}

function RawDisclosure({ data }: { data: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all border-t border-border bg-muted/30 p-2.5 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute right-1.5 top-1.5 z-10 rounded-md border border-border bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100"
      aria-label="Copy"
    >
      <Copy className={cn("h-3 w-3", copied ? "text-emerald-500" : "text-muted-foreground")} />
    </button>
  );
}
