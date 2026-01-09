"use client";

import { useState } from "react";
import {
  Wrench,
  Box,
  Database,
  MessageSquare,
  Brain,
  Globe,
  Code,
  Image,
  FileText,
  Calendar,
  Mail,
  Search,
  Zap,
  Settings,
  Link,
  Package,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ICON_OPTIONS = [
  { name: "Wrench", Icon: Wrench },
  { name: "Box", Icon: Box },
  { name: "Database", Icon: Database },
  { name: "MessageSquare", Icon: MessageSquare },
  { name: "Brain", Icon: Brain },
  { name: "Globe", Icon: Globe },
  { name: "Code", Icon: Code },
  { name: "Image", Icon: Image },
  { name: "FileText", Icon: FileText },
  { name: "Calendar", Icon: Calendar },
  { name: "Mail", Icon: Mail },
  { name: "Search", Icon: Search },
  { name: "Zap", Icon: Zap },
  { name: "Settings", Icon: Settings },
  { name: "Link", Icon: Link },
  { name: "Package", Icon: Package },
];

interface CategoryIconSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CategoryIconSelector({
  value,
  onChange,
  className,
}: CategoryIconSelectorProps) {
  const [customUrl, setCustomUrl] = useState(
    value && !ICON_OPTIONS.find((opt) => opt.name === value) ? value : ""
  );

  const selectedIconName = ICON_OPTIONS.find((opt) => opt.name === value)
    ? value
    : customUrl
    ? "custom"
    : "";

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Icon</Label>
      <Tabs defaultValue="preset" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="preset">Preset Icons</TabsTrigger>
          <TabsTrigger value="custom">Custom URL</TabsTrigger>
        </TabsList>

        <TabsContent value="preset" className="space-y-2">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {ICON_OPTIONS.map(({ name, Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setCustomUrl("");
                }}
                className={cn(
                  "flex items-center justify-center p-3 border rounded-md hover:bg-accent transition-colors",
                  value === name && "border-primary bg-primary/10"
                )}
                title={name}
              >
                <Icon className="h-5 w-5" />
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="custom" className="space-y-2">
          <Input
            value={customUrl}
            onChange={(e) => {
              setCustomUrl(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="https://example.com/icon.png"
          />
          {customUrl && (
            <div className="p-4 border rounded-md flex items-center justify-center bg-muted">
              <img
                src={customUrl}
                alt="Custom icon"
                className="h-12 w-12 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
