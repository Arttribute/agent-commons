"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseCustomMarkdown } from "@/lib/parseMarkdown";
import LoadingChat from "./LoadingChat";
import { Loader2 } from "lucide-react";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface InteractionInterfaceProps {
  agentId: string; // the agent to talk to
}

export function InteractionInterface({ agentId }: InteractionInterfaceProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! How can I help you today?",
    },
  ]);
  const [isSending, setIsSending] = useState(false);

  // Submit user’s message to the agent
  async function handleSend() {
    if (!input.trim()) return;
    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch(`/api/agents/agent?agentId=${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          messages: [userMessage],
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to run agent");
      }
      const data = await res.json();

      // data.data is the final message from the agent, e.g. { role: "assistant", content: "..." }
      const agentResponse = data.data;
      setMessages((prev) => [...prev, agentResponse]);
    } catch (err) {
      console.error("Error running agent:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, there was an error running the agent.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-gray-100 p-12 h-[90vh] flex flex-col">
      <ScrollArea className="flex-1 mb-4 p-4 rounded space-y-4">
        {messages.map((msg, idx) => {
          // Convert message content to HTML
          const parsedHtml = parseCustomMarkdown(msg.content);

          return (
            <div key={idx} className="text-sm text-gray-800 mb-2">
              <div className="mb-1 font-semibold capitalize">{msg.role}:</div>
              {/* 
                We use dangerouslySetInnerHTML to render our HTML. 
                Make sure you trust the source or sanitize in production. 
              */}
              <div
                className="whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{ __html: parsedHtml }}
              />
              {isSending && idx === messages.length - 1 && (
                <div className="flex justify-center items-center">
                  <LoadingChat />
                </div>
              )}
            </div>
          );
        })}
      </ScrollArea>

      <div>
        <Textarea
          placeholder="Type your message here..."
          className="w-full"
          disabled={isSending}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          type="submit"
          className="w-full mt-2"
          onClick={handleSend}
          disabled={isSending}
        >
          {isSending ? (
            <>
              Sending... <Loader2 className="w-4 h-4 animate-spin" />
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
    </div>
  );
}
