'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface PageActionsProps {
  rawContent: string;
  githubPath: string;
}

const REPO = 'Arttribute/commons-docs';
const BRANCH = 'main';

export function PageActions({ rawContent, githubPath }: PageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const vscodeUrl = `https://github.dev/${REPO}/blob/${BRANCH}/${githubPath}`;
  const cursorUrl = `cursor://vscode.github-repositories/open?gitUrl=https://github.com/${REPO}&headSha=${BRANCH}&filePath=${githubPath}`;

  return (
    <div className="flex items-center gap-1 mb-6 not-prose">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-secondary px-2.5 py-1 text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      >
        {copied ? (
          <>
            <Check className="size-3" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3" />
            Copy Markdown
          </>
        )}
      </button>

      <a
        href={vscodeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-secondary px-2.5 py-1 text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      >
        <ExternalLink className="size-3" />
        Open in VS Code
      </a>

      <a
        href={cursorUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-secondary px-2.5 py-1 text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      >
        <ExternalLink className="size-3" />
        Open in Cursor
      </a>
    </div>
  );
}
