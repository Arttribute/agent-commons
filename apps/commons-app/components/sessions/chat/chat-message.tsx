import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import CodeBlock from "./code-block";
import Image from "next/image";

type MessageRole = "human" | "ai" | "tool";

interface Message {
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
  timestamp?: string;
  steps?: string[];
}

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  // Skip automated task instructions that follow the pattern
  if (
    message.role === "human" &&
    message.content.includes("##TASK_INSTRUCTION:")
  ) {
    return null;
  }

  const isToolMessage = message.role === "tool";
  const isToolData = isToolMessage && message.content.startsWith("{");
  const hasCodeBlock = message.content.includes("```");
  const hasImage =
    message.content.includes("![") && message.content.includes("](");

  let toolData: {
    title?: string;
    description?: string;
    status?: string;
    summary?: string;
    resultContent?: string;
  } | null = null;
  if (isToolData) {
    try {
      toolData = JSON.parse(message.content).toolData;
    } catch (e) {
      // Handle parsing error
    }
  }

  // Extract code blocks from content
  const extractCodeBlocks = (content: string) => {
    const parts: {
      type: "text" | "code";
      content: string;
      language?: string;
    }[] = [];
    let currentIndex = 0;
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > currentIndex) {
        parts.push({
          type: "text",
          content: content.substring(currentIndex, match.index),
        });
      }

      // Add code block
      parts.push({
        type: "code",
        language: match[1] || "bash",
        content: match[2],
      });

      currentIndex = match.index + match[0].length;
    }

    // Add remaining text after last code block
    if (currentIndex < content.length) {
      parts.push({
        type: "text",
        content: content.substring(currentIndex),
      });
    }

    return parts;
  };

  // Extract image from content
  const extractImage = (content: string) => {
    const imageRegex = /!\[(.*?)\]$$(.*?)$$/;
    const match = content.match(imageRegex);

    if (match) {
      return {
        alt: match[1],
        src: match[2],
      };
    }

    return null;
  };

  const contentParts = hasCodeBlock
    ? extractCodeBlocks(message.content)
    : [{ type: "text", content: message.content }];
  const imageData = hasImage ? extractImage(message.content) : null;

  return (
    <div
      className={cn(
        "flex gap-3 items-start",
        message.role === "human" && "justify-end"
      )}
    >
      {message.role !== "human" && (
        <Avatar className="h-8 w-8">
          <AvatarFallback
            className={message.role === "ai" ? "bg-purple-100" : "bg-amber-100"}
          >
            {message.role === "ai" ? (
              <Bot className="h-4 w-4 text-purple-500" />
            ) : (
              <Wrench className="h-4 w-4 text-amber-500" />
            )}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[80%]",
          message.role === "human" ? "order-1" : "order-2"
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant={
              message.role === "human"
                ? "default"
                : message.role === "ai"
                  ? "secondary"
                  : "outline"
            }
          >
            {message.role === "human"
              ? "Human"
              : message.role === "ai"
                ? "AI"
                : "Tool"}
          </Badge>
          {message.timestamp && (
            <span className="text-xs text-gray-500">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        <Card
          className={cn(
            "overflow-hidden",
            message.role === "human"
              ? "bg-primary text-primary-foreground"
              : message.role === "ai"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted"
          )}
        >
          <CardContent className="p-3">
            {isToolData && toolData ? (
              <div className="space-y-2">
                {toolData.title && (
                  <h4 className="font-medium">{toolData.title}</h4>
                )}
                {toolData.description && (
                  <p className="text-sm">{toolData.description}</p>
                )}
                {toolData.status && (
                  <Badge
                    variant={
                      toolData.status === "completed" ? "default" : "secondary"
                    }
                    className="mt-2"
                  >
                    {toolData.status}
                  </Badge>
                )}
                {toolData.summary && (
                  <div className="mt-2 text-sm">
                    <strong>Summary:</strong> {toolData.summary}
                  </div>
                )}
                {toolData.resultContent &&
                  toolData.resultContent.includes("```") && (
                    <div className="mt-3">
                      {extractCodeBlocks(toolData.resultContent).map(
                        (part, idx) =>
                          part.type === "code" ? (
                            <CodeBlock
                              key={idx}
                              code={part.content}
                              language={part.language}
                            />
                          ) : (
                            <div
                              key={idx}
                              className="my-2 text-sm whitespace-pre-wrap"
                            >
                              {part.content}
                            </div>
                          )
                      )}
                    </div>
                  )}
              </div>
            ) : message.steps ? (
              <div className="space-y-3">
                <div className="whitespace-pre-wrap">
                  {contentParts[0].content}
                </div>
                <div className="space-y-2 mt-3">
                  {message.steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium">
                        {idx + 1}
                      </div>
                      <div className="text-sm">{step}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {contentParts.map((part, idx) =>
                  part.type === "code" ? (
                    <CodeBlock
                      key={idx}
                      code={part.content}
                      language={part.language}
                      className="my-3"
                    />
                  ) : (
                    <div key={idx} className="whitespace-pre-wrap">
                      {part.content}
                    </div>
                  )
                )}

                {imageData && (
                  <div className="mt-3 border rounded-md overflow-hidden">
                    <Image
                      src={imageData.src || "/placeholder.svg"}
                      alt={imageData.alt}
                      width={400}
                      height={300}
                      className="w-full h-auto"
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {message.role === "human" && (
        <Avatar className="h-8 w-8 order-3">
          <AvatarFallback className="bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
