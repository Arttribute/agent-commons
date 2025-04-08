"use client";

import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  LinkIcon,
  Image,
  FileVideo,
  FileAudio,
  HelpCircle,
  Undo2,
  Redo2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
}

interface HistoryState {
  past: string[];
  present: string;
  future: string[];
}

export function MarkdownEditor({
  value,
  onChange,
  minHeight = "200px",
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<string>("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // History state for undo/redo
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: value,
    future: [],
  });

  // Update history when value changes from outside
  useEffect(() => {
    if (value !== history.present) {
      setHistory((prev) => ({
        past: [...prev.past, prev.present],
        present: value,
        future: [],
      }));
    }
  }, [value]);

  // Handle undo
  const handleUndo = () => {
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);

    setHistory({
      past: newPast,
      present: previous,
      future: [history.present, ...history.future],
    });

    onChange(previous);
  };

  // Handle redo
  const handleRedo = () => {
    if (history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);

    setHistory({
      past: [...history.past, history.present],
      present: next,
      future: newFuture,
    });

    onChange(next);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for undo: Cmd+Z or Ctrl+Z
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // Check for redo: Cmd+Shift+Z or Ctrl+Y
    if (
      ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) ||
      (e.ctrlKey && e.key === "y")
    ) {
      e.preventDefault();
      handleRedo();
      return;
    }
  };

  // Handle value change with history tracking
  const handleValueChange = (newValue: string) => {
    if (newValue !== history.present) {
      setHistory({
        past: [...history.past, history.present],
        present: newValue,
        future: [],
      });
      onChange(newValue);
    }
  };

  const insertMarkdown = (prefix: string, suffix = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const beforeText = value.substring(0, start);
    const afterText = value.substring(end);

    const newText = beforeText + prefix + selectedText + suffix + afterText;
    handleValueChange(newText);

    // Set cursor position after the operation
    setTimeout(() => {
      textarea.focus();
      const newCursorPos =
        selectedText.length > 0
          ? start + prefix.length + selectedText.length + suffix.length
          : start + prefix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleBold = () => insertMarkdown("**", "**");
  const handleItalic = () => insertMarkdown("*", "*");
  const handleH1 = () => insertMarkdown("# ");
  const handleH2 = () => insertMarkdown("## ");
  const handleH3 = () => insertMarkdown("### ");
  const handleList = () => insertMarkdown("- ");
  const handleOrderedList = () => insertMarkdown("1. ");
  const handleQuote = () => insertMarkdown("> ");
  const handleCode = () => insertMarkdown("```\n", "\n```");
  const handleInlineCode = () => insertMarkdown("`", "`");

  const handleLink = () => {
    const text = prompt("Enter link text:", "");
    const url = prompt("Enter URL:", "https://");
    if (text && url) {
      insertMarkdown(`[${text}](${url})`);
    }
  };

  const handleImage = () => {
    const alt = prompt("Enter image alt text:", "");
    const url = prompt("Enter image URL:", "https://");
    if (alt && url) {
      insertMarkdown(`![${alt}](${url})`);
    }
  };

  const handleVideo = () => {
    const url = prompt("Enter video URL:", "https://");
    if (url) {
      insertMarkdown(`<video src="${url}" controls></video>`);
    }
  };

  const handleAudio = () => {
    const url = prompt("Enter audio URL:", "https://");
    if (url) {
      insertMarkdown(`<audio src="${url}" controls></audio>`);
    }
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-muted p-2 flex items-center space-x-1 border-b">
        <TooltipProvider>
          <div className="flex items-center space-x-1 mr-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={history.past.length === 0}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  disabled={history.future.length === 0}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Y or Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleH1}
              >
                <Heading1 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 1</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleH2}
              >
                <Heading2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 2</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleH3}
              >
                <Heading3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 3</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBold}
              >
                <Bold className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleItalic}
              >
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleList}
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bullet List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOrderedList}
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Numbered List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleQuote}
              >
                <Quote className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Quote</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleInlineCode}
              >
                <Code className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inline Code</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCode}
              >
                <div className="flex items-center">
                  <Code className="h-4 w-4" />
                  <span className="ml-1 text-xs">Block</span>
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Code Block</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLink}
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Link</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleImage}
              >
                <Image className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Image</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleVideo}
              >
                <FileVideo className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Video</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAudio}
              >
                <FileAudio className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Audio</TooltipContent>
          </Tooltip>

          <div className="flex-1"></div>

          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <HelpCircle className="h-4 w-4" />
                <span className="sr-only">Markdown Help</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Markdown Cheat Sheet</DialogTitle>
                <DialogDescription>
                  Basic syntax for formatting your content
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="font-mono"># Heading 1</div>
                  <div>Creates a top-level heading</div>

                  <div className="font-mono">## Heading 2</div>
                  <div>Creates a second-level heading</div>

                  <div className="font-mono">**bold text**</div>
                  <div>
                    Makes text <strong>bold</strong>
                  </div>

                  <div className="font-mono">*italic text*</div>
                  <div>
                    Makes text <em>italic</em>
                  </div>

                  <div className="font-mono">[link text](url)</div>
                  <div>Creates a hyperlink</div>

                  <div className="font-mono">![alt text](image-url)</div>
                  <div>Embeds an image</div>

                  <div className="font-mono">- list item</div>
                  <div>Creates a bullet list item</div>

                  <div className="font-mono">1. ordered item</div>
                  <div>Creates a numbered list item</div>

                  <div className="font-mono">&gt; quote</div>
                  <div>Creates a blockquote</div>

                  <div className="font-mono">```code```</div>
                  <div>Creates a code block</div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TooltipProvider>
      </div>

      <Tabs defaultValue="write" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted border-b rounded-none">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="p-0 m-0">
          <textarea
            ref={textareaRef}
            value={history.present}
            onChange={(e) => handleValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full p-4 focus-visible:outline-none"
            style={{ minHeight }}
          />
        </TabsContent>
        <TabsContent value="preview" className="p-0 m-0">
          <div
            className="p-4 prose dark:prose-invert max-w-none"
            style={{ minHeight }}
          >
            {history.present ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {history.present}
              </ReactMarkdown>
            ) : (
              <p className="text-muted-foreground text-center py-10">
                Nothing to preview yet. Start writing to see a preview.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
