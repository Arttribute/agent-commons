"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, ImageIcon, Loader2, Plus, Table2, X } from "lucide-react";
import { useAgentContext } from "@/context/AgentContext";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { cn } from "@/lib/utils";

type UploadedAttachment = {
  localId: string;
  fileId?: string;
  name: string;
  mimeType: string;
  kind?: string;
  sizeBytes: number;
  status: "uploading" | "uploaded" | "error";
  textPreview?: string | null;
  error?: string;
  previewUrl?: string;
};

export default function ChatInputBox({
  agentId,
  sessionId,
  userId,
  disabled,
  onSessionCreated,
}: {
  agentId: string;
  sessionId: string;
  userId: string;
  disabled?: boolean;
  onSessionCreated?: (sessionId: string, title?: string) => void;
}) {
  const accumulatedRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { addMessage, updateStreamingMessage, finalizeStreamingMessage, inputText, setInputText } =
    useAgentContext();

  const { stream, streaming } = useAgentStream(userId, {
    onToken: (token) => {
      accumulatedRef.current += token;
      updateStreamingMessage(accumulatedRef.current);
    },
    onFinal: (payload) => {
      const content = payload?.content ?? payload?.data?.content ?? "";
      finalizeStreamingMessage(content, payload?.metadata);
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        onSessionCreated?.(payload.sessionId, payload.title ?? "");
      }
    },
    onToolStart: (toolName) => {
      addMessage({
        role: "tool",
        content: JSON.stringify({ type: "toolStart", toolName }, null, 2),
        metadata: {},
        timestamp: new Date().toISOString(),
      });
    },
    onError: (message) => {
      addMessage({
        role: "system",
        content: `Error: ${message}`,
        timestamp: new Date().toISOString(),
      });
    },
  });

  const isLoading = streaming || disabled;
  const isUploading = attachments.some((attachment) => attachment.status === "uploading");
  const uploadedAttachments = attachments.filter(
    (attachment) => attachment.status === "uploaded" && attachment.fileId
  );

  const handleSend = async () => {
    if ((!inputText.trim() && uploadedAttachments.length === 0) || isLoading || isUploading) return;

    const userMessage = inputText.trim() || "Please review the attached file(s).";
    const messageAttachments = uploadedAttachments.map((attachment) => ({
      fileId: attachment.fileId!,
      name: attachment.name,
      mimeType: attachment.mimeType,
      kind: attachment.kind,
      sizeBytes: attachment.sizeBytes,
      textPreview: attachment.textPreview,
    }));
    setInputText("");
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    previewUrlsRef.current.clear();
    setAttachments([]);
    accumulatedRef.current = "";

    addMessage({
      role: "human",
      content: userMessage,
      metadata: { attachments: messageAttachments },
      timestamp: new Date().toISOString(),
    });

    // Placeholder for the streaming AI message
    addMessage({
      role: "ai",
      content: "",
      metadata: {},
      timestamp: new Date().toISOString(),
      isStreaming: true,
    });

    await stream({
      agentId,
      sessionId,
      messages: [{ role: "user", content: userMessage }],
      attachments: messageAttachments.map((attachment) => ({
        fileId: attachment.fileId,
      })),
    });
  };

  const openFilePicker = () => {
    if (isLoading) return;
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (isLoading) return;
    const selected = Array.from(files).filter((file) => file.size > 0);
    if (!selected.length) return;

    const localAttachments: UploadedAttachment[] = selected.map((file) => {
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      return {
        localId: createLocalId(),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        status: "uploading",
        previewUrl,
      };
    });

    setAttachments((current) => [...current, ...localAttachments]);

    const formData = new FormData();
    formData.set("agentId", agentId);
    if (sessionId) formData.set("sessionId", sessionId);
    selected.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "File upload failed");
      }
      const uploaded = (payload?.data ?? []) as Array<{
        fileId: string;
        name: string;
        mimeType: string;
        kind: string;
        sizeBytes: number;
        status: string;
        textPreview?: string | null;
      }>;
      setAttachments((current) =>
        current.map((attachment) => {
          const index = localAttachments.findIndex(
            (local) => local.localId === attachment.localId
          );
          if (index < 0) return attachment;
          const uploadedAttachment = uploaded[index];
          if (!uploadedAttachment) {
            return { ...attachment, status: "error", error: "Upload response was incomplete" };
          }
          return {
            ...attachment,
            fileId: uploadedAttachment.fileId,
            name: uploadedAttachment.name,
            mimeType: uploadedAttachment.mimeType,
            kind: uploadedAttachment.kind,
            sizeBytes: uploadedAttachment.sizeBytes,
            status: "uploaded",
            textPreview: uploadedAttachment.textPreview,
          };
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "File upload failed";
      setAttachments((current) =>
        current.map((attachment) =>
          localAttachments.some((local) => local.localId === attachment.localId)
            ? { ...attachment, status: "error", error: message }
            : attachment
        )
      );
    }
  };

  const removeAttachment = (localId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.localId === localId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.localId !== localId);
    });
  };

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrlsRef.current.clear();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative rounded-2xl bg-background border border-border shadow-sm transition-colors",
        isDragging && "border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20"
      )}
      onDragOver={(event) => {
        if (isLoading) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        if (isLoading) return;
        event.preventDefault();
        setIsDragging(false);
        uploadFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.xls"
        onChange={(event) => {
          if (event.target.files) uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
            />
          ))}
        </div>
      )}
      <textarea
        placeholder="Ask me something..."
        className="text-sm w-full h-16 p-3 rounded-2xl resize-none focus:outline-none bg-transparent placeholder:text-muted-foreground/60"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={isLoading}
      />
      <div className="flex justify-between items-center px-2 pb-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={!!isLoading}
            title="Add photos & files"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-9 left-0 z-10 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={openFilePicker}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                <span>Add photos & files</span>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={(!inputText.trim() && uploadedAttachments.length === 0) || !!isLoading || isUploading}
          className="bg-foreground rounded-lg p-1.5 text-background transition-opacity disabled:opacity-40 hover:opacity-80"
        >
          {isLoading || isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: UploadedAttachment;
  onRemove: () => void;
}) {
  const Icon = attachment.mimeType.startsWith("image/")
    ? ImageIcon
    : attachment.kind === "spreadsheet" || attachment.name.match(/\.(xlsx|xls|csv)$/i)
      ? Table2
      : FileText;

  return (
    <div className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs">
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-7 w-7 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block max-w-44 truncate text-foreground">{attachment.name}</span>
        <span className="block text-muted-foreground">
          {attachment.status === "uploading"
            ? "Uploading..."
            : attachment.status === "error"
              ? attachment.error || "Upload failed"
              : formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      {attachment.status === "uploading" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
