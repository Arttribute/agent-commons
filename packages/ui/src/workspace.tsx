"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  type PointerEvent,
} from "react";

/** Shared surface: hosts retain their own streaming, uploads and agent routing. */
export const ComposerSurface = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function ComposerSurface({ className = "", ...props }, ref) {
  return <div ref={ref} className={`ac-composer ${className}`} {...props} />;
});
export const ComposerTextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function ComposerTextArea({ className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`ac-composer-input ${className}`}
      {...props}
    />
  );
});
export type ComposerAttachment = {
  id: string;
  name: string;
  status?: "uploading" | "ready" | "error";
  url?: string;
  type?: string;
};
/**
 * Composer icons. The package deliberately carries no icon dependency, so the
 * few glyphs the Commons composer uses are inlined at the same 16px lucide
 * geometry the rest of Commons draws them at.
 */
function Icon({
  path,
  size = 16,
  className = "",
}: {
  path: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
const PlusIcon = (props: { size?: number }) => (
  <Icon {...props} path={<><path d="M5 12h14" /><path d="M12 5v14" /></>} />
);
const ArrowUpIcon = (props: { size?: number }) => (
  <Icon {...props} path={<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>} />
);
const SpinnerIcon = (props: { size?: number }) => (
  <Icon {...props} className="ac-spin" path={<path d="M21 12a9 9 0 1 1-6.219-8.56" />} />
);
const ChevronIcon = (props: { size?: number }) => (
  <Icon {...props} path={<path d="m6 9 6 6 6-6" />} />
);
const CheckIcon = (props: { size?: number }) => (
  <Icon {...props} path={<path d="M20 6 9 17l-5-5" />} />
);
const CloseIcon = (props: { size?: number }) => (
  <Icon {...props} path={<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>} />
);
const FileIcon = (props: { size?: number }) => (
  <Icon
    {...props}
    path={<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5" /></>}
  />
);

/**
 * A label-and-chevron button that opens a small list. Native selects cannot be
 * styled to match the Commons composer, and their platform chrome is the one
 * thing that made the Arcade composer read as a different product.
 */
function ComposerSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value?: string;
  options: readonly { id: string; name: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!options.length) return null;
  const selected = options.find((option) => option.id === value) ?? options[0];
  return (
    <div className="ac-composer-menu" ref={container}>
      <button
        type="button"
        className="ac-composer-pill"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${label}: ${selected?.name ?? ""}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ac-composer-pill-label">{selected?.name}</span>
        <ChevronIcon size={13} />
      </button>
      {open && (
        <div className="ac-composer-popover" role="listbox" aria-label={label}>
          <p className="ac-composer-popover-heading">{label}</p>
          {options.map((option) => (
            <button
              type="button"
              key={option.id}
              role="option"
              aria-selected={option.id === selected?.id}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span>{option.name}</span>
              {option.id === selected?.id && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  placeholder = "What would you like to create?",
  agents = [],
  agentId,
  onAgentChange,
  models = [],
  modelId,
  onModelChange,
  attachments = [],
  onFiles,
  onRemoveAttachment,
  context,
  footer,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  agents?: readonly { id: string; name: string }[];
  agentId?: string;
  onAgentChange?: (id: string) => void;
  models?: readonly { id: string; name: string }[];
  modelId?: string;
  onModelChange?: (id: string) => void;
  attachments?: readonly ComposerAttachment[];
  onFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  context?: ReactNode;
  footer?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = attachments.some((a) => a.status === "uploading");
  const sendable = Boolean(value.trim()) && !disabled && !busy && !uploading;
  return (
    <ComposerSurface
      className={dragging ? "ac-composer-dragging" : ""}
      onDragOver={(e) => {
        if (!onFiles || busy) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        if (!onFiles || busy) return;
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {context && <div className="ac-composer-context">{context}</div>}
      {!!attachments.length && (
        <div className="ac-composer-attachments">
          {attachments.map((a) => (
            <span
              key={a.id}
              className={`ac-attachment ${a.status === "error" ? "ac-attachment-error" : ""}`}
            >
              <span className="ac-attachment-icon">
                {a.status === "uploading" ? <SpinnerIcon size={14} /> : <FileIcon size={14} />}
              </span>
              <span className="ac-attachment-text">
                <span className="ac-attachment-name">{a.name}</span>
                <span className="ac-attachment-status">
                  {a.status === "uploading"
                    ? "Uploading…"
                    : a.status === "error"
                      ? "Upload failed"
                      : "Attached"}
                </span>
              </span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  title={`Remove ${a.name}`}
                  aria-label={`Remove ${a.name}`}
                  onClick={() => onRemoveAttachment(a.id)}
                >
                  <CloseIcon size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <ComposerTextArea
        aria-label="Message your agent"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (sendable) onSubmit();
          }
        }}
      />
      <div className="ac-composer-controls">
        {onFiles && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) onFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="ac-tool-button"
              aria-label="Add files and media"
              title="Add files and media"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <PlusIcon />
            </button>
          </>
        )}
        {onAgentChange && (
          <ComposerSelect
            label="Agent"
            value={agentId}
            options={agents}
            onChange={onAgentChange}
            disabled={disabled || busy}
          />
        )}
        <span className="ac-composer-spacer" />
        {footer}
        {onModelChange && (
          <ComposerSelect
            label="Model"
            value={modelId}
            options={models}
            onChange={onModelChange}
            disabled={disabled || busy}
          />
        )}
        <button
          type="button"
          className="ac-composer-send"
          aria-label={busy ? "Agent is working" : "Send message"}
          title={busy ? "Agent is working" : "Send message"}
          disabled={!sendable}
          onClick={onSubmit}
        >
          {busy || uploading ? <SpinnerIcon /> : <ArrowUpIcon />}
        </button>
      </div>
    </ComposerSurface>
  );
}

export function CanvasToolButton({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ac-tool-button ${active ? "ac-tool-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ResizablePanel({
  side,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 650,
  label,
  children,
  className = "",
}: {
  side: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [width, setWidth] = useState(defaultWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (next: number) =>
    setWidth(
      Math.max(minWidth, Math.min(maxWidth, window.innerWidth * 0.6, next)),
    );
  function move(event: PointerEvent<HTMLDivElement>) {
    if (drag.current)
      resize(
        drag.current.width +
          (event.clientX - drag.current.x) * (side === "left" ? 1 : -1),
      );
  }
  return (
    <aside
      className={`ac-resizable-panel ac-resizable-${side} ${className}`}
      style={{ width }}
      aria-label={label}
    >
      <div className="ac-panel-content">{children}</div>
      <div
        className="ac-panel-resize"
        role="separator"
        aria-label={`Resize ${label}`}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          drag.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => setWidth(defaultWidth)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            resize(
              width +
                (event.key === "ArrowRight" ? 20 : -20) *
                  (side === "left" ? 1 : -1),
            );
          }
        }}
      />
    </aside>
  );
}

/**
 * The same window chrome the Commons agent computer and code-project surfaces
 * use: mac traffic lights, a centred title, an optional tab strip and a slot
 * for actions. Generated work — source, preview, a playtest — is shown inside
 * one of these so it reads as a workspace rather than a panel of the page.
 */
export function CommonsWindow({
  title,
  tabs = [],
  activeTab,
  onTabChange,
  actions,
  status,
  tone = "light",
  children,
  className = "",
}: {
  title: ReactNode;
  tabs?: readonly { id: string; label: string; icon?: ReactNode }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  actions?: ReactNode;
  status?: ReactNode;
  tone?: "light" | "dark";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ac-window ac-window-${tone} ${className}`}>
      <header className="ac-window-bar">
        <span className="ac-window-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="ac-window-title">{title}</span>
        <span className="ac-window-actions">{actions}</span>
      </header>
      {(tabs.length > 0 || status) && (
        <div className="ac-window-toolbar">
          {tabs.length > 0 && (
            <div className="ac-window-tabs" role="tablist">
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  role="tab"
                  aria-selected={tab.id === activeTab}
                  className={tab.id === activeTab ? "ac-window-tab-active" : ""}
                  onClick={() => onTabChange?.(tab.id)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          {status && <span className="ac-window-status">{status}</span>}
        </div>
      )}
      <div className="ac-window-body">{children}</div>
    </section>
  );
}

export type SourceFile = { path: string; content: string; mimeType?: string };
export function CodeFileBrowser({
  files,
  onChange,
  empty = "No source files yet. Describe what you want to build to get started.",
}: {
  files: readonly SourceFile[];
  onChange?: (path: string, content: string) => void;
  empty?: string;
}) {
  const [selected, setSelected] = useState(files[0]?.path ?? "");
  useEffect(() => {
    if (!files.some((file) => file.path === selected))
      setSelected(files[0]?.path ?? "");
  }, [files, selected]);
  const active = files.find((file) => file.path === selected);
  if (!active) return <div className="ac-source-empty">{empty}</div>;
  return (
    <div className="ac-source-browser">
      <nav aria-label="Project files" className="ac-source-tree">
        <span className="ac-source-heading">Files</span>
        {files.map((file) => (
          <button
            type="button"
            key={file.path}
            className={selected === file.path ? "ac-source-selected" : ""}
            title={file.path}
            onClick={() => setSelected(file.path)}
          >
            <span aria-hidden="true">⌘</span>
            {file.path}
          </button>
        ))}
      </nav>
      <div className="ac-source-editor">
        <div className="ac-source-filebar">
          {active.path}
          <span>{onChange ? "Editable source" : "Source"}</span>
        </div>
        <textarea
          spellCheck={false}
          aria-label={`Source: ${active.path}`}
          value={active.content}
          readOnly={!onChange}
          onChange={(event) => onChange?.(active.path, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Tab" && onChange) {
              event.preventDefault();
              const input = event.currentTarget;
              const start = input.selectionStart;
              onChange(
                active.path,
                active.content.slice(0, start) +
                  "  " +
                  active.content.slice(input.selectionEnd),
              );
              requestAnimationFrame(() =>
                input.setSelectionRange(start + 2, start + 2),
              );
            }
          }}
        />
      </div>
    </div>
  );
}
