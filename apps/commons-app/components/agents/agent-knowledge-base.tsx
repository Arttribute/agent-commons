"use client";

import type React from "react";

import { useState } from "react";
import {
  Book,
  FileText,
  Upload,
  X,
  Plus,
  Info,
  Trash2,
  FileIcon,
} from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type KnowledgebaseEntry = {
  id: string;
  title: string;
  content: string;
  type: "pdf" | "text" | "manual";
  comments: string;
  fileName?: string;
  createdAt: Date;
};

export function AgentKnowledgebase() {
  const [knowledgebase, setKnowledgebase] = useState<KnowledgebaseEntry[]>([]);
  const [title, setTitle] = useState("");
  const [comments, setComments] = useState("");
  const [textContent, setTextContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "text">("upload");
  const [selectedEntry, setSelectedEntry] = useState<KnowledgebaseEntry | null>(
    null
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleAddEntry = () => {
    if (!title) return;

    if (activeTab === "upload") {
      if (!selectedFile) return;

      const newEntry: KnowledgebaseEntry = {
        id: Date.now().toString(),
        title,
        content: `File: ${selectedFile.name}`,
        type: selectedFile.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text",
        comments,
        fileName: selectedFile.name,
        createdAt: new Date(),
      };

      setKnowledgebase([...knowledgebase, newEntry]);
    } else {
      if (!textContent) return;

      const newEntry: KnowledgebaseEntry = {
        id: Date.now().toString(),
        title,
        content: textContent,
        type: "manual",
        comments,
        createdAt: new Date(),
      };

      setKnowledgebase([...knowledgebase, newEntry]);
    }

    resetForm();
  };

  const resetForm = () => {
    setTitle("");
    setComments("");
    setTextContent("");
    setSelectedFile(null);
  };

  const removeEntry = (id: string) => {
    setKnowledgebase(knowledgebase.filter((entry) => entry.id !== id));
    if (selectedEntry?.id === id) {
      setDetailsOpen(false);
      setSelectedEntry(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const viewEntryDetails = (entry: KnowledgebaseEntry) => {
    setSelectedEntry(entry);
    setDetailsOpen(true);
  };

  const getTypeIcon = (type: KnowledgebaseEntry["type"]) => {
    switch (type) {
      case "pdf":
        return <FileText className="h-4 w-4" />;
      case "text":
        return <FileText className="h-4 w-4" />;
      case "manual":
        return <Book className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: KnowledgebaseEntry["type"]) => {
    switch (type) {
      case "pdf":
        return "PDF Document";
      case "text":
        return "Text File";
      case "manual":
        return "Manual Entry";
    }
  };

  const isAddButtonDisabled = () => {
    if (!title) return true;
    if (activeTab === "upload" && !selectedFile) return true;
    if (activeTab === "text" && !textContent) return true;
    return false;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className="flex flex-col cursor-pointer border border-gray-400 rounded-xl p-3 hover:border-gray-700 transition-colors relative group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Book className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Knowledgebase</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {knowledgebase.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {knowledgebase.map((entry) => (
                  <Badge key={entry.id} variant="secondary">
                    {entry.title}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                <Info className="h-4 w-4" />
                <span>No knowledgebase entries. Click to add.</span>
              </div>
            )}
          </div>
        </DialogTrigger>

        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Knowledgebase</DialogTitle>
            <DialogDescription>
              Add and manage knowledgebase entries for your agent.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {/* Existing Knowledgebase Entries */}
            <div className={cn("mb-6", knowledgebase.length === 0 && "hidden")}>
              <h3 className="text-sm font-medium mb-2">
                Existing Knowledgebase
              </h3>
              <div className="flex flex-wrap gap-2">
                {knowledgebase.map((entry) => (
                  <div key={entry.id} className="relative group">
                    <Badge
                      variant="secondary"
                      className="pr-7 cursor-pointer flex items-center gap-1.5"
                      onClick={() => viewEntryDetails(entry)}
                    >
                      {getTypeIcon(entry.type)}
                      {entry.title}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0 absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEntry(entry.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Knowledgebase Entry */}
            <Tabs
              defaultValue="upload"
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as "upload" | "text")
              }
              className="flex-1"
            >
              <TabsList className="grid grid-cols-2 mb-4 w-96">
                <TabsTrigger value="upload">Upload File</TabsTrigger>
                <TabsTrigger value="text">Add Text</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title-upload">Title</Label>
                  <Input
                    id="title-upload"
                    placeholder="E.g., Product Documentation"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="file-upload">Upload PDF or Text File</Label>
                  <div className="border rounded-md p-4 flex flex-col items-center justify-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <p className="text-sm font-medium">
                        {selectedFile
                          ? selectedFile.name
                          : "Drag and drop or click to upload"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supports PDF and TXT files
                      </p>
                    </div>
                    <Input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.txt"
                      onChange={handleFileChange}
                    />
                    <Button
                      variant="secondary"
                      onClick={() =>
                        document.getElementById("file-upload")?.click()
                      }
                      className="mt-2"
                    >
                      Select File
                    </Button>
                    {selectedFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => setSelectedFile(null)}
                      >
                        <X className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="comments-upload">
                    Usage Comments (Optional)
                  </Label>
                  <Textarea
                    id="comments-upload"
                    placeholder="When should the agent use this knowledge? E.g., 'Use for technical questions about our API'"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="text" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title-text">Title</Label>
                  <Input
                    id="title-text"
                    placeholder="E.g., Company Policies"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="content-text">Content</Label>
                  <Textarea
                    id="content-text"
                    placeholder="Enter the knowledge content here..."
                    className="min-h-[150px]"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="comments-text">
                    Usage Comments (Optional)
                  </Label>
                  <Textarea
                    id="comments-text"
                    placeholder="When should the agent use this knowledge? E.g., 'Use for questions about company policies'"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => resetForm()}>
              Cancel
            </Button>
            <Button onClick={handleAddEntry} disabled={isAddButtonDisabled()}>
              Add to Knowledgebase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedEntry && getTypeIcon(selectedEntry.type)}
              {selectedEntry?.title}
            </SheetTitle>
            <SheetDescription>
              {selectedEntry && getTypeLabel(selectedEntry.type)}
              {selectedEntry?.fileName && (
                <div className="flex items-center gap-1.5 mt-1 text-xs">
                  <FileIcon className="h-3 w-3" />
                  <span>{selectedEntry.fileName}</span>
                </div>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {selectedEntry?.comments && (
              <div>
                <h4 className="text-sm font-medium mb-1">Usage Comments</h4>
                <div className="text-sm bg-muted/50 p-3 rounded-md">
                  {selectedEntry.comments}
                </div>
              </div>
            )}

            {selectedEntry?.type === "manual" && (
              <div>
                <h4 className="text-sm font-medium mb-1">Content</h4>
                <ScrollArea className="h-[200px] border rounded-md p-3">
                  <div className="text-sm whitespace-pre-wrap">
                    {selectedEntry.content}
                  </div>
                </ScrollArea>
              </div>
            )}

            {(selectedEntry?.type === "pdf" ||
              selectedEntry?.type === "text") && (
              <div>
                <h4 className="text-sm font-medium mb-1">File Content</h4>
                <div className="bg-muted/50 p-3 rounded-md text-sm">
                  <p>File content will be processed when used by the agent.</p>
                </div>
              </div>
            )}

            <div className="pt-2 text-xs text-muted-foreground">
              Added: {selectedEntry?.createdAt.toLocaleDateString()}
            </div>

            <div className="flex justify-end pt-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => selectedEntry && removeEntry(selectedEntry.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove Entry
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
