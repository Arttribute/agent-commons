"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export default function CodeBlock({
  code,
  language = "bash",
  showLineNumbers = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeLines = code.trim().split("\n");

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden bg-zinc-950 text-zinc-100",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900">
        <div className="text-xs font-mono text-zinc-400">{language}</div>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-sm">
          {showLineNumbers ? (
            <code>
              {codeLines.map((line, i) => (
                <div key={i} className="table-row">
                  <span className="table-cell text-right pr-4 select-none text-zinc-600">
                    {i + 1}
                  </span>
                  <span className="table-cell">{line || " "}</span>
                </div>
              ))}
            </code>
          ) : (
            <code>{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
