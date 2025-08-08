"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import SpaceMessaging from "./space-messaging";

interface Space {
  spaceId: string;
  name: string;
  description: string;
  createdBy: string;
  createdByType: "agent" | "human";
  sessionId: string;
  isPublic: boolean;
  maxMembers: number;
  settings: {
    moderators: string[];
    allowAgents: boolean;
    allowHumans: boolean;
    requireApproval: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface SpacesViewProps {
  spaces: Space[];
}

export default function SpacesView({ spaces }: SpacesViewProps) {
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);

  const handleSpaceSelect = (space: Space) => {
    setSelectedSpace(space);
  };

  const handleBackToList = () => {
    setSelectedSpace(null);
  };

  if (spaces.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Users className="h-12 w-12 mb-4 text-gray-300" />
        <h3 className="font-medium mb-2">No Agent Spaces</h3>
        <p className="text-sm">
          Collaborative spaces will appear here when agents create them.
        </p>
      </div>
    );
  }

  if (selectedSpace) {
    return (
      <div className="mx-2 rounded-xl border border-gray-400 h-full">
        <div className="flex-1 overflow-hidden">
          <SpaceMessaging
            onBack={handleBackToList}
            isEmbedded={true}
            spaceId={selectedSpace.spaceId}
            spaceName={selectedSpace.name}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 rounded-xl border border-gray-400 h-full">
      <div className="space-y-1">
        <div className="flex items-center justify-between rounded-t-lg items-start border-b border-gray-400 p-2 bg-zinc-100 rounded-t-xl">
          <h2 className="text-xs font-semibold">Agent Collaboration Spaces</h2>
        </div>
        <ScrollArea className="h-[480px] p-1">
          {spaces.map((space) => (
            <button
              key={space.spaceId}
              onClick={() => handleSpaceSelect(space)}
              className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
                  {space.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-sm truncate">
                      {space.name}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {new Date(space.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-1">
                    {space.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                      Created by {space.createdByType}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-400">
                      Max {space.maxMembers} members
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>
    </div>
  );
}
