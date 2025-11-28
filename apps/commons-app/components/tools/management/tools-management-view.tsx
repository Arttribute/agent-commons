"use client";

import { useEffect, useState } from "react";
import { Tool } from "@/types/tool";
import { ToolListItem } from "@/components/tools/management/tool-list-item";
import { EditToolDialog } from "@/components/tools/management/edit-tool-dialog";
import { ManageKeysDialog } from "@/components/tools/management/manage-keys-dialog";
import { ManagePermissionsDialog } from "@/components/tools/management/manage-permissions-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Plus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type ViewFilter = "all" | "private" | "public" | "platform";

interface ToolsManagementViewProps {
  userAddress: string;
}

export function ToolsManagementView({ userAddress }: ToolsManagementViewProps) {
  const router = useRouter();
  const [tools, setTools] = useState<Tool[]>([]);
  const [filteredTools, setFilteredTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  // Dialog states
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [keysTool, setKeysTool] = useState<Tool | null>(null);
  const [permissionsTool, setPermissionsTool] = useState<Tool | null>(null);
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null);

  useEffect(() => {
    if (userAddress) {
      loadTools();
    }
  }, [userAddress]);

  useEffect(() => {
    filterTools();
  }, [tools, searchQuery, viewFilter]);

  const loadTools = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userAddress) {
        params.append("owner", userAddress);
        params.append("ownerType", "user");
      }

      const res = await fetch(`/api/tools?${params}`);
      const data = await res.json();
      if (data.data) {
        setTools(data.data);
      }
    } catch (error) {
      console.error("Failed to load tools:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterTools = () => {
    let filtered = [...tools];

    if (viewFilter !== "all") {
      filtered = filtered.filter((tool) => tool.visibility === viewFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) ||
          tool.displayName?.toLowerCase().includes(query) ||
          tool.description?.toLowerCase().includes(query) ||
          tool.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    setFilteredTools(filtered);
  };

  const handleSaveTool = async (updates: Partial<Tool>) => {
    if (!editTool) return;

    try {
      const res = await fetch(`/api/tools/${editTool.name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        await loadTools();
        setEditTool(null);
      }
    } catch (error) {
      console.error("Failed to update tool:", error);
      throw error;
    }
  };

  const handleDeleteTool = async () => {
    if (!deleteTool) return;

    try {
      const res = await fetch(`/api/tools/${deleteTool.name}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadTools();
        setDeleteTool(null);
      }
    } catch (error) {
      console.error("Failed to delete tool:", error);
    }
  };

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs
          value={viewFilter}
          onValueChange={(v) => setViewFilter(v as ViewFilter)}
          className="border border-gray-400 rounded-md bg-gray-200"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="private">Private</TabsTrigger>
            <TabsTrigger value="public">Public</TabsTrigger>
            <TabsTrigger value="platform">Platform</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tools Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredTools.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {searchQuery || viewFilter !== "all"
              ? "No tools found matching your filters"
              : "No tools yet"}
          </p>
          {!searchQuery && viewFilter === "all" && (
            <Button onClick={() => router.push("/tools/create")}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Tool
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map((tool) => (
            <ToolListItem
              key={tool.toolId}
              tool={tool}
              onEdit={setEditTool}
              onDelete={setDeleteTool}
              onManageKeys={setKeysTool}
              onManagePermissions={setPermissionsTool}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <EditToolDialog
        tool={editTool}
        open={!!editTool}
        onClose={() => setEditTool(null)}
        onSave={handleSaveTool}
      />

      <ManageKeysDialog
        tool={keysTool}
        ownerId={userAddress}
        open={!!keysTool}
        onClose={() => setKeysTool(null)}
      />

      <ManagePermissionsDialog
        tool={permissionsTool}
        currentUserId={userAddress}
        open={!!permissionsTool}
        onClose={() => setPermissionsTool(null)}
      />

      <AlertDialog open={!!deleteTool} onOpenChange={() => setDeleteTool(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              {deleteTool?.displayName || deleteTool?.name}"? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTool}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
