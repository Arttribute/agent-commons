"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, FileText, ImageIcon, Monitor, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsed height for long user messages. Kept just under the point where a
 * single message would force the conversation to scroll, so anything longer
 * gets a "Show more" affordance instead of dominating the viewport.
 */
const COLLAPSED_MAX_HEIGHT_PX = 320;

interface InitiatorMessageProps {
  message: string;
  timestamp: string;
  metadata?: {
    attachments?: Array<{
      fileId: string;
      name: string;
      mimeType: string;
      kind?: string;
      sizeBytes?: number;
    }>;
    computerRequest?: {
      enabled: boolean;
    };
  };
}

export default function InitiatorMessage({ message, metadata }: InitiatorMessageProps) {
  const attachments = metadata?.attachments ?? [];
  const computerRequest = metadata?.computerRequest?.enabled ? metadata.computerRequest : null;

  const textRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > COLLAPSED_MAX_HEIGHT_PX + 1);
  }, [message]);

  const clamped = overflows && !expanded;

  return (
    <div className="flex justify-end my-3">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-100 px-4 py-2.5">
        {(attachments.length > 0 || computerRequest) && (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            {computerRequest && (
              <span className="flex max-w-full items-center gap-1.5 rounded-md bg-white/60 px-2 py-1 text-xs text-gray-800">
                <Monitor className="h-3.5 w-3.5 shrink-0" />
                <span>Agent&apos;s persistent computer</span>
              </span>
            )}
            {attachments.map((attachment) => (
              <AttachmentPill key={attachment.fileId} attachment={attachment} />
            ))}
          </div>
        )}
        <div className="relative">
          <p
            ref={textRef}
            className={cn(
              "whitespace-pre-wrap text-sm leading-relaxed text-gray-900",
              clamped && "overflow-hidden",
            )}
            style={clamped ? { maxHeight: COLLAPSED_MAX_HEIGHT_PX } : undefined}
          >
            {message}
          </p>
          {clamped && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-indigo-100 to-transparent" />
          )}
        </div>
        {overflows && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="group mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-500 transition-colors hover:text-indigo-700"
          >
            {expanded ? "Show less" : "Show more"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
    </div>
  );
}

function AttachmentPill({
  attachment,
}: {
  attachment: {
    name: string;
    mimeType: string;
    kind?: string;
    sizeBytes?: number;
  };
}) {
  const Icon = attachment.mimeType.startsWith("image/")
    ? ImageIcon
    : attachment.kind === "spreadsheet" || attachment.name.match(/\.(xlsx|xls|csv)$/i)
      ? Table2
      : FileText;
  return (
    <span className="flex max-w-full items-center gap-1.5 rounded-md bg-white/60 px-2 py-1 text-xs text-gray-800">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-40 truncate">{attachment.name}</span>
      {attachment.sizeBytes ? (
        <span className="shrink-0 text-gray-500">{formatBytes(attachment.sizeBytes)}</span>
      ) : null}
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
