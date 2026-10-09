"use client";

import { useState } from "react";
import { CreateMcpServerRequest } from "@/types/mcp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagsInput } from "@/components/ui/tags-input";
import { Plus, Wifi, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreateMcpServerDialogProps {
  onSubmit: (request: CreateMcpServerRequest) => Promise<void>;
  trigger?: React.ReactNode;
}

export function CreateMcpServerDialog({
  onSubmit,
  trigger,
}: CreateMcpServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionType, setConnectionType] = useState<
    "streamable-http" | "sse"
  >("streamable-http");

  const [formData, setFormData] = useState<CreateMcpServerRequest>({
    name: "",
    description: "",
    connectionType: "streamable-http",
    connectionConfig: {},
    isPublic: false,
    tags: [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSubmit({ ...formData, connectionType });
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error("Failed to create MCP server:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      connectionType: "streamable-http",
      connectionConfig: {},
      isPublic: false,
      tags: [],
    });
    setConnectionType("streamable-http");
  };

  const updateConfig = (updates: Record<string, any>) => {
    setFormData((prev) => ({
      ...prev,
      connectionConfig: { ...prev.connectionConfig, ...updates },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add MCP Server
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="bg-teal-200 w-48 h-6 -mb-6 rounded-lg"></div>
            <DialogTitle>Connect MCP Server</DialogTitle>
            <DialogDescription>
              Connect a remote MCP endpoint for Cloud tools. For a server on
              this computer, use Local connection settings.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[500px] pr-4 mt-4">
            <div className="space-y-4">
              {/* Basic Info */}
              <div>
                <Label htmlFor="name">
                  Server Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="My MCP Server"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe what this server provides..."
                  className="h-[80px]"
                />
              </div>

              {/* Connection Type */}
              <div>
                <Label>Connection Type</Label>
                <Tabs
                  value={connectionType}
                  onValueChange={(value) => {
                    setConnectionType(value as "streamable-http" | "sse");
                    setFormData((current) => ({
                      ...current,
                      connectionConfig: {
                        url: current.connectionConfig.url || "",
                        apiKey: current.connectionConfig.apiKey || "",
                      },
                    }));
                  }}
                  className="mt-2"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="streamable-http" className="gap-2">
                      <Wifi className="h-4 w-4" />
                      HTTP
                    </TabsTrigger>
                    <TabsTrigger value="sse" className="gap-2">
                      <Wifi className="h-4 w-4" />
                      SSE
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="url">
                      Server URL <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="url"
                      type="url"
                      required
                      value={formData.connectionConfig.url || ""}
                      onChange={(event) =>
                        updateConfig({ url: event.target.value })
                      }
                      placeholder={
                        connectionType === "sse"
                          ? "https://your-server.example/sse"
                          : "https://mcp.deepwiki.com/mcp"
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use the endpoint supplied by your MCP provider. Cloud
                      connections cannot start programs on your computer.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="mcp-token">Access token (optional)</Label>
                    <Input
                      id="mcp-token"
                      type="password"
                      autoComplete="off"
                      value={formData.connectionConfig.apiKey || ""}
                      onChange={(event) =>
                        updateConfig({ apiKey: event.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      For providers that supply a bearer token. Use the
                      provider's Connect option when it supports sign-in.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label>Tags</Label>
                <TagsInput
                  value={formData.tags || []}
                  onChange={(tags) => setFormData({ ...formData, tags })}
                  placeholder="Add tags..."
                />
              </div>

              {/* Public Switch */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label htmlFor="isPublic" className="text-base font-medium">
                    Share in Marketplace
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Make this server discoverable by other users
                  </p>
                </div>
                <Switch
                  id="isPublic"
                  checked={formData.isPublic}
                  onCheckedChange={(isPublic) =>
                    setFormData({ ...formData, isPublic })
                  }
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connect & Discover Tools
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
