"use client";

import type React from "react";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { Bot } from "lucide-react";

interface ToolCall {
  name: string;
  args: any;
  result?: any;
}

interface AgentCall {
  agentId: string;
  message: string;
  response?: any;
  sessionId?: string;
}

interface AgentOutputProps {
  content: string;
  metadata?: {
    toolCalls?: ToolCall[];
    agentCalls?: AgentCall[];
  };
  className?: string;
  isStreaming?: boolean;
}

export default function AgentOutput({
  content,
  metadata,
  className,
  isStreaming,
}: AgentOutputProps) {

  if (!content && !isStreaming) {
    return (
      <div
        className={cn(
          "post-content prose prose-sm md:prose-base lg:prose-lg dark:prose-invert",
          className
        )}
      ></div>
    );
  }

  return (
    <div className={cn("prose max-w-none my-3", className)}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 h-6 w-6 rounded-full bg-indigo-50 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 text-indigo-500" />
        </div>
        <div className="flex-1 min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="text-2xl font-bold mt-4 mb-2 pb-1 border-b"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold mt-3 mb-2" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-bold mt-2 mb-1" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className=" font-bold mt-2 mb-1" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="text-sm my-2 leading-relaxed" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="text-sm my-2 ml-1 list-disc" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="text-sm my-2 ml-1 list-decimal" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-sm my-1" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="text-sm border-l-4 border-muted pl-4 italic my-4"
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
                {/* {isExecutable && (
                  <div
                    ref={codeExecutorRef}
                    className="mt-2 p-4 bg-muted rounded-md font-mono text-sm"
                    data-code-output="true"
                  >
                    <div className="text-muted-foreground">
                      Output will appear here when you run the code
                    </div>
                  </div>
                )} */}
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
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-indigo-400 rounded-sm animate-pulse ml-0.5 align-middle" />
      )}
        </div>
      </div>
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
      <div className="flex items-center justify-between bg-muted text-muted-foreground px-4 py-2 text-xs font-mono">
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
