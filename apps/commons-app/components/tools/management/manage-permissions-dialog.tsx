"use client";

import { useState, useEffect } from "react";
import { Tool, AccessListEntry } from "@/types/tool";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, User, Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ManagePermissionsDialogProps {
  tool: Tool | null;
  currentUserId: string;
  open: boolean;
  onClose: () => void;
}

export function ManagePermissionsDialog({
  tool,
  currentUserId,
  open,
  onClose,
}: ManagePermissionsDialogProps) {
  const [permissions, setPermissions] = useState<AccessListEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newAccess, setNewAccess] = useState({
    walletAddress: "",
    type: "user" as "user" | "agent",
    permission: "execute" as "read" | "execute" | "admin",
  });

  useEffect(() => {
    if (open && tool) {
      loadPermissions();
    }
  }, [open, tool]);

  const loadPermissions = async () => {
    if (!tool) return;
    try {
      const res = await fetch(`/api/tool-permissions?toolId=${tool.toolId}`);
      const data = await res.json();
      if (data.success) {
        setPermissions(
          data.data.map((p: any) => ({
            id: p.id,
            walletAddress: p.subjectId,
            type: p.subjectType,
            permission: p.permission,
            grantedAt: p.createdAt,
            expiresAt: p.expiresAt,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load permissions:", error);
    }
  };

  const handleGrantAccess = async () => {
    if (!tool) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tool-permissions/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId: tool.toolId,
          subjectId: newAccess.walletAddress,
          subjectType: newAccess.type,
          permission: newAccess.permission,
          grantedBy: currentUserId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await loadPermissions();
        setShowAddForm(false);
        setNewAccess({
          walletAddress: "",
          type: "user",
          permission: "execute",
        });
      }
    } catch (error) {
      console.error("Failed to grant access:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAccess = async (permissionId: string) => {
    try {
      const res = await fetch(`/api/tool-permissions/revoke/${permissionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadPermissions();
      }
    } catch (error) {
      console.error("Failed to revoke access:", error);
    }
  };

  const permissionColors = {
    read: "bg-blue-200 text-blue-700",
    execute: "bg-green-200 text-green-700",
    admin: "bg-purple-200 text-purple-700",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Permissions</DialogTitle>
          <DialogDescription>
            Control who can access {tool?.displayName || tool?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ScrollArea className="h-[400px] pr-4">
            {permissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No permissions configured</p>
                <p className="text-sm">This tool is only accessible to you</p>
              </div>
            ) : (
              <div className="space-y-2">
                {permissions.map((access) => (
                  <div
                    key={access.id}
                    className="border rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded">
                        {access.type === "user" ? (
                          <User className="h-4 w-4 text-gray-600" />
                        ) : (
                          <Bot className="h-4 w-4 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-mono text-sm">
                          {access.walletAddress}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {access.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-xs ${permissionColors[access.permission]}`}
                      >
                        {access.permission}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeAccess(access.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {showAddForm ? (
            <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <div>
                <Label htmlFor="walletAddress" className="text-xs">
                  Wallet Address *
                </Label>
                <Input
                  id="walletAddress"
                  value={newAccess.walletAddress}
                  onChange={(e) =>
                    setNewAccess({
                      ...newAccess,
                      walletAddress: e.target.value,
                    })
                  }
                  placeholder="0x..."
                  className="h-8 text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  User or agent wallet address
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="type" className="text-xs">
                    Type
                  </Label>
                  <Select
                    value={newAccess.type}
                    onValueChange={(value: "user" | "agent") =>
                      setNewAccess({ ...newAccess, type: value })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="permission" className="text-xs">
                    Permission Level
                  </Label>
                  <Select
                    value={newAccess.permission}
                    onValueChange={(value: "read" | "execute" | "admin") =>
                      setNewAccess({ ...newAccess, permission: value })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Read</SelectItem>
                      <SelectItem value="execute">Execute</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  onClick={handleGrantAccess}
                  disabled={!newAccess.walletAddress || loading}
                >
                  {loading ? "Granting..." : "Grant Access"}
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
              Grant Access
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
