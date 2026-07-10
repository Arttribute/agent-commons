import { FileText, ImageIcon, Monitor, Table2 } from "lucide-react";

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
      lifecycle?: "persistent" | "ephemeral";
    };
  };
}

export default function InitiatorMessage({ message, metadata }: InitiatorMessageProps) {
  const attachments = metadata?.attachments ?? [];
  const computerRequest = metadata?.computerRequest?.enabled ? metadata.computerRequest : null;
  return (
    <div className="flex justify-end my-3">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-100 px-4 py-2.5">
        {(attachments.length > 0 || computerRequest) && (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            {computerRequest && (
              <span className="flex max-w-full items-center gap-1.5 rounded-md bg-white/60 px-2 py-1 text-xs text-gray-800">
                <Monitor className="h-3.5 w-3.5 shrink-0" />
                <span>Agent computer</span>
                <span className="shrink-0 text-gray-500">
                  {computerRequest.lifecycle === "persistent" ? "Persistent" : "Ephemeral"}
                </span>
              </span>
            )}
            {attachments.map((attachment) => (
              <AttachmentPill key={attachment.fileId} attachment={attachment} />
            ))}
          </div>
        )}
        <p className="text-sm leading-relaxed text-gray-900">{message}</p>
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
