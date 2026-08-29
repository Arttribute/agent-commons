"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import FileHandler from "@tiptap/extension-file-handler";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Braces,
  Code2,
  FileImage,
  FileUp,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  LibraryPickerDialog,
  type LibraryPickerItem,
} from "@/components/sessions/chat/library-picker-dialog";
import type { KnowledgeDocument } from "./types";

type UploadedAsset = {
  itemId: string;
  name: string;
  mimeType: string;
  kind: string;
};

export function RichMarkdownEditor({
  value,
  onChange,
  editable,
  documentPath,
  documents,
  onOpenDocument,
}: {
  value: string;
  onChange: (markdown: string) => void;
  editable: boolean;
  documentPath: string;
  documents: KnowledgeDocument[];
  onOpenDocument?: (documentId: string) => void;
}) {
  const valueRef = useRef(value);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const uploadAndInsertRef = useRef<
    (files: File[], target?: ReturnType<typeof useEditor>) => Promise<void>
  >(async () => undefined);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    content: splitMarkdown(value).body,
    contentType: "markdown",
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          enableClickSelection: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            class:
              "font-medium text-teal-700 underline decoration-teal-300 underline-offset-2",
          },
        },
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false },
      }),
      Image.configure({
        allowBase64: false,
        resize: {
          enabled: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          minWidth: 120,
          minHeight: 80,
          alwaysPreserveAspectRatio: true,
        },
        HTMLAttributes: {
          class:
            "max-h-[560px] rounded-xl border border-stone-200 object-contain shadow-sm",
        },
      }),
      TableKit.configure({ table: { resizable: true } }),
      Placeholder.configure({
        placeholder: "Start writing, or use the toolbar to add rich content…",
      }),
      FileHandler.configure({
        onDrop(target, files, position) {
          target.commands.setTextSelection(position);
          void uploadAndInsertRef.current(files, target as any);
        },
        onPaste(target, files) {
          void uploadAndInsertRef.current(files, target as any);
        },
        consumePasteEvent: true,
      }),
    ],
    onUpdate({ editor: target }) {
      const current = splitMarkdown(valueRef.current);
      const next = joinMarkdown(current.frontmatter, target.getMarkdown());
      valueRef.current = next;
      onChange(next);
    },
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-full max-w-none px-8 py-7 text-[15px] leading-7 text-stone-800 outline-none sm:px-10 lg:px-14",
        spellcheck: "true",
      },
      handleDOMEvents: {
        click(_view, event) {
          const anchor = (event.target as HTMLElement | null)?.closest("a");
          const href = anchor?.getAttribute("href");
          if (!href || !onOpenDocument) return false;
          const path = resolveMarkdownPath(documentPath, href);
          if (!path) return false;
          const target = documents.find(
            (item) =>
              item.path.toLowerCase() === path.toLowerCase() ||
              item.path.replace(/\.md$/i, "").toLowerCase() ===
                path.replace(/\.md$/i, "").toLowerCase(),
          );
          if (!target) return false;
          event.preventDefault();
          onOpenDocument(target.documentId);
          return true;
        },
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const nextBody = splitMarkdown(value).body.trim();
    if (editor.getMarkdown().trim() === nextBody) return;
    editor.commands.setContent(nextBody, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);

  const insertAssets = useCallback(
    (assets: UploadedAsset[], target = editor) => {
      if (!target) return;
      for (const asset of assets) {
        const url = `/api/knowledge/assets/${encodeURIComponent(asset.itemId)}`;
        if (asset.mimeType.startsWith("image/")) {
          target
            .chain()
            .focus()
            .setImage({ src: url, alt: asset.name, title: asset.name })
            .run();
        } else {
          const prefix = asset.mimeType.startsWith("audio/")
            ? "Listen to"
            : asset.mimeType.startsWith("video/")
              ? "Watch"
              : "Open";
          target
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: `${prefix} ${asset.name}`,
              marks: [{ type: "link", attrs: { href: url } }],
            })
            .insertContent(" ")
            .run();
        }
      }
    },
    [editor],
  );

  const uploadAndInsert = useCallback(
    async (files: File[], target = editor) => {
      if (!files.length || !target) return;
      setUploading(true);
      setUploadError("");
      try {
        const form = new FormData();
        files.forEach((file) => form.append("files", file));
        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: form,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.message || payload?.error || "Upload failed",
          );
        }
        const uploaded = (Array.isArray(payload?.data) ? payload.data : []).map(
          (item: any) => ({
            itemId: item.itemId || item.fileId,
            name: item.name || "Library file",
            mimeType: item.mimeType || "application/octet-stream",
            kind: item.kind || "file",
          }),
        );
        insertAssets(uploaded, target);
      } catch (cause) {
        setUploadError(
          cause instanceof Error ? cause.message : "Could not upload file",
        );
      } finally {
        setUploading(false);
        if (uploadRef.current) uploadRef.current.value = "";
      }
    },
    [editor, insertAssets],
  );

  useEffect(() => {
    uploadAndInsertRef.current = uploadAndInsert as any;
  }, [uploadAndInsert]);

  function addExternalLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Paste a web address", previous || "https://");
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function insertNoteLink(item: KnowledgeDocument) {
    if (!editor) return;
    const href = relativeMarkdownPath(documentPath, item.path);
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: item.title,
        marks: [{ type: "link", attrs: { href } }],
      })
      .insertContent(" ")
      .run();
    setNoteOpen(false);
    setNoteQuery("");
  }

  if (!editor) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center text-sm text-stone-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const matchingNotes = documents
    .filter((item) => item.path !== documentPath)
    .filter((item) => {
      const query = noteQuery.trim().toLowerCase();
      return (
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query)
      );
    })
    .slice(0, 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200/80 bg-[#fffefa] shadow-[0_1px_2px_rgba(28,25,23,0.03)]">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-0.5 border-b border-stone-200/80 bg-[#f7f5f1] px-2 py-1.5">
        <ToolbarButton
          label="Undo"
          icon={Undo2}
          disabled={!editable || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo"
          icon={Redo2}
          disabled={!editable || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          label="Heading 1"
          icon={Heading1}
          active={editor.isActive("heading", { level: 1 })}
          disabled={!editable}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <ToolbarButton
          label="Heading 2"
          icon={Heading2}
          active={editor.isActive("heading", { level: 2 })}
          disabled={!editable}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarButton
          label="Bold"
          icon={Bold}
          active={editor.isActive("bold")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          icon={Italic}
          active={editor.isActive("italic")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Strikethrough"
          icon={Strikethrough}
          active={editor.isActive("strike")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          label="Bulleted list"
          icon={List}
          active={editor.isActive("bulletList")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered list"
          icon={ListOrdered}
          active={editor.isActive("orderedList")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Quote"
          icon={Quote}
          active={editor.isActive("blockquote")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="Inline code"
          icon={Code2}
          active={editor.isActive("code")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          label="Code block"
          icon={Braces}
          active={editor.isActive("codeBlock")}
          disabled={!editable}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          label="Add web link"
          icon={Link2}
          active={editor.isActive("link")}
          disabled={!editable}
          onClick={addExternalLink}
        />
        <ToolbarButton
          label="Link another note"
          icon={FileUp}
          disabled={!editable}
          onClick={() => setNoteOpen(true)}
        />
        <ToolbarButton
          label="Insert table"
          icon={Table2}
          disabled={!editable}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        />
        <ToolbarButton
          label="Upload image or file"
          icon={ImagePlus}
          disabled={!editable || uploading}
          onClick={() => uploadRef.current?.click()}
        />
        <ToolbarButton
          label="Insert from Library"
          icon={FileImage}
          disabled={!editable}
          onClick={() => setLibraryOpen(true)}
        />
        <ToolbarButton
          label="Divider"
          icon={Minus}
          disabled={!editable}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
        <input
          ref={uploadRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) =>
            void uploadAndInsert(Array.from(event.target.files || []))
          }
        />
        {uploading && (
          <span className="ml-auto flex items-center gap-1.5 px-2 text-[11px] text-stone-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Adding to Library
          </span>
        )}
      </div>
      {uploadError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {uploadError}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="min-h-full" />
      </div>

      <LibraryPickerDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        attachedFileIds={[]}
        onAdd={(items: LibraryPickerItem[]) => insertAssets(items)}
      />
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="flex max-h-[75vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>Link to a note</DialogTitle>
            <DialogDescription>
              Insert a portable Markdown link and connect the knowledge graph.
            </DialogDescription>
          </DialogHeader>
          <div className="border-b p-4">
            <Input
              autoFocus
              value={noteQuery}
              onChange={(event) => setNoteQuery(event.target.value)}
              placeholder="Search notes"
            />
          </div>
          <ScrollArea className="h-[min(420px,52vh)]">
            <div className="space-y-1 p-2">
              {matchingNotes.map((item) => (
                <button
                  key={item.documentId}
                  type="button"
                  onClick={() => insertNoteLink(item)}
                  className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-stone-50"
                >
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">
                    {item.path}
                  </span>
                </button>
              ))}
              {!matchingNotes.length && (
                <p className="px-3 py-10 text-center text-sm text-stone-500">
                  No matching notes
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Bold;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-stone-500 transition-colors hover:bg-white hover:text-stone-900 disabled:opacity-35",
        active && "bg-white text-teal-800 shadow-sm ring-1 ring-stone-200",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-stone-200" />;
}

function splitMarkdown(markdown: string) {
  if (!/^---\s*\r?\n/.test(markdown)) {
    return { frontmatter: "", body: markdown };
  }
  const closing = /^---\s*$/gm;
  closing.lastIndex = markdown.indexOf("\n") + 1;
  const match = closing.exec(markdown);
  if (!match) return { frontmatter: "", body: markdown };
  const end = match.index + match[0].length;
  return {
    frontmatter: markdown.slice(0, end).trimEnd(),
    body: markdown
      .slice(end)
      .replace(/^\s*\r?\n/, "")
      .trimStart(),
  };
}

function joinMarkdown(frontmatter: string, body: string) {
  return frontmatter ? `${frontmatter.trimEnd()}\n\n${body.trimStart()}` : body;
}

function relativeMarkdownPath(fromPath: string, targetPath: string) {
  const from = fromPath.replace(/\\/g, "/").split("/");
  from.pop();
  const target = targetPath.replace(/\\/g, "/").split("/");
  while (from.length && target.length && from[0] === target[0]) {
    from.shift();
    target.shift();
  }
  const path = [...from.map(() => ".."), ...target].join("/");
  return path.startsWith(".") ? path : `./${path}`;
}

function resolveMarkdownPath(fromPath: string, href: string) {
  let clean: string;
  try {
    clean = decodeURIComponent(href.split("#")[0] || "");
  } catch {
    return "";
  }
  if (!clean || /^[a-z][a-z\d+.-]*:/i.test(clean) || clean.startsWith("//")) {
    return "";
  }
  const base = clean.startsWith("/")
    ? []
    : fromPath.replace(/\\/g, "/").split("/").slice(0, -1);
  for (const segment of clean.replace(/^\.\//, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") base.pop();
    else base.push(segment);
  }
  const path = base.join("/");
  return /\.md$/i.test(path) ? path : `${path}.md`;
}
