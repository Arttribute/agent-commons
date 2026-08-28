export type KnowledgePermission = "read" | "write" | "manage";

export type KnowledgeGrant = {
  grantId: string;
  subjectType: "user" | "agent" | "workspace";
  subjectId: string;
  permission: KnowledgePermission;
  autoRetrieve: boolean;
};

export type KnowledgeSpace = {
  spaceId: string;
  name: string;
  description?: string | null;
  provider: "native" | "browser_filesystem" | string;
  providerConfig?: Record<string, unknown>;
  providerDefinition?: {
    id: string;
    name: string;
    description: string;
    capabilities: {
      editable: boolean;
      import: boolean;
      clientSync: boolean;
    };
  };
  permission: KnowledgePermission;
  color: string;
  status: "active" | "disconnected";
  isDefault: boolean;
  autoGrantNewAgents: boolean;
  counts: { documents: number; links: number };
  grants?: KnowledgeGrant[];
  updatedAt: string;
};

export type KnowledgeDocument = {
  documentId: string;
  spaceId: string;
  path: string;
  title: string;
  content?: string;
  revision: number;
  frontmatter?: Record<string, unknown>;
  tags: string[];
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  outgoing?: KnowledgeLink[];
  backlinks?: KnowledgeLink[];
};

export type KnowledgeLink = {
  linkId: string;
  targetPath?: string;
  relation: string;
  documentId?: string | null;
  title?: string | null;
  path?: string | null;
};

export type KnowledgeGraph = {
  nodes: Array<{
    id: string;
    title: string;
    path: string;
    folder: string;
    tags: string[];
    degree: number;
    updatedAt: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string | null;
    targetPath: string;
    relation: string;
    resolved: boolean;
  }>;
};

export type KnowledgeSearchResult = {
  documentId: string;
  spaceId: string;
  spaceName?: string;
  title: string;
  path: string;
  heading?: string | null;
  excerpt: string;
  score: number;
  matchedBy: string[];
};
