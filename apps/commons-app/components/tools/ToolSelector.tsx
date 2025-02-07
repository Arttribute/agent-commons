"use client";

import { useState } from "react";
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
  type: "common" | "external";
}

// Mock data - replace with actual tool data
const mockTools: Tool[] = [
  { id: "1", name: "Web Search", type: "common" },
  { id: "2", name: "Image Analysis", type: "common" },
  { id: "3", name: "Text Translation", type: "external" },
];

interface ToolSelectorProps {
  onToolSelect: (toolId: string) => void;
  onCustomToolAdd: (toolJson: string) => void;
  selectedTools: string[];
  type: "common" | "external";
}

export default function ToolSelector({
  onToolSelect,
  onCustomToolAdd,
  selectedTools,
  type,
}: ToolSelectorProps) {
  const [search, setSearch] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const filteredTools = mockTools.filter(
    (tool) =>
      tool.type === type &&
      tool.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCustomJsonSubmit = () => {
    try {
      JSON.parse(customJson);
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
                  {filteredTools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted cursor-pointer"
                      onClick={() => onToolSelect(tool.id)}
                    >
                      <div>
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Tool description here
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
