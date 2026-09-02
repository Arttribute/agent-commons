'use client';

import { useState } from 'react';
import { Check, Copy, Github, SquarePen } from 'lucide-react';

interface PageActionsProps {
  rawContent: string;
  githubPath: string;
}

const REPO = 'Arttribute/agent-commons';
const BRANCH = 'main';
const DOCS_ROOT = 'apps/commons-docs';

const ACTION =
  'inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-card px-2 py-1 font-space text-[11px] font-medium text-fd-muted-foreground transition-colors hover:border-fd-foreground/20 hover:text-fd-foreground';

/**
 * Every page can be handed to a model or opened in an editor. Both are one
 * click, and neither should draw the eye away from the first paragraph.
 */
export function PageActions({ rawContent, githubPath }: PageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filePath = `${DOCS_ROOT}/${githubPath}`;
  const sourceUrl = `https://github.com/${REPO}/blob/${BRANCH}/${filePath}`;
  const editUrl = `https://github.dev/${REPO}/blob/${BRANCH}/${filePath}`;

  return (
    <div className="not-prose mb-8 flex items-center gap-1.5">
      <button onClick={handleCopy} className={ACTION} type="button">
        {copied ? (
          <>
            <Check className="size-3" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3" />
            Copy as Markdown
          </>
        )}
      </button>

      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={ACTION}>
        <Github className="size-3" />
        View source
      </a>

      <a href={editUrl} target="_blank" rel="noopener noreferrer" className={ACTION}>
        <SquarePen className="size-3" />
        Edit
      </a>
    </div>
  );
}
