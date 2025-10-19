"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, UserPlus, Loader2 } from "lucide-react";

interface SpaceMember {
  id: string;
  spaceId: string;
  memberId: string;
  memberType: "agent" | "human";
  role: "owner" | "member";
  status: "active" | "inactive";
  permissions: {
    canWrite: boolean;
    canInvite: boolean;
    canModerate: boolean;
  };
  joinedAt: string;
  lastActiveAt: string | null;
  isSubscribed: boolean;
}

interface SpaceMessageInputProps {
  spaceId: string;
  members: SpaceMember[];
  currentUserId: string;
  onMessageSubmitted: (content: string) => void;
}

export default function SpaceMessageInput({
  spaceId,
  members,
  currentUserId,
  onMessageSubmitted,
}: SpaceMessageInputProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ x: 0, y: 0 });
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const mentionStartRef = useRef<number>(0);

  // Check if current user is a member
  const isUserMember = members.some(
    (member) => member.memberId === currentUserId
  );
  const currentMember = members.find(
    (member) => member.memberId === currentUserId
  );
  const canWrite = currentMember?.permissions.canWrite ?? false;

  // Filter members for mentions (exclude current user)
  const availableMembers = members.filter(
    (member) =>
      member.memberId !== currentUserId &&
      member.status === "active" &&
      member.memberType === "agent" // Only show agents for @mentions
  );

  // Filter members based on mention query
  const filteredMembers = availableMembers.filter((member) =>
    member.memberId.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    setMessage(value);
    setCursorPosition(cursorPos);

    // Check for @ mentions
    const beforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = beforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const afterAt = beforeCursor.substring(lastAtIndex + 1);

      // Check if we're in a mention context (no spaces after @)
      if (!afterAt.includes(" ") && afterAt.length >= 0) {
        setMentionQuery(afterAt);
        setShowMentions(true);
        mentionStartRef.current = lastAtIndex;

        // Calculate position for mention popup
        if (inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect();
          setMentionPosition({
            x: rect.left,
            y: rect.bottom + 4,
          });
        }
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (member: SpaceMember) => {
    const beforeMention = message.substring(0, mentionStartRef.current);
    const afterCursor = message.substring(cursorPosition);
    const mentionText = `@${member.memberId.slice(0, 8)} `;

    const newMessage = beforeMention + mentionText + afterCursor;
    setMessage(newMessage);
    setShowMentions(false);

    // Add to selected mentions for targeting
    if (!selectedMentions.includes(member.memberId)) {
      setSelectedMentions([...selectedMentions, member.memberId]);
    }

    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = beforeMention.length + mentionText.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isSending) return;
    onMessageSubmitted(message);
    // Clear input and mentions
    setMessage("");
    setSelectedMentions([]);
    setIsSending(true);
    try {
      const targetType = selectedMentions.length > 0 ? "direct" : "broadcast";
      const targetIds =
        selectedMentions.length > 0 ? selectedMentions : undefined;

      const response = await fetch("/api/spaces/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sender-id": currentUserId,
          "x-sender-type": "human", // or "agent" if appropriate
        },
        body: JSON.stringify({
          spaceId,
          senderId: currentUserId,
          content: message.trim(),
          targetType,
          targetIds,
          messageType: "text",
          metadata: {
            sessionId: null,
          },
          senderType: "human", // or "agent" if appropriate
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // You might want to show an error toast here
    } finally {
      setIsSending(false);
    }
  };

  const handleJoinSpace = async () => {
    setIsJoining(true);
    try {
      const response = await fetch("/api/spaces/members/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spaceId,
          memberId: currentUserId,
          memberType: "human", // Assuming current user is human
          role: "member",
          permissions: {
            canWrite: true,
            canInvite: false,
            canModerate: false,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to join space");
      }
    } catch (error) {
      console.error("Error joining space:", error);
      // You might want to show an error toast here
    } finally {
      setIsJoining(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }

    if (e.key === "Escape") {
      setShowMentions(false);
    }
  };

  // If user is not a member, show join button
  if (!isUserMember) {
    return (
      <div className="p-4 border-t bg-white">
        <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            You need to join this space to send messages
          </p>
          <Button onClick={handleJoinSpace} disabled={isJoining} size="sm">
            {isJoining ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Join Space
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // If user is a member but can't write, show disabled state
  if (!canWrite) {
    return (
      <div className="p-4 border-t bg-white">
        <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            {"You don't have permission to send messages in this space"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white">
      {/* Show selected mentions */}
      {selectedMentions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="text-xs font-medium text-gray-500">To:</span>
          {selectedMentions.map((mentionId) => (
            <Badge
              key={mentionId}
              variant="secondary"
              className="text-xs rounded-full px-2.5 py-1"
            >
              @{mentionId.slice(0, 8)}
              <button
                onClick={() =>
                  setSelectedMentions((prev) =>
                    prev.filter((id) => id !== mentionId)
                  )
                }
                className="ml-1.5 hover:text-red-500 transition-colors"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="flex items-center gap-2 px-1  border border-gray-300 rounded-lg focus-within:ring-1 focus-within:ring-gray-500 transition-all">
          <Input
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder="Type a message... Use @ to mention agents"
            disabled={isSending}
            className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 text-sm"
          />

          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || isSending}
            size="sm"
            className="h-8 w-8 p-0 rounded-lg shrink-0"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Mention suggestions popover */}
        {showMentions && filteredMembers.length > 0 && (
          <div
            className="absolute z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto"
            style={{
              bottom: "100%",
              left: 0,
              marginBottom: "8px",
            }}
          >
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-600 mb-2 px-2">
                Mention an agent
              </div>
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleMentionSelect(member)}
                  className="w-full flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg text-left transition-colors"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-white shadow-sm">
                    <AvatarFallback className="bg-purple-500 text-white text-xs font-semibold">
                      {member.memberId.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {member.memberId.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-gray-500">
                      {member.role} • {member.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
