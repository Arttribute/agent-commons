"use client";
import { useState } from "react";
import type React from "react";

import { useCreateSpace } from "@/hooks/spaces/use-create-space";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import RandomAvatar from "@/components/account/random-avatar";
// Hover details removed for a simpler UI
import { useAgents } from "@/hooks/agents/use-agents";
// Using a native checkbox for simpler controlled behavior
import { cn } from "@/lib/utils";
import { Globe, Lock, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ImageUploader from "@/components/agents/ImageUploader";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { agents, loading: agentsLoading } = useAgents(creatorId);
  // If there's no creatorId yet, treat agents as loading to avoid showing
  // "No agents yet" while the owner/human id is resolving in the parent.
  const showAgentsLoading = agentsLoading || !creatorId;
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
      className="space-y-4 p-6 border border-gray-400 rounded-lg
       bg-white"
    >
      <div className="">
        <div className="bg-teal-200 w-48 h-8 -mb-8 rounded-lg"></div>
        <h2 className="text-2xl font-semibold">Create New Space</h2>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-4">
          <ImageUploader onImageChange={setImage} defaultImage={image} />
          <div className="flex flex-col gap-2 w-full">
            <div>
              <label className="block text-sm text-gray-700">Space name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Product Team, Design Squad"
                required
                className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3">
                <div className=" px-4 py-2 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isPublic ? (
                        <Globe className="w-4 h-4 text-gray-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-gray-600" />
                      )}
                      <div>
                        <label
                          htmlFor="public-switch"
                          className="text-sm text-gray-700 cursor-pointer"
                        >
                          {isPublic ? "Public Space" : "Private Space"}
                        </label>
                      </div>
                    </div>
                    <Switch
                      checked={isPublic}
                      onCheckedChange={(v) => setIsPublic(v)}
                      id="public-switch"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm text-gray-700">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this space about?"
          className="min-h-20"
        />
        <p className="text-xs text-gray-500">
          Optional - help others understand your space
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Add Agents</label>
          </div>
          <Link
            href="/agents/create"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New agent
          </Link>
        </div>
  {showAgentsLoading ? (
          <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Loading agents…
                </p>
                <p className="text-xs text-gray-600">
                  Fetching your agents — this should be quick.
                </p>
              </div>
                    <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            </div>
          </div>
        ) : !agents || agents.length === 0 ? (
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
          <ScrollArea className="h-36 border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white shadow-sm">
            {agents.map((a) => {
              const checked = selectedAgentIds.includes(a.agentId);
              return (
                <div
                  key={a.agentId}
                  className={cn(
                    "flex items-center gap-3 p-3 transition-all duration-150",
                    checked
                      ? "bg-gradient-to-r from-blue-50 to-purple-50"
                      : "hover:bg-gray-50"
                  )}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-3.5 shrink-0 rounded-[8px] border border-gray-300 bg-white accent-black transition-colors focus:outline-none "
                    checked={checked}
                    onChange={(e) => toggleAgent(a.agentId, e.target.checked)}
                    aria-label={`Select ${a.name}`}
                    disabled={showAgentsLoading}
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
              );
            })}
          </ScrollArea>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <Button type="submit" disabled={loading || !creatorId} className="w-full">
        {loading ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Creating...
          </span>
        ) : (
          <span className="flex items-center gap-2">Create Space</span>
        )}
      </Button>
    </form>
  );
}
