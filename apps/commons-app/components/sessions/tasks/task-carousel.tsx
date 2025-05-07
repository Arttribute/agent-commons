"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Copy,
  Check,
} from "lucide-react";
import Image from "next/image";

interface TaskContext {
  inputs?: Record<string, any>;
  objective?: string;
  expectedOutputType?: string;
}

interface Task {
  taskId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  progress: number;
  context?: TaskContext;
  summary?: string | null;
  resultContent?: string | null;
  createdAt: string;
  updatedAt: string;
  actualStart?: string | null;
  actualEnd?: string | null;
}

interface TaskCarouselProps {
  tasks: Task[];
}

export default function TaskCarousel({ tasks }: TaskCarouselProps) {
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const goToNextTask = () => {
    if (currentTaskIndex < tasks.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    }
  };

  const goToPreviousTask = () => {
    if (currentTaskIndex > 0) {
      setCurrentTaskIndex(currentTaskIndex - 1);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-muted-foreground">
        No tasks available yet. Start a conversation to create tasks.
      </div>
    );
  }

  const currentTask = tasks[currentTaskIndex];

  // Extract code blocks from content
  const extractCodeBlocks = (content: string) => {
    if (!content) return [];

    const parts: { type: string; content: string; language?: string }[] = [];
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

  // Check for image in content
  const hasImage = (content: string) => {
    return content && content.includes("![") && content.includes("](");
  };

  // Extract image from content
  const extractImage = (content: string) => {
    if (!content) return null;

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

  const hasCodeResult =
    currentTask.resultContent && currentTask.resultContent.includes("```");
  const resultParts = hasCodeResult
    ? extractCodeBlocks(currentTask.resultContent || "")
    : [];
  const imageData = currentTask.resultContent
    ? extractImage(currentTask.resultContent)
    : null;

  return (
    <div className="h-full flex flex-col ">
      <div className="border  border-gray-400 rounded-lg m-2">
        <div className="flex items-center justify-between rounded-t-lg items-start border-b border-gray-400 p-2 bg-zinc-100">
          <h2 className="text-xs font-semibold">{currentTask.title}</h2>
          <Badge
            variant={
              currentTask.status === "completed" ? "default" : "secondary"
            }
            className="text-xs "
          >
            {currentTask.status}
          </Badge>
        </div>
        <ScrollArea className="h-[420px] p-4 bg-gray-50">
          <p className="text-sm text-muted-foreground mb-4">
            {currentTask.description}
          </p>

          {currentTask.context && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Objective</h4>
              <div className="bg-muted/50 p-3 rounded-md text-sm">
                <p>{currentTask.context.objective}</p>
              </div>
            </div>
          )}

          {currentTask.status === "completed" && currentTask.summary && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Summary</h4>
              <div className="bg-muted/50 p-3 rounded-md text-sm">
                <p>{currentTask.summary}</p>
              </div>
            </div>
          )}

          {currentTask.status === "completed" && hasCodeResult && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <h4 className="font-medium text-sm">Result</h4>
              </div>

              {resultParts.map((part, idx) =>
                part.type === "code" ? (
                  <div key={idx} className="mb-3 relative">
                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 text-zinc-100 rounded-t-md">
                      <div className="text-xs font-mono">{part.language}</div>
                      <button
                        onClick={() => copyToClipboard(part.content, idx)}
                        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedIndex === idx ? "Copied!" : "Copy"}</span>
                      </button>
                    </div>
                    <div className="bg-zinc-950 text-zinc-100 p-3 rounded-b-md overflow-x-auto">
                      <pre className="font-mono text-sm whitespace-pre-wrap">
                        {part.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="text-sm mb-3">
                    {part.content}
                  </div>
                )
              )}
            </div>
          )}

          {currentTask.status === "completed" && imageData && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="h-4 w-4 text-blue-500" />
                <h4 className="font-medium text-sm">Generated Image</h4>
              </div>
              <div className="border rounded-md overflow-hidden">
                <Image
                  src={imageData.src || "/placeholder.svg"}
                  alt={imageData.alt || "Generated image"}
                  width={400}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {imageData.alt}
              </p>
            </div>
          )}
        </ScrollArea>
        <div className="flex items-center justify-between p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPreviousTask}
            disabled={currentTaskIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">
            Task {currentTaskIndex + 1} of {tasks.length}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNextTask}
            disabled={currentTaskIndex === tasks.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
