"use client";

import {
  Archive,
  File,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from "lucide-react";
import { artifactKind, type ArtifactRef } from "@/lib/artifacts";

export function ArtifactIcon({
  artifact,
  className,
}: {
  artifact: Pick<ArtifactRef, "name" | "mimeType" | "kind">;
  className?: string;
}) {
  const kind = artifactKind(artifact);
  const Icon =
    kind === "image"
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
                : kind === "text" || kind === "code"
                  ? FileCode2
                  : kind === "archive"
                    ? Archive
                    : File;
  return <Icon className={className} />;
}
