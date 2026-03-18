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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KeyValueEditor } from "@/components/tools/key-value-editor";
import { TagsInput } from "@/components/ui/tags-input";
import { Plus, Terminal, Wifi, Loader2 } from "lucide-react";
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
  const [connectionType, setConnectionType] = useState<"stdio" | "sse">("stdio");

  const [formData, setFormData] = useState<CreateMcpServerRequest>({
    name: "",
    description: "",
    connectionType: "stdio",
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
      connectionType: "stdio",
      connectionConfig: {},
      isPublic: false,
      tags: [],
    });
    setConnectionType("stdio");
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
              Configure a Model Context Protocol server to integrate external tools
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
                  onValueChange={(v) => setConnectionType(v as "stdio" | "sse")}
                  className="mt-2"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="stdio" className="gap-2">
                      <Terminal className="h-4 w-4" />
                      stdio
                    </TabsTrigger>
                    <TabsTrigger value="sse" className="gap-2">
                      <Wifi className="h-4 w-4" />
                      SSE
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="stdio" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="command">
                        Command <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="command"
                        value={formData.connectionConfig.command || ""}
                        onChange={(e) =>
                          updateConfig({ command: e.target.value })
                        }
                        placeholder="npx"
                        required={connectionType === "stdio"}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        The command to execute (e.g., &quot;npx&quot;, &quot;node&quot;, &quot;python&quot;)
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="args">Arguments</Label>
                      <Textarea
                        id="args"
                        value={
                          formData.connectionConfig.args?.join("\n") || ""
                        }
                        onChange={(e) =>
                          updateConfig({
                            args: e.target.value
                              .split("\n")
                              .filter((a) => a.trim()),
                          })
                        }
                        placeholder={`-y\n@modelcontextprotocol/server-github`}
                        className="h-[80px] font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        One argument per line
                      </p>
                    </div>

                    <div>
                      <Label>Environment Variables</Label>
                      <KeyValueEditor
                        value={formData.connectionConfig.env || {}}
                        onChange={(env) => updateConfig({ env })}
                        keyPlaceholder="VAR_NAME"
                        valuePlaceholder="value"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="sse" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="url">
                        Server URL <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="url"
                        type="url"
                        value={formData.connectionConfig.url || ""}
                        onChange={(e) => updateConfig({ url: e.target.value })}
                        placeholder="http://localhost:3000/sse"
                        required={connectionType === "sse"}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        The SSE endpoint URL for the MCP server
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
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
