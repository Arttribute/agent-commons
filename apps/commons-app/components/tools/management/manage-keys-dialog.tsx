"use client";

import { useState, useEffect } from "react";
import { Tool, ToolKey } from "@/types/tool";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ManageKeysDialogProps {
  tool: Tool | null;
  ownerId: string;
  open: boolean;
  onClose: () => void;
}

export function ManageKeysDialog({
  tool,
  ownerId,
  open,
  onClose,
}: ManageKeysDialogProps) {
  const [keys, setKeys] = useState<ToolKey[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState({
    keyName: "",
    value: "",
    displayName: "",
    description: "",
  });

  useEffect(() => {
    if (open && ownerId) {
      loadKeys();
    }
  }, [open, ownerId]);

  const loadKeys = async () => {
    try {
      const res = await fetch(
        `/api/tool-keys?ownerId=${ownerId}&ownerType=user`
      );
      const data = await res.json();
      if (data.success) {
        // Filter keys for this tool
        const toolKeys = tool?.toolId
          ? data.data.filter(
              (k: ToolKey) => k.toolId === tool.toolId || !k.toolId
            )
          : data.data;
        setKeys(toolKeys);
      }
    } catch (error) {
      console.error("Failed to load keys:", error);
    }
  };

  const handleAddKey = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tool-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newKey,
          ownerId,
          ownerType: "user",
          toolId: tool?.toolId,
          keyType: "api-key",
        }),
      });

      const data = await res.json();
      if (data.success) {
        await loadKeys();
        setShowAddForm(false);
        setNewKey({ keyName: "", value: "", displayName: "", description: "" });
      }
    } catch (error) {
      console.error("Failed to add key:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      const res = await fetch(`/api/tool-keys/${keyId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadKeys();
      }
    } catch (error) {
      console.error("Failed to delete key:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage API Keys</DialogTitle>
          <DialogDescription>
            {tool
              ? `Keys for ${tool.displayName || tool.name}`
              : "All API Keys"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ScrollArea className="h-[400px] pr-4">
            {keys.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No API keys configured</p>
                <p className="text-sm">Add a key to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {keys.map((key) => (
                  <div
                    key={key.keyId}
                    className="border rounded-lg p-3 flex items-start justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">
                          {key.displayName || key.keyName}
                        </p>
                        <Badge
                          variant={key.isActive ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {key.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {key.description && (
                        <p className="text-xs text-gray-600 mb-1">
                          {key.description}
                        </p>
                      )}
                      <p className="text-xs font-mono text-gray-500">
                        {key.maskedValue}
                      </p>
                      {key.usageCount !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          Used {key.usageCount} times
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteKey(key.keyId)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {showAddForm ? (
            <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="keyName" className="text-xs">
                    Key Name *
                  </Label>
                  <Input
                    id="keyName"
                    value={newKey.keyName}
                    onChange={(e) =>
                      setNewKey({ ...newKey, keyName: e.target.value })
                    }
                    placeholder="OPENAI_API_KEY"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="displayName" className="text-xs">
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    value={newKey.displayName}
                    onChange={(e) =>
                      setNewKey({ ...newKey, displayName: e.target.value })
                    }
                    placeholder="OpenAI Key"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="value" className="text-xs">
                  API Key Value *
                </Label>
                <Input
                  id="value"
                  type="password"
                  value={newKey.value}
                  onChange={(e) =>
                    setNewKey({ ...newKey, value: e.target.value })
                  }
                  placeholder="sk-..."
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div>
                <Label htmlFor="description" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={newKey.description}
                  onChange={(e) =>
                    setNewKey({ ...newKey, description: e.target.value })
                  }
                  placeholder="Optional description"
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddKey}
                  disabled={!newKey.keyName || !newKey.value || loading}
                >
                  {loading ? "Adding..." : "Add Key"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddForm(true)}
              size="sm"
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Key
            </Button>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
