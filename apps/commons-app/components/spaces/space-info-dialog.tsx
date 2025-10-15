"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Info,
  Users,
  Calendar,
  Settings,
  Crown,
  Shield,
  ChevronDown,
  ChevronRight,
  Eye,
  UserPlus,
  Hammer,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

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

interface SpaceDetails {
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
  members: SpaceMember[];
}

interface SpaceInfoDialogProps {
  spaceDetails: SpaceDetails;
  trigger?: React.ReactNode;
}

export default function SpaceInfoDialog({
  spaceDetails,
  trigger,
}: SpaceInfoDialogProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    return status === "active"
      ? "bg-green-100 text-green-800"
      : "bg-gray-100 text-gray-800";
  };

  const getRoleIcon = (role: string) => {
    return role === "owner" ? (
      <Crown className="h-3 w-3" />
    ) : (
      <Shield className="h-3 w-3" />
    );
  };

  const getMemberTypeColor = (type: string) => {
    return type === "agent"
      ? "bg-purple-100 text-purple-800"
      : "bg-blue-100 text-blue-800";
  };

  const getPermissionIcon = (permission: string) => {
    switch (permission) {
      case "canWrite":
        return <Eye className="h-3 w-3" />;
      case "canInvite":
        return <UserPlus className="h-3 w-3" />;
      case "canModerate":
        return <Hammer className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case "canWrite":
        return "Write Messages";
      case "canInvite":
        return "Invite Members";
      case "canModerate":
        return "Moderate Space";
      default:
        return permission;
    }
  };

  return (
    <TooltipProvider>
      <Popover>
        <PopoverTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="sm">
              <Info className="h-4 w-4" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="w-96 p-0"
          align="end"
          side="bottom"
          sideOffset={8}
        >
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
                {spaceDetails.name.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{spaceDetails.name}</h3>
                <p className="text-xs text-gray-500">
                  {spaceDetails.description}
                </p>
              </div>
            </div>
          </div>

          <ScrollArea className="max-h-96">
            <div className="p-4 space-y-4">
              {/* Basic Details */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Created:</span>
                    <p className="font-medium">
                      {formatDate(spaceDetails.createdAt)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Members:</span>
                    <p className="font-medium">
                      {spaceDetails.members.length}/{spaceDetails.maxMembers}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={spaceDetails.isPublic ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {spaceDetails.isPublic ? "Public" : "Private"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {spaceDetails.createdByType}
                  </Badge>
                </div>
              </div>

              {/* Collapsible Settings */}
              <Collapsible
                open={isSettingsOpen}
                onOpenChange={setIsSettingsOpen}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-2 h-auto"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span className="text-sm font-medium">Settings</span>
                    </div>
                    {isSettingsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <span>Allow Agents</span>
                      <Badge
                        variant={
                          spaceDetails.settings.allowAgents
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {spaceDetails.settings.allowAgents ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <span>Allow Humans</span>
                      <Badge
                        variant={
                          spaceDetails.settings.allowHumans
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {spaceDetails.settings.allowHumans ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <span>Require Approval</span>
                      <Badge
                        variant={
                          spaceDetails.settings.requireApproval
                            ? "destructive"
                            : "default"
                        }
                        className="text-xs"
                      >
                        {spaceDetails.settings.requireApproval ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <span>Moderators</span>
                      <Badge variant="outline" className="text-xs">
                        {spaceDetails.settings.moderators.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Space ID:</span>
                      <code className="bg-gray-100 px-1 rounded">
                        {spaceDetails.spaceId.slice(0, 8)}...
                      </code>
                    </div>
                    <div className="flex justify-between">
                      <span>Session ID:</span>
                      <code className="bg-gray-100 px-1 rounded">
                        {spaceDetails?.sessionId &&
                          spaceDetails.sessionId.slice(0, 8)}
                        ...
                      </code>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Members with integrated permissions */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Members ({spaceDetails.members.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {spaceDetails.members.map((member) => (
                    <div key={member.id} className="relative">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                            onClick={() =>
                              setSelectedMember(
                                selectedMember === member.id ? null : member.id
                              )
                            }
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback
                                  className={`text-xs ${
                                    member.memberType === "agent"
                                      ? "bg-purple-100 text-purple-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {member.memberId.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <p className="text-xs font-medium truncate">
                                    {member.memberId.slice(0, 10)}...
                                  </p>
                                  <div className="flex items-center gap-1">
                                    {getRoleIcon(member.role)}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge
                                className={`text-xs ${getMemberTypeColor(member.memberType)}`}
                              >
                                {member.memberType}
                              </Badge>
                              <Badge
                                className={`text-xs ${getStatusColor(member.status)}`}
                              >
                                {member.status}
                              </Badge>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-medium text-xs">
                              {member.memberId}
                            </p>
                            <p className="text-xs text-gray-500">
                              Joined{" "}
                              {new Date(member.joinedAt).toLocaleDateString()}
                            </p>
                            {member.lastActiveAt && (
                              <p className="text-xs text-gray-500">
                                Last active{" "}
                                {new Date(
                                  member.lastActiveAt
                                ).toLocaleDateString()}
                              </p>
                            )}
                            <div className="pt-1 border-t">
                              <p className="text-xs font-medium mb-1">
                                Permissions:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(member.permissions).map(
                                  ([key, value]) => (
                                    <div
                                      key={key}
                                      className="flex items-center gap-1"
                                    >
                                      {getPermissionIcon(key)}
                                      <Badge
                                        variant={
                                          value ? "default" : "secondary"
                                        }
                                        className="text-xs"
                                      >
                                        {getPermissionLabel(key)}
                                      </Badge>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>

                      {/* Expanded permissions view */}
                      {selectedMember === member.id && (
                        <div className="mt-1 p-2 bg-white border rounded-lg shadow-sm">
                          <div className="text-xs space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-medium">Permissions</span>
                              <Badge variant="outline" className="text-xs">
                                {member.role}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {Object.entries(member.permissions).map(
                                ([key, value]) => (
                                  <div
                                    key={key}
                                    className="flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-1">
                                      {getPermissionIcon(key)}
                                      <span>{getPermissionLabel(key)}</span>
                                    </div>
                                    <Badge
                                      variant={value ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {value ? "Yes" : "No"}
                                    </Badge>
                                  </div>
                                )
                              )}
                            </div>
                            <div className="pt-1 border-t text-gray-500">
                              <p>Joined: {formatDate(member.joinedAt)}</p>
                              {member.lastActiveAt && (
                                <p>
                                  Last active: {formatDate(member.lastActiveAt)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
