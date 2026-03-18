"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { CategoryIconSelector } from "../category-icon-selector";
import { ToolFormData } from "../create-tool-wizard";

interface BasicInfoStepProps {
  data: ToolFormData;
  onChange: (updates: Partial<ToolFormData>) => void;
}

export function BasicInfoStep({ data, onChange }: BasicInfoStepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">
            Tool Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="my_awesome_tool"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Unique identifier (lowercase, underscores only)
          </p>
        </div>

        <div>
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={data.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="My Awesome Tool"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Human-readable name shown in the UI
          </p>
        </div>

        <div>
          <Label htmlFor="description">
            Description <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Describe what this tool does..."
            className="h-[100px]"
          />
        </div>

        <div>
          <Label htmlFor="category">Category</Label>
          <Select
            value={data.category}
            onValueChange={(value) => onChange({ category: value })}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="communication">Communication</SelectItem>
              <SelectItem value="data">Data</SelectItem>
              <SelectItem value="ai">AI</SelectItem>
              <SelectItem value="blockchain">Blockchain</SelectItem>
              <SelectItem value="automation">Automation</SelectItem>
              <SelectItem value="productivity">Productivity</SelectItem>
              <SelectItem value="analytics">Analytics</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="visibility">Visibility</Label>
          <Select
            value={data.visibility}
            onValueChange={(value: "private" | "public" | "platform") =>
              onChange({ visibility: value })
            }
          >
            <SelectTrigger id="visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">
                <div>
                  <div className="font-medium">Private</div>
                  <div className="text-xs text-muted-foreground">
                    Only you and authorized users
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="public">
                <div>
                  <div className="font-medium">Public</div>
                  <div className="text-xs text-muted-foreground">
                    Anyone can discover and use
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="platform">
                <div>
                  <div className="font-medium">Platform</div>
                  <div className="text-xs text-muted-foreground">
                    System-wide built-in tool
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <CategoryIconSelector
          value={data.icon}
          onChange={(value) => onChange({ icon: value })}
        />

        <div>
          <Label>Tags</Label>
          <TagsInput
            value={data.tags}
            onChange={(value) => onChange({ tags: value })}
            placeholder="Add tags..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter or comma to add tags
          </p>
        </div>

        <div>
          <Label htmlFor="version">Version</Label>
          <Input
            id="version"
            value={data.version}
            onChange={(e) => onChange({ version: e.target.value })}
            placeholder="1.0.0"
          />
        </div>
      </div>
    </div>
  );
}
