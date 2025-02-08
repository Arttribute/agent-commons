"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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
      // Some endpoints might only return content. If so, adapt as needed:
      // { role: "assistant", content: "Hello from agent" }
      setMessages((prev) => [...prev, agentResponse]);
    } catch (err) {
      console.error("Error running agent:", err);
      // Optionally store an error message in the chat
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
      <ScrollArea className="flex-1 mb-4 p-4 rounded">
        {messages.map((msg, idx) => (
          <p key={idx} className="text-sm text-gray-600 mb-2">
            <span className="font-semibold capitalize">{msg.role}:</span>{" "}
            {msg.content}
          </p>
        ))}
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
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
