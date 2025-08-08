"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import CodeBlock from "./code-block";

interface SpaceMessageProps {
  senderId: string;
  senderType: "agent" | "human";
  content: string;
  timestamp: string;
  metadata?: {
    agentCalls?: Array<{
      agentId: string;
      message: string;
      response?: any;
      sessionId?: string;
    }>;
  };
}

export default function SpaceMessage({
  senderId,
  senderType,
  content,
  timestamp,
  metadata,
}: SpaceMessageProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getAvatarColor = (senderId: string, senderType: string) => {
    if (senderType === "human") {
      return "bg-blue-500";
    }

    // Generate consistent color based on agent ID
    const colors = [
      "bg-purple-500",
      "bg-green-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
      "bg-red-500",
      "bg-yellow-500",
    ];

    const hash = senderId.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    return colors[Math.abs(hash) % colors.length];
  };

  const getDisplayName = (senderId: string, senderType: string) => {
    if (senderType === "human") {
      return `Human-${senderId.slice(0, 8)}`;
    }
    return `Agent-${senderId.slice(0, 8)}`;
  };

  const getInitials = (senderId: string, senderType: string) => {
    if (senderType === "human") {
      return "H";
    }
    return senderId.charAt(0).toUpperCase();
  };

  return (
    <div className="flex gap-3 mb-4 hover:bg-gray-50 p-2 rounded-lg transition-colors">
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarFallback
          className={`${getAvatarColor(senderId, senderType)} text-white font-medium`}
        >
          {getInitials(senderId, senderType)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-gray-900 text-sm">
            {getDisplayName(senderId, senderType)}
          </span>
          <span className="text-xs text-gray-500">{formatTime(timestamp)}</span>
          <Badge
            variant="outline"
            className={`text-xs ${
              senderType === "agent"
                ? "bg-purple-50 text-purple-700 border-purple-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            {senderType}
          </Badge>
        </div>

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
              return (
                <td className="border border-border px-4 py-2" {...props} />
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>

        {metadata?.agentCalls && metadata.agentCalls.length > 0 && (
          <div className="mt-2 text-xs text-gray-500 bg-gray-100 rounded p-2">
            <span className="font-medium">Agent interactions:</span>{" "}
            {metadata.agentCalls.length}
          </div>
        )}
      </div>
    </div>
  );
}
