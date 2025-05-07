"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import UserLockedTokens from "@/components/agents/user-locked-tokens";
import { ArrowUp, Loader2 } from "lucide-react";
export default function ChatInputBox() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="rounded-xl bg-white  border border-zinc-700">
      <textarea
        placeholder="Ask me something..."
        className="text-sm w-full h-16 p-2 rounded-xl resize-none focus:outline-none focus:border-transparent"
        rows={4}
        onChange={(e) => {
          // Handle input change
        }}
        onKeyDown={(e) => {
          // Handle key down events
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            // Handle submit action
          }
        }}
        onFocus={() => {
          // Handle focus event
        }}
        onBlur={() => {
          // Handle blur event
        }}
        onPaste={(e) => {
          // Handle paste event
          const pastedText = e.clipboardData.getData("text");
          // Do something with the pasted text
        }}
        onCopy={(e) => {
          // Handle copy event
          const selectedText = window.getSelection()?.toString();
          if (selectedText) {
            e.clipboardData.setData("text/plain", selectedText);
            e.preventDefault();
          }
        }}
        onCut={(e) => {
          // Handle cut event
          const selectedText = window.getSelection()?.toString();
          if (selectedText) {
            e.clipboardData.setData("text/plain", selectedText);
            e.preventDefault();
          }
        }}
        onSelect={() => {
          // Handle select event
        }}
      />
      <div className="flex justify-between items-center m-1">
        <div className="flex items-center ml-auto gap-2">
          <UserLockedTokens />
          {!loading && (
            <button
              onClick={() => {}}
              className=" bg-zinc-700 rounded-lg hover:bg-zinc-800 p-1.5 text-white "
              //disabled={!prompt} // Disable the button if prompt is empty
            >
              <ArrowUp className="h-4 w-4 text-white" />
            </button>
          )}
          {loading && (
            <button disabled className=" bg-zinc-700 rounded-lg p-1.5">
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
