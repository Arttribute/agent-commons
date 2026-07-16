export type CodeProjectFile = {
  fileId: string;
  path: string;
  content: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  version: number;
  updatedAt: string;
};

export type CodeProjectDeployment = {
  deploymentId: string;
  status: "building" | "ready" | "failed" | string;
  publicUrl?: string | null;
  buildErrors?: Array<{ message: string; file?: string; line?: number }> | null;
  verification?: {
    passed?: boolean;
    screenshotUrl?: string;
    consoleErrors?: string[];
    pageErrors?: string[];
    requestFailures?: string[];
  } | null;
  createdAt: string;
  publishedAt?: string | null;
};

export type CodeProject = {
  projectId: string;
  agentId: string;
  name: string;
  slug: string;
  description?: string | null;
  framework: string;
  entryFile: string;
  status: "draft" | "building" | "ready" | "failed" | string;
  visibility: "private" | "public" | string;
  publicUrl?: string | null;
  repositoryUrl?: string | null;
  files: CodeProjectFile[];
  deployments: CodeProjectDeployment[];
  updatedAt: string;
};
