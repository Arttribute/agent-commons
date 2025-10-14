"use client";
import { useState } from "react";
import type React from "react";

import { useCreateSpace } from "@/hooks/spaces/use-create-space";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import RandomAvatar from "@/components/account/random-avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useAgents } from "@/hooks/agents/use-agents";
import { Checkbox } from "../ui/checkbox";
import { cn } from "@/lib/utils";
import { Globe, Lock, Users, Sparkles, Plus } from "lucide-react";
import ImageUploader from "@/components/agents/ImageUploader";

interface Props {
  creatorId?: string;
  onCreated?: (space: any) => void;
}

export function CreateSpaceForm({ creatorId, onCreated }: Props) {
  const { createSpace, loading, error } = useCreateSpace(creatorId, "human");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [maxMembers, setMaxMembers] = useState<number | "">("");
  const { agents } = useAgents(creatorId);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [image, setImage] = useState<string | undefined>(undefined);

  // Centralized toggle to avoid duplicate setState calls
  const toggleAgent = (agentId: string, next?: boolean) => {
    setSelectedAgentIds((prev) => {
      const has = prev.includes(agentId);
      const shouldAdd = typeof next === "boolean" ? next : !has;
      if (shouldAdd && !has) return [...prev, agentId];
      if (!shouldAdd && has) return prev.filter((id) => id !== agentId);
      return prev;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const space = await createSpace({
      name: name.trim(),
      description: description.trim() || undefined,
      isPublic,
      maxMembers: maxMembers === "" ? undefined : Number(maxMembers),
      image,
    });
    try {
      if (space?.spaceId && selectedAgentIds.length) {
        await Promise.all(
          selectedAgentIds.map((agentId) =>
            fetch(`/api/spaces/members/add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                spaceId: space.spaceId,
                memberId: agentId,
                memberType: "agent",
              }),
            })
          )
        );
      }
    } catch (err) {
      console.error("Failed to add selected agents to space", err);
    }
    setName("");
    setDescription("");
    setMaxMembers("");
    setSelectedAgentIds([]);
    onCreated?.(space);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 p-6 border border-gray-200 rounded-2xl bg-white shadow-lg hover:shadow-xl transition-shadow duration-200"
    >
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Create New Space
          </h3>
          <p className="text-xs text-gray-500">
            Set up your collaborative environment
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-gray-700">
          Space Name
        </label>
        <div className="flex items-center gap-4">
          <ImageUploader onImageChange={setImage} defaultImage={image} />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Product Team, Design Squad"
            required
            className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-gray-700">
          Description
        </label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this space about?"
          className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
        />
        <p className="text-xs text-gray-500">
          Optional - help others understand your space
        </p>
      </div>

      <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPublic ? (
              <Globe className="w-5 h-5 text-blue-600" />
            ) : (
              <Lock className="w-5 h-5 text-gray-600" />
            )}
            <div>
              <label
                htmlFor="public-switch"
                className="text-sm font-semibold text-gray-700 cursor-pointer"
              >
                {isPublic ? "Public Space" : "Private Space"}
              </label>
              <p className="text-xs text-gray-500">
                {isPublic
                  ? "Anyone can discover and join"
                  : "Invite-only access"}
              </p>
            </div>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={(v) => setIsPublic(v)}
            id="public-switch"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <label className="text-sm font-semibold text-gray-700">
              Add Agents
            </label>
          </div>
          <Link
            href="/agents/create"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New agent
          </Link>
        </div>
        {!agents || agents.length === 0 ? (
          <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 mb-1">
                  No agents yet
                </p>
                <p className="text-xs text-gray-600">
                  Create an agent to add as a member
                </p>
              </div>
              <Link href="/agents/create">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-transparent"
                >
                  <Plus className="w-3 h-3" />
                  Create
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="max-h-48 overflow-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white shadow-sm">
            {agents.map((a) => {
              const checked = selectedAgentIds.includes(a.agentId);
              return (
                <HoverCard key={a.agentId}>
                  <HoverCardTrigger asChild>
                    <div
                      className={cn(
                        "flex items-center gap-3 p-3 cursor-pointer transition-all duration-150",
                        checked
                          ? "bg-gradient-to-r from-blue-50 to-purple-50"
                          : "hover:bg-gray-50"
                      )}
                      onClick={() => toggleAgent(a.agentId)}
                    >
                      <Checkbox
                        checked={checked}
                        // Prevent row onClick from also toggling
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) => toggleAgent(a.agentId, !!v)}
                      />
                      <RandomAvatar username={a.agentId} size={32} />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {a.name}
                        </span>
                        <span className="text-xs text-gray-500 truncate">
                          {a.agentId}
                        </span>
                      </div>
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80 bg-white p-4 rounded-xl shadow-xl border border-gray-200 z-20">
                    <div className="flex items-center gap-3 mb-3">
                      <RandomAvatar username={a.agentId} size={48} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {a.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {a.agentId}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {a.persona ||
                        a.description ||
                        "No description available."}
                    </p>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-gray-700">
          Max Members
        </label>
        <Input
          type="number"
          min={1}
          value={maxMembers}
          onChange={(e) =>
            setMaxMembers(e.target.value ? Number(e.target.value) : "")
          }
          placeholder="Unlimited"
          className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
        />
        <p className="text-xs text-gray-500">
          Leave empty for unlimited members
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={loading || !creatorId}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 h-12 text-base font-semibold"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Creating...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Create Space
          </span>
        )}
      </Button>
    </form>
  );
}
