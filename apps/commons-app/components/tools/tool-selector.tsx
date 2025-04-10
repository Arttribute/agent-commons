"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Tool {
  id: string;
  name: string;
}

interface ToolSelectorProps {
  /**
   * Called when an existing tool is selected from the list
   * (we pass the entire object: { id, name })
   */
  onToolSelect: (tool: Tool) => void;

  /**
   * Called when custom JSON is submitted
   */
  onCustomToolAdd: (toolJson: string) => void;

  /**
   * Array of currently selected tool IDs (so we can show "Selected" badges)
   */
  selectedTools: string[];

  /**
   * "common" => fetch from resource table (resource_type = "tool")
   * "external" => fetch from tool table (owner=??)
   */
  type: "common" | "external";

  /**
   * The user’s wallet address, required if type="external"
   */
  owner?: string;
}

export default function ToolSelector({
  onToolSelect,
  onCustomToolAdd,
  selectedTools,
  type,
  owner = "",
}: ToolSelectorProps) {
  const [tools, setTools] = useState<Tool[]>([]); // fetched from DB
  const [search, setSearch] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Fetch tools from our API endpoint
  useEffect(() => {
    // Build query: ?type=common or ?type=external
    // For external, we add &owner=walletAddress
    const params = new URLSearchParams({ type });
    if (type === "external" && owner) {
      params.set("owner", owner);
    }

    const fetchTools = async () => {
      try {
        const res = await fetch(`/api/tools/available?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Failed to fetch tools");
        }
        const data = await res.json(); // array of { id, name }
        setTools(data);
      } catch (err) {
        console.error(err);
      }
    };

    fetchTools();
  }, [type, owner]);

  // Filter tools by search text
  const filteredTools = tools.filter((tool) =>
    tool.name.toLowerCase().includes(search.toLowerCase())
  );

  // Handle user’s custom JSON submission
  const handleCustomJsonSubmit = () => {
    try {
      JSON.parse(customJson); // verify valid JSON
      onCustomToolAdd(customJson);
      setCustomJson("");
      setJsonError(null);
    } catch (error) {
      setJsonError("Invalid JSON. Please check your input.");
      console.error("Invalid JSON:", error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add {type === "common" ? "Common" : "External"} Tool
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Add {type === "common" ? "Common" : "External"} Tool
          </DialogTitle>
          <DialogDescription>
            Choose from available tools or add a custom tool.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="existing" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Existing Tools</TabsTrigger>
            <TabsTrigger value="custom">Custom Tool</TabsTrigger>
          </TabsList>

          {/* EXISTING TOOLS TAB */}
          <TabsContent value="existing">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {filteredTools.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No tools found.
                    </p>
                  )}
                  {filteredTools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted cursor-pointer"
                      onClick={() => onToolSelect(tool)}
                    >
                      <div>
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {type === "common"
                            ? "A shared 'common' tool"
                            : "A user-owned 'external' tool"}
                        </div>
                      </div>
                      {selectedTools.includes(tool.id) && (
                        <Badge variant="secondary">Selected</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* CUSTOM TOOLS TAB */}
          <TabsContent value="custom">
            <div className="space-y-4">
              <div className="grid w-full gap-1.5">
                <Label htmlFor="custom-json">Custom Tool JSON</Label>
                <Textarea
                  id="custom-json"
                  placeholder="Paste your custom tool JSON here..."
                  value={customJson}
                  onChange={(e) => setCustomJson(e.target.value)}
                  className="h-[200px]"
                />
                {jsonError && (
                  <p className="text-sm text-red-500">{jsonError}</p>
                )}
              </div>
              <Button onClick={handleCustomJsonSubmit} className="w-full">
                Add Custom Tool
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
