"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, PencilIcon } from "lucide-react";
import RandomAvatar from "@/components/account/random-avatar";
import { cn } from "@/lib/utils";

export default function AgentIdentity({
  agent,
  isOwner,
  onUpdate,
}: {
  agent: any;
  isOwner: boolean;
  onUpdate: (data: any) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editData, setEditData] = useState({
    name: agent?.name || "",
    persona: agent?.persona || "",
    instructions: agent?.instructions || "",
    description: agent?.description || "",
    avatar: agent?.avatar || "",
  });
  const [saving, setSaving] = useState(false);

  const agentAddress = agent?.agentId || "";

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(agentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(editData);
    setSaving(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex flex-col cursor-pointer border border-gray-400 rounded-xl p-3 hover:border-gray-700 transition-colors relative group">
          <div className="flex items-center gap-2 mb-2">
            <RandomAvatar size={48} username={agent?.name || "agent"} />
            <div className="flex flex-col">
              <h2 className="ml-1 font-semibold">
                {agent?.name || "Agent name"}
              </h2>
              <div className="flex items-center gap-2 bg-gray-100 p-0.5 px-2 rounded-3xl w-fit max-w-52">
                <p className="text-gray-500 text-xs truncate">{agentAddress}</p>
                <button
                  onClick={copyToClipboard}
                  className={cn(
                    " ml-1 p-1 rounded-full hover:bg-gray-200 transition-colors",
                    copied ? "text-green-500" : "text-gray-500"
                  )}
                  aria-label={copied ? "Copied" : "Copy address"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="m-1">
            <p className="text-xs font-semibold mb-0.5">Persona</p>
            <p className="text-xs text-muted-foreground">
              {agent?.persona || "No persona set."}
            </p>
          </div>
          <div className="m-1">
            <p className="text-xs font-semibold mb-0.5">Instructions</p>
            <p className="text-xs text-muted-foreground">
              {agent?.instructions || "No instructions set."}
            </p>
          </div>
          <div className="m-1 ,mb-2">
            <p className="text-xs font-semibold mb-0.5">Description</p>
            <p className="text-xs text-muted-foreground">
              {agent?.description || "No description set."}
            </p>
          </div>
        </div>
      </DialogTrigger>
      {isOwner && (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Identity</DialogTitle>
            <DialogDescription>
              {
                "Make changes to your profile here. Click save when you're done."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-24">
              <input type="file" name="file" id="file" className="hidden" />
              <label htmlFor="file" className="cursor-pointer w-full">
                <RandomAvatar size={80} username={editData.name || "agent"} />
                <div className="flex items-center justify-center p-2 bg-white border border-gray-300 rounded-full w-8 -mt-10 ml-auto mx-2">
                  <PencilIcon className="w-4 h-4 text-gray-700 " />
                </div>
              </label>
            </div>
            <div className="flex flex-col w-full">
              <div className="flex items-center gap-2 bg-gray-100 p-0.5 px-2 rounded-3xl w-fit max-w-96">
                <p className="text-gray-500 text-xs truncate">{agentAddress}</p>
                <button
                  onClick={copyToClipboard}
                  className={cn(
                    " ml-1 p-1 rounded-full hover:bg-gray-200 transition-colors",
                    copied ? "text-green-500" : "text-gray-500"
                  )}
                  aria-label={copied ? "Copied" : "Copy address"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex flex-col w-full mt-1 ">
                <Input
                  placeholder="Enter agent name"
                  value={editData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Label className="text-sm font-semibold">Persona</Label>
          <Textarea
            className="w-full h-20 -mt-2"
            placeholder="Share something about yourself"
            value={editData.persona}
            onChange={(e) => handleChange("persona", e.target.value)}
          />

          <Label className="text-sm font-semibold">Instructions</Label>
          <Textarea
            className="w-full h-20 -mt-2"
            placeholder="Share something about yourself"
            value={editData.instructions}
            onChange={(e) => handleChange("instructions", e.target.value)}
          />

          <Label className="text-sm font-semibold">Description</Label>
          <Textarea
            className="w-full h-20 -mt-2"
            placeholder="Share something about yourself"
            value={editData.description}
            onChange={(e) => handleChange("description", e.target.value)}
          />

          <DialogFooter>
            <Button
              className="w-full mt-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
