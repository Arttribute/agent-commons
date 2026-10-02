"use client";

import {
  AppWindow,
  Archive,
  File,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  Workflow,
} from "lucide-react";
import { artifactKind, isMermaid, type ArtifactRef } from "@/lib/artifacts";

export function ArtifactIcon({
  artifact,
  className,
  strokeWidth,
}: {
  artifact: Pick<ArtifactRef, "name" | "mimeType" | "kind">;
  className?: string;
  strokeWidth?: number;
}) {
  const kind = artifactKind(artifact);
  const Icon =
    kind === "app"
      ? AppWindow
      : kind === "image"
      ? FileImage
      : kind === "video"
        ? FileVideo
        : kind === "audio"
          ? FileAudio
          : kind === "presentation"
            ? Presentation
            : kind === "spreadsheet"
              ? FileSpreadsheet
              : kind === "document" || kind === "pdf"
                ? FileText
                : isMermaid(artifact)
                  ? Workflow
                : kind === "text" || kind === "code"
                  ? FileCode2
                  : kind === "archive"
                    ? Archive
                    : File;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
