"use client";

import { useEffect, useRef } from "react";
import {
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Underline,
} from "lucide-react";
import { isRichText, sanitizeRichTextHtml } from "@/lib/rich-text";

export function RichTextEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editingRef.current) return;
    const nextHtml = toEditorHtml(value);
    if (editor.innerHTML === nextHtml) return;
    editor.innerHTML = nextHtml;
  }, [value]);

  function run(command: string, commandValue?: string) {
    editorRef.current?.focus();
    if (command === "highlight") {
      const selection = window.getSelection()?.toString();
      if (selection) {
        document.execCommand("insertHTML", false, `<mark>${escapeHtml(selection)}</mark>`);
      }
    } else {
      document.execCommand(command, false, commandValue);
    }
    emitChange();
  }

  function emitChange() {
    const html = sanitizeRichTextHtml(editorRef.current?.innerHTML || "");
    onChange(html);
  }

  function finishEditing() {
    editingRef.current = false;
    const editor = editorRef.current;
    if (!editor) return;
    const html = sanitizeRichTextHtml(editor.innerHTML);
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
    onChange(html);
  }

  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 p-2">
          <ToolButton label="Paragraph" onClick={() => run("formatBlock", "p")}>
            <Pilcrow className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Heading" onClick={() => run("formatBlock", "h2")}>
            <Heading2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Subheading" onClick={() => run("formatBlock", "h3")}>
            <Heading3 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Bold" onClick={() => run("bold")}>
            <Bold className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Italic" onClick={() => run("italic")}>
            <Italic className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Underline" onClick={() => run("underline")}>
            <Underline className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Highlight" onClick={() => run("highlight")}>
            <Highlighter className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Bullet list" onClick={() => run("insertUnorderedList")}>
            <List className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Numbered list" onClick={() => run("insertOrderedList")}>
            <ListOrdered className="h-4 w-4" />
          </ToolButton>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => {
            editingRef.current = true;
          }}
          onInput={emitChange}
          onBlur={finishEditing}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            emitChange();
          }}
          className="min-h-40 space-y-3 px-3 py-3 text-sm leading-7 text-slate-800 outline-none empty:before:text-slate-400 empty:before:content-['Start_writing...'] [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-950 [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-950 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </label>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-950"
    >
      {children}
    </button>
  );
}

function toEditorHtml(value: string) {
  if (!value) return "";
  if (isRichText(value)) return sanitizeRichTextHtml(value);
  return value
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
