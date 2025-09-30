"use client";

import { useState, useRef, useEffect } from "react";
import UserLockedTokens from "@/components/agents/user-locked-tokens";
import { ArrowUp, Loader2 } from "lucide-react";
import { useAgentContext } from "@/context/AgentContext"; // Import useAgentContext

function extractMessagesFromAgentResponse(data: any): any[] {
  const messages: any = [];

  // AI message
  if (data?.content) {
    messages.push({
      role: "ai",
      content: data.content,
      metadata: data.metadata || {},
      timestamp: new Date().toISOString(),
    });
  } else if (data?.data?.content) {
    // Added this condition for nested content
    messages.push({
      role: "ai",
      content: data.data.content,
      metadata: data.metadata || {},
      timestamp: new Date().toISOString(),
    });
  }

  // Tool calls (if present)
  if (Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
    messages.push({
      role: "tool",
      content: JSON.stringify({ toolData: data }, null, 2),
      metadata: {},
      timestamp: new Date().toISOString(),
    });
  }
  console.log("Extracted messages:", messages);
  return messages;
}

export default function ChatInputBox({
  agentId,
  sessionId,
  userId,
  disabled,
  onSessionCreated,
}: {
  agentId: string;
  sessionId: string;
  userId: string;
  disabled?: boolean;
  onSessionCreated?: (sessionId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const currentAIMessageRef = useRef<string>("");

  const { addMessage, updateStreamingMessage } = useAgentContext(); // Use addMessage and updateStreamingMessage from context

  useEffect(() => {
    // set to lading if disabled is true
    if (disabled) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, [disabled]);
  useEffect(() => {
    setCurrentSessionId(sessionId);
  }, [sessionId]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    const userMessage = input;
    setInput("");
    currentAIMessageRef.current = ""; // Clear previous AI message content

    // Add user message to UI immediately using addMessage
    addMessage({
      role: "human",
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-initiator": userId,
        },
        body: JSON.stringify({
          agentId,
          sessionId: currentSessionId,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get reader from response body");
      }

      const decoder = new TextDecoder();
      let accumulatedContent = "";

      // Add a temporary AI message to the state to be updated during streaming
      addMessage({
        role: "ai",
        content: "",
        metadata: {},
        timestamp: new Date().toISOString(),
        isStreaming: true,
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const dataString = line.substring(5).trim();
            try {
              const parsedData = JSON.parse(dataString);
              console.log("Parsed Data:", parsedData);

              if (parsedData.type === "final") {
                // Handle final message
                const finalMessages = extractMessagesFromAgentResponse(
                  parsedData.payload
                );
                // Replace the temporary AI message with the final one, or add if not present
                // This is now handled by the updateStreamingMessage and addMessage in AgentContext
                // We need to ensure the final message replaces the streaming one correctly.
                updateStreamingMessage(finalMessages[0].content); // Update with final content

                if (
                  parsedData.payload.sessionId &&
                  parsedData.payload.sessionId !== sessionId
                ) {
                  setCurrentSessionId(parsedData.payload.sessionId);
                  onSessionCreated?.(parsedData.payload.sessionId);
                }
              } else if (parsedData.type === "tool") {
                // Handle tool calls
                addMessage({
                  role: "tool",
                  content: JSON.stringify(parsedData, null, 2),
                  metadata: {},
                  timestamp: new Date().toISOString(),
                });
              } else if (parsedData.type === "text") {
                // Handle streaming text
                accumulatedContent += parsedData.content;
                updateStreamingMessage(accumulatedContent);
              }
            } catch (jsonError) {
              console.error(
                "JSON parsing error:",
                jsonError,
                "for line:",
                dataString
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("Error during streaming:", error);
      addMessage({
        role: "system",
        content: `Error: ${error}`,
        timestamp: new Date().toISOString(),
      });
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
