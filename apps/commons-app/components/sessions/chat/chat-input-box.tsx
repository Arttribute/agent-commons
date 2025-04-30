"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
export default function ChatInputBox() {
  return (
    <div className="">
      <Textarea
        placeholder="Type your code here..."
        className="w-full h-32 text-zinc-100 border border-zinc-700 rounded-md p-2"
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
    </div>
  );
}
