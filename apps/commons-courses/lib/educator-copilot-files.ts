export type EducatorCopilotFileArtifact = {
  artifactId?: string;
  kind?: string;
  mimeType?: string;
  pageNumber?: number;
  width?: number;
  height?: number;
  url?: string;
};

export type EducatorCopilotUploadedFile = {
  fileId: string;
  name?: string;
  mimeType?: string;
  kind?: string;
  status?: string;
  textPreview?: string;
  extractedTextChars?: number;
  artifacts?: EducatorCopilotFileArtifact[];
};

type AgentFileAccess = {
  accessToken: string;
  principalId: string;
  agentId: string;
  sessionId?: string;
  workspaceId?: string;
};

function agentCommonsBaseUrl() {
  return (
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
    "https://api.agentcommons.io"
  ).replace(/\/$/, "");
}

function accessHeaders(access: Pick<AgentFileAccess, "accessToken" | "principalId">) {
  return {
    Authorization: `Bearer ${access.accessToken}`,
    "x-initiator": access.principalId,
    "x-owner-id": access.principalId,
  };
}

/** Upload source files under the educator's Commons principal and agent. */
export async function uploadEducatorCopilotFiles(
  files: File[],
  access: AgentFileAccess
): Promise<EducatorCopilotUploadedFile[]> {
  if (!files.length) return [];

  try {
    const formData = new FormData();
    for (const file of files) formData.append("files", file, file.name);
    formData.append("agentId", access.agentId);
    if (access.sessionId) formData.append("sessionId", access.sessionId);
    if (access.workspaceId) formData.append("workspaceId", access.workspaceId);

    const response = await fetch(`${agentCommonsBaseUrl()}/v1/files/upload`, {
      method: "POST",
      headers: accessHeaders(access),
      body: formData,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: EducatorCopilotUploadedFile[];
    };
    return (payload.data || []).filter((item) => Boolean(item.fileId));
  } catch (error) {
    console.error("[educator-copilot] file upload failed:", error);
    return [];
  }
}

/** Read extracted text and durable artifact metadata for an uploaded source. */
export async function readEducatorCopilotFile(
  fileId: string,
  access: AgentFileAccess,
  options: { offset?: number; maxChars?: number; includeImageUrls?: boolean } = {}
) {
  const query = new URLSearchParams({
    agentId: access.agentId,
    ...(access.sessionId ? { sessionId: access.sessionId } : {}),
    offset: String(Math.max(0, options.offset || 0)),
    maxChars: String(Math.max(1, options.maxChars || 24000)),
    includeImageUrls: String(Boolean(options.includeImageUrls)),
  });
  const response = await fetch(
    `${agentCommonsBaseUrl()}/v1/files/${encodeURIComponent(fileId)}/content?${query}`,
    { headers: accessHeaders(access) }
  );
  if (!response.ok) return null;
  return (await response.json()) as {
    data?: {
      fileId: string;
      name?: string;
      content?: string;
      nextOffset?: number | null;
      totalChars?: number;
      artifacts?: EducatorCopilotFileArtifact[];
    };
  };
}
