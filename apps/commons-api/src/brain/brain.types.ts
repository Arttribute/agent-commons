export type KnowledgePermission = 'read' | 'write' | 'manage';
export type KnowledgeProviderId = 'native' | 'browser_filesystem';

export type KnowledgePrincipal = {
  principalId: string;
  principalType: 'user' | 'agent' | 'service';
  workspaceId?: string | null;
};

export type KnowledgeProviderDefinition = {
  id: KnowledgeProviderId;
  name: string;
  description: string;
  capabilities: {
    editable: boolean;
    import: boolean;
    clientSync: boolean;
  };
};

export type KnowledgeDocumentWrite = {
  documentId?: string;
  spaceId: string;
  path: string;
  title: string;
  content: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  expectedRevision?: number;
  actor: KnowledgePrincipal;
  provenanceTraceId?: string;
  providerDocumentId?: string;
  providerRevision?: string;
};

export type KnowledgeDocumentImport = {
  path: string;
  title?: string;
  content: string;
  modifiedAt?: string;
};
