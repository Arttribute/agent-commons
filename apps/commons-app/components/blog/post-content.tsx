"use client";

import type React from "react";

import { useEffect, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface PostContentProps {
  content: string;
  className?: string;
}

export function PostContent({ content, className }: PostContentProps) {
  const codeExecutorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize code executor if it exists
    if (codeExecutorRef.current) {
      // This would be where we'd initialize a code execution environment
      // For now, this is just a placeholder
    }
  }, []);

  if (!content) {
    return (
      <div
        className={cn(
          "post-content prose prose-sm md:prose-base lg:prose-lg dark:prose-invert",
          className
        )}
      >
        <p>No content available.</p>
      </div>
    );
  }

  return (
    <div className={cn("prose max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="text-3xl font-bold mt-8 mb-4 pb-2 border-b"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-2xl font-bold mt-6 mb-3" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xl font-bold mt-5 mb-2" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-lg font-bold mt-4 mb-2" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="my-4 leading-relaxed" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="my-4 ml-6 list-disc" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="my-4 ml-6 list-decimal" {...props} />
          ),
          li: ({ node, ...props }) => <li className="my-1" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-muted pl-4 italic my-4"
              {...props}
            />
          ),
          code({
            inline,
            className,
            children,
            ...props
          }: {
            inline?: boolean;
            className?: string;
            children?: React.ReactNode;
          }) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const isExecutable =
              language === "js" ||
              language === "javascript" ||
              language === "typescript";

            return !inline && match ? (
              <CodeBlock
                language={language}
                code={String(children).replace(/\n$/, "")}
              >
                {isExecutable && (
                  <div
                    ref={codeExecutorRef}
                    className="mt-2 p-4 bg-muted rounded-md font-mono text-sm"
                    data-code-output="true"
                  >
                    <div className="text-muted-foreground">
                      Output will appear here when you run the code
                    </div>
                  </div>
                )}
              </CodeBlock>
            ) : (
              <code className="rounded text-sm font-mono " {...props}>
                {children}
              </code>
            );
          },
          img({ node, ...props }) {
            return (
              <img
                className="rounded-md my-6 max-w-full h-auto"
                {...props}
                loading="lazy"
              />
            );
          },
          a({ node, ...props }) {
            return (
              <a
                className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              />
            );
          },
          table({ node, ...props }) {
            return (
              <div className="my-6 overflow-x-auto">
                <table className="border-collapse w-full" {...props} />
              </div>
            );
          },
          th({ node, ...props }) {
            return (
              <th
                className="border border-border px-4 py-2 bg-muted font-bold text-left"
                {...props}
              />
            );
          },
          td({ node, ...props }) {
            return <td className="border border-border px-4 py-2" {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface CodeBlockProps {
  language: string;
  code: string;
  children?: React.ReactNode;
}

function CodeBlock({ language, code, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className="my-4 rounded-md overflow-hidden">
      <div className="flex items-center justify-between bg-muted text-gray-700 px-4 py-2 text-xs font-mono">
        <span>{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={copyToClipboard}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        style={atomDark}
        language={language}
        PreTag="div"
        className="rounded-b-md"
        showLineNumbers
      >
        {code}
      </SyntaxHighlighter>
      {children}
    </div>
  );
}
