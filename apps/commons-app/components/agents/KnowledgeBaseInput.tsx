"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Upload } from "lucide-react";

interface KnowledgeBaseInputProps {
  onChange: (value: string) => void;
  value: string;
}

export default function KnowledgeBaseInput({
  onChange,
  value,
}: KnowledgeBaseInputProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      // For text files
      if (file.type === "text/plain") {
        const text = await file.text();
        onChange(text);
      }
      // For PDFs - In a real implementation you'd want to use a PDF parsing library
      else if (file.type === "application/pdf") {
        // Simulate PDF processing
        await new Promise((resolve) => setTimeout(resolve, 1000));
        onChange("PDF content would be extracted here");
      }
    } catch (error) {
      console.error("Error reading file:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Tabs defaultValue="text" className="w-full">
      <TabsList>
        <TabsTrigger value="text" className="flex gap-2">
          <FileText className="h-4 w-4" />
          Text
        </TabsTrigger>
        <TabsTrigger value="file" className="flex gap-2">
          <Upload className="h-4 w-4" />
          Upload File
        </TabsTrigger>
      </TabsList>
      <TabsContent value="text">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter or paste knowledge base content..."
          className="h-[80px]"
        />
      </TabsContent>
      <TabsContent value="file">
        <div className="flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed rounded-lg h-[80px]">
          <Button variant="outline" className="relative">
            {isUploading ? "Uploading..." : "Choose File"}
            <input
              type="file"
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              onChange={handleFileUpload}
              accept=".txt,.pdf"
              disabled={isUploading}
            />
          </Button>
          <p className="text-sm text-muted-foreground">
            Supported formats: .txt, .pdf
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
