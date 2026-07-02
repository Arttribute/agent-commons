import { FileText, ImageIcon, Table2 } from "lucide-react";

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
  };
}

export default function InitiatorMessage({ message, metadata }: InitiatorMessageProps) {
  const attachments = metadata?.attachments ?? [];
  return (
    <div className="flex justify-end my-3">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            {attachments.map((attachment) => (
              <AttachmentPill key={attachment.fileId} attachment={attachment} />
            ))}
          </div>
        )}
        <p className="text-sm text-white leading-relaxed">{message}</p>
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
    <span className="flex max-w-full items-center gap-1.5 rounded-md bg-white/15 px-2 py-1 text-xs text-white">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-40 truncate">{attachment.name}</span>
      {attachment.sizeBytes ? (
        <span className="shrink-0 text-white/70">{formatBytes(attachment.sizeBytes)}</span>
      ) : null}
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
