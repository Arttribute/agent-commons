"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronUp,
  Code,
  MessageSquare,
  Terminal,
} from "lucide-react";
import AgentToAgent from "./agent-to-agent";

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
}

interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeComponent: React.FC<CodeProps> = ({
  node,
  inline,
  className,
  children,
  ...props
}) => {
  const match = /language-(\w+)/.exec(className || "");
  return !inline && match ? (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={match[1]}
      PreTag="div"
      {...props}
    >
      {String(children).replace(/\n$/, "")}
    </SyntaxHighlighter>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

export default function AgentOutput({
  content,
  metadata,
  className,
}: AgentOutputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("message");

  // Check if there are any code blocks in the content
  const hasCodeBlocks = content && content.includes("```");
  const hasToolCalls =
    metadata && metadata?.toolCalls && metadata.toolCalls.length > 0;
  const hasAgentCalls =
    metadata && metadata?.agentCalls && metadata.agentCalls.length > 0;

  // If there are no special features, just render the basic message
  if (!hasCodeBlocks && !hasToolCalls && !hasAgentCalls) {
    return (
      <div className="flex items-start gap-2">
        <div className="bg-blue-100 dark:bg-blue-900 p-1 rounded">
          <Bot className="h-4 w-4 text-blue-500" />
        </div>
        <div className="rounded-lg p-3 max-w-[80%] bg-blue-100 dark:bg-blue-900">
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="bg-blue-100 dark:bg-blue-900 p-1 rounded">
        <Bot className="h-4 w-4 text-blue-500" />
      </div>
      <Card className="w-[80%] overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between p-2 border-b">
            <TabsList>
              <TabsTrigger value="message" className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                Message
              </TabsTrigger>
              {hasCodeBlocks && (
                <TabsTrigger value="code" className="flex items-center gap-1">
                  <Code className="h-4 w-4" />
                  Code
                </TabsTrigger>
              )}
              {hasToolCalls && (
                <TabsTrigger value="tools" className="flex items-center gap-1">
                  <Terminal className="h-4 w-4" />
                  Tools
                  <Badge variant="secondary" className="ml-1">
                    {metadata?.toolCalls?.length || 0}
                  </Badge>
                </TabsTrigger>
              )}
              {hasAgentCalls && (
                <TabsTrigger value="agents" className="flex items-center gap-1">
                  <Bot className="h-4 w-4" />
                  Agents
                  <Badge variant="secondary" className="ml-1">
                    {metadata?.agentCalls?.length || 0}
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          <TabsContent value="message" className="p-4">
            <p className="text-sm whitespace-pre-wrap">{content}</p>
          </TabsContent>

          {hasCodeBlocks && (
            <TabsContent value="code" className="p-0">
              <ScrollArea className="h-[300px]">
                {content.split("```").map((part, index) => {
                  if (index % 2 === 0) {
                    return (
                      <p key={index} className="p-4 text-sm">
                        {part}
                      </p>
                    );
                  }
                  const [language, ...codeParts] = part.split("\n");
                  const code = codeParts.join("\n").trim();
                  return (
                    <div key={index} className="relative">
                      <div className="absolute right-2 top-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  navigator.clipboard.writeText(code);
                                }}
                              >
                                <Code className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy code</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <SyntaxHighlighter
                        language={language || "typescript"}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          padding: "1rem",
                        }}
                      >
                        {code}
                      </SyntaxHighlighter>
                    </div>
                  );
                })}
              </ScrollArea>
            </TabsContent>
          )}

          {hasToolCalls && metadata?.toolCalls && (
            <TabsContent value="tools" className="p-0">
              <ScrollArea className="h-[300px]">
                {metadata.toolCalls.map((tool, index) => (
                  <div key={index} className="p-4 border-b last:border-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="h-4 w-4 text-blue-500" />
                      <h4 className="font-medium">{tool.name}</h4>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Arguments:
                        </p>
                        <pre className="text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {JSON.stringify(tool.args, null, 2)}
                        </pre>
                      </div>
                      {tool.result && (
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Result:
                          </p>
                          <pre className="text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded">
                            {JSON.stringify(tool.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          )}

          {hasAgentCalls && metadata?.agentCalls && (
            <TabsContent value="agents" className="p-0">
              <ScrollArea className="h-[300px]">
                {metadata.agentCalls.map((call, index) => (
                  <div key={index} className="p-4 border-b last:border-0">
                    <AgentToAgent
                      agentId={call.agentId}
                      message={call.message}
                      response={call.response}
                      sessionId={call.sessionId}
                    />
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>
  );
}
