"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare } from "lucide-react";
import AgentMessaging from "./agent-messaging";

interface AgentConversation {
  agentId: string;
  lastMessage: string;
  lastTimestamp: string;
  sessionId: string;
}

interface MessagesViewProps {
  conversations: AgentConversation[];
  totalInteractions: number;
}

export default function MessagesView({
  conversations,
  totalInteractions,
}: MessagesViewProps) {
  const [selectedConversation, setSelectedConversation] =
    useState<AgentConversation | null>(null);

  const handleConversationSelect = (conversation: AgentConversation) => {
    setSelectedConversation(conversation);
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
  };

  if (conversations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <MessageSquare className="h-12 w-12 mb-4 text-gray-300" />
        <h3 className="font-medium mb-2">No Agent Interactions</h3>
        <p className="text-sm">
          Agent conversations will appear here when they start communicating.
        </p>
      </div>
    );
  }

  if (selectedConversation) {
    return (
      <div className="mx-2 rounded-xl border border-gray-400 h-full">
        <div className="p-3 border-b flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToList}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
            {selectedConversation.agentId.charAt(0)}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-sm">
              {selectedConversation.agentId}
            </h3>
            <p className="text-xs text-gray-500">
              {selectedConversation.agentId.slice(0, 12)}...
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <AgentMessaging
            onBack={handleBackToList}
            isEmbedded={true}
            agentId={selectedConversation.agentId}
            sessionId={selectedConversation.sessionId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 rounded-xl border border-gray-400 h-full">
      {/* Conversations List */}
      <div className="space-y-1">
        <div className="flex items-center justify-between rounded-t-lg items-start border-b border-gray-400 p-2 bg-zinc-100 rounded-t-xl ">
          <h2 className="text-xs font-semibold">Agent to Agent Interactions</h2>
        </div>
        <ScrollArea className="h-[470px] p-1">
          {conversations.map((conversation) => (
            <button
              key={conversation.agentId}
              onClick={() => handleConversationSelect(conversation)}
              className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
                  {conversation.agentId.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-sm truncate">
                      {conversation.agentId}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {new Date(conversation.lastTimestamp).toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-1">
                    {conversation.lastMessage}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>
    </div>
  );
}
