"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import UserLockedTokens from "@/components/agents/user-locked-tokens";
import { ArrowUp, Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

export default function ChatInputBox({
  agentId,
  sessionId,
  setMessages,
  onFirstMessage,
  userId,
  onSessionCreated,
}: {
  agentId: string;
  sessionId: string;
  setMessages: Dispatch<SetStateAction<any[]>>;
  onFirstMessage?: (input: string) => void;
  userId: string;
  onSessionCreated?: (sessionId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    const userMessage = input;
    setInput("");

    // Add user message to UI immediately
    setMessages((prev) => [
      ...prev,
      {
        role: "human",
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-initiator": userId,
        },
        body: JSON.stringify({
          agentId,
          sessionId,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const resdata = await response.json();
      console.log("Response data:", resdata);
      const data = resdata.data;
      console.log("Session Id:", data.sessionId);
      // If this is a new session, notify parent
      if (data.sessionId && data.sessionId !== sessionId) {
        onSessionCreated?.(data.sessionId);
      }

      // Add AI response to messages
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.content,
          timestamp: new Date().toISOString(),
        },
      ]);
      console.log("Session Id:", sessionId);
      // Fetch full session details
      const sessionRes = await fetch(
        `/api/sessions/session/full?sessionId=${data.sessionId}`
      );
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        // Update messages with full session history
        setMessages(sessionData.history || []);
      } else {
        // Fallback to just adding the agent's response
        setMessages((prev) => [...prev, data]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Add error message to chat
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "Failed to send message. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-white  border border-zinc-700">
      <textarea
        placeholder="Ask me something..."
        className="text-sm w-full h-16 p-2 rounded-xl resize-none focus:outline-none focus:border-transparent"
        rows={4}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
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
              onClick={handleSend}
              className=" bg-zinc-700 rounded-lg hover:bg-zinc-800 p-1.5 text-white "
              disabled={!input.trim()}
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
