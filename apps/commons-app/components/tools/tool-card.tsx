"use client";

import type React from "react";
import { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCopy,
  Code,
  FileJson,
  GitBranch,
  Info,
  Plus,
  Star,
  Tag,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Tool interface
export interface Tool {
  id: string;
  name: string;
  description: string;
  detailedDescription?: string;
  isLoaded?: boolean;
  requiresPermission?: boolean;
  owner?: string;
  creator?: string;
  createdAt?: string;
  version?: string;
  category?: string;
  tags?: string[];
  usageExamples?: string[];
  schema?: string;
  rating?: number;
  rawSchema?: string;
  ownedByUser?: boolean;
}

interface ToolCardProps {
  tool: Tool;
  isLoaded: boolean;
  onToggle: (e: React.MouseEvent) => void;
  toolType: "common" | "external" | "my";
}

export function ToolCard({
  tool,
  isLoaded,
  onToggle,
  toolType,
}: ToolCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Format JSON for better display
  const formatJSON = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // If it's not valid JSON, try to format it as best as possible
      return jsonString.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  };

  return (
    <>
      <Card
        className={`border ${
          isLoaded ? "border-primary/50 bg-primary/5" : ""
        } cursor-pointer hover:border-primary/30 transition-colors `}
        onClick={() => setDetailsOpen(true)}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {tool.name}
                  {tool.requiresPermission && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Requires permission from {tool.owner}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {tool.ownedByUser && (
                    <Badge
                      variant="outline"
                      className="text-xs border-blue-500 text-blue-500"
                    >
                      My Tool
                    </Badge>
                  )}
                </CardTitle>
                {tool.rating && (
                  <div className="flex items-center gap-1 ml-2">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs">{tool.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <CardDescription className="text-xs mt-1">
                {tool.description}
              </CardDescription>
              {tool.tags && tool.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tool.tags.slice(0, 2).map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="text-xs px-1 py-0 h-4"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {tool.tags.length > 2 && (
                    <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                      +{tool.tags.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardFooter className="p-4 pt-0 flex justify-between items-center">
          {isLoaded ? (
            <div className="flex items-center text-xs text-primary">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Loaded and ready to use
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Not loaded</div>
          )}
          <Button
            variant={isLoaded ? "outline" : "default"}
            size="sm"
            className="h-8 ml-2"
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click
              onToggle(e);
            }}
          >
            {isLoaded ? (
              <>
                <X className="h-4 w-4 mr-1" /> Unload
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Load
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Tool Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[750px] h-[80vh] flex flex-col">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                {tool.name}
                {tool.requiresPermission && (
                  <Badge
                    variant="outline"
                    className="text-amber-500 border-amber-500"
                  >
                    Requires Permission
                  </Badge>
                )}
                {tool.ownedByUser && (
                  <Badge
                    variant="outline"
                    className="text-blue-500 border-blue-500"
                  >
                    My Tool
                  </Badge>
                )}
              </DialogTitle>
              {tool.rating && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">
                    {tool.rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
            <DialogDescription className="mt-1">
              {tool.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full w-full pr-4">
              <div className="flex flex-col gap-6 pb-4">
                {/* Detailed Description */}
                {tool.detailedDescription && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      Detailed Description
                    </h3>
                    <p className="text-sm">{tool.detailedDescription}</p>
                  </div>
                )}

                {/* Tool Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Creator */}
                  {tool.creator && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Creator
                      </h4>
                      <p className="text-sm flex items-center">
                        {tool.creator}
                        {tool.ownedByUser && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-xs border-blue-500 text-blue-500"
                          >
                            You
                          </Badge>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Owner */}
                  {tool.owner && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Owner
                      </h4>
                      <p className="text-sm">{tool.owner}</p>
                    </div>
                  )}

                  {/* Created Date */}
                  {tool.createdAt && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created
                      </h4>
                      <p className="text-sm">{tool.createdAt}</p>
                    </div>
                  )}

                  {/* Version */}
                  {tool.version && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        Version
                      </h4>
                      <p className="text-sm">{tool.version}</p>
                    </div>
                  )}

                  {/* Category */}
                  {tool.category && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Category
                      </h4>
                      <p className="text-sm">{tool.category}</p>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {tool.tags && tool.tags.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {tool.tags.map((tag, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Usage Examples */}
                {tool.usageExamples && tool.usageExamples.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Code className="h-4 w-4 text-muted-foreground" />
                      Usage Examples
                    </h3>
                    <ul className="space-y-1 list-disc list-inside text-sm">
                      {tool.usageExamples.map((example, index) => (
                        <li key={index}>{example}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tool Schema */}
                {tool.schema && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-muted-foreground" />
                      Tool Schema (Inner Definition)
                    </h3>
                    <div className="border rounded-md bg-muted/50 overflow-hidden relative group">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          if (tool.schema) {
                            navigator.clipboard.writeText(tool.schema);
                          }
                        }}
                      >
                        <ClipboardCopy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <pre className="p-4 text-xs font-mono overflow-x-auto">
                        <code className="text-foreground">
                          {formatJSON(tool.schema)}
                        </code>
                      </pre>
                    </div>
                  </div>
                )}

                {/* Raw Tool Schema */}
                {tool.rawSchema && (
                  <div className="space-y-2 mt-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-muted-foreground" />
                      Complete Tool Schema
                    </h3>
                    <div className="border rounded-md bg-slate-900 text-white overflow-hidden relative group">
                      <div className="flex items-center justify-between bg-slate-800 px-4 py-2 border-b border-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-red-500"></span>
                          <span className="h-3 w-3 rounded-full bg-yellow-500"></span>
                          <span className="h-3 w-3 rounded-full bg-green-500"></span>
                        </div>
                        <span className="text-xs text-slate-400">
                          tool-schema.json
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-slate-300 hover:text-white hover:bg-slate-700"
                          onClick={() => {
                            if (tool.rawSchema) {
                              navigator.clipboard.writeText(tool.rawSchema);
                            }
                          }}
                        >
                          <ClipboardCopy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <ScrollArea className="h-[250px] w-full">
                        <pre className="p-4 text-xs font-mono">
                          <code>{formatJSON(tool.rawSchema)}</code>
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator className="my-4" />

          <div className="flex justify-between items-center">
            <div className="flex items-center text-sm">
              <Info className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-muted-foreground">
                {isLoaded
                  ? "This tool is currently loaded"
                  : "This tool is not loaded"}
              </span>
            </div>
            <Button
              variant={isLoaded ? "outline" : "default"}
              onClick={(e) => {
                onToggle(e);
                setDetailsOpen(false);
              }}
            >
              {isLoaded ? (
                <>
                  <X className="h-4 w-4 mr-1" /> Unload Tool
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" /> Load Tool
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
