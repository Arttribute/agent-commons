"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JsonSchemaEditor } from "../json-schema-editor";
import { ToolFormData } from "../create-tool-wizard";
import { Zap, FileCode, Workflow } from "lucide-react";

interface SchemaStepProps {
  data: ToolFormData;
  onChange: (updates: Partial<ToolFormData>) => void;
}

export function SchemaStep({ data, onChange }: SchemaStepProps) {
  return (
    <div className="space-y-6">
      {/* Schema Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Tool Schema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="schemaType">Schema Type</Label>
            <Select
              value={data.schemaType}
              onValueChange={(value: "auto" | "custom") =>
                onChange({ schemaType: value })
              }
            >
              <SelectTrigger id="schemaType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div>
                    <div className="font-medium">Auto-generate from API</div>
                    <div className="text-xs text-muted-foreground">
                      Create basic schema from API configuration
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="custom">
                  <div>
                    <div className="font-medium">Custom JSON Schema</div>
                    <div className="text-xs text-muted-foreground">
                      Provide your own OpenAI function schema
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {data.schemaType === "auto" && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                A basic schema will be generated from your tool name and
                description. You can edit it later if needed.
              </p>
            </div>
          )}

          {data.schemaType === "custom" && (
            <JsonSchemaEditor
              value={data.customSchema}
              onChange={(value) => onChange({ customSchema: value })}
              label="Custom Tool Schema"
              placeholder={`{
  "type": "function",
  "function": {
    "name": "${data.name || 'tool_name'}",
    "description": "${data.description || 'Tool description'}",
    "parameters": {
      "type": "object",
      "properties": {
        "param1": {
          "type": "string",
          "description": "Parameter description"
        }
      },
      "required": ["param1"]
    }
  }
}`}
              height="h-[250px]"
            />
          )}
        </CardContent>
      </Card>

      {/* Workflow Integration (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Workflow Integration (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="input" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="input">Input Schema</TabsTrigger>
              <TabsTrigger value="output">Output Schema</TabsTrigger>
            </TabsList>

            <TabsContent value="input" className="mt-4">
              <JsonSchemaEditor
                value={data.inputSchema}
                onChange={(value) => onChange({ inputSchema: value })}
                label="Input Schema for Workflows"
                placeholder={`{
  "type": "object",
  "properties": {
    "input_param": {
      "type": "string",
      "description": "Input parameter"
    }
  },
  "required": ["input_param"]
}`}
                height="h-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Define the expected input format when this tool is used in a
                workflow
              </p>
            </TabsContent>

            <TabsContent value="output" className="mt-4">
              <JsonSchemaEditor
                value={data.outputSchema}
                onChange={(value) => onChange({ outputSchema: value })}
                label="Output Schema for Workflows"
                placeholder={`{
  "type": "object",
  "properties": {
    "result": {
      "type": "string",
      "description": "Output result"
    }
  }
}`}
                height="h-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Define the output format that other workflow nodes can expect
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Rate Limiting (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Rate Limiting (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="rateLimitPerMinute">Calls per Minute</Label>
            <Input
              id="rateLimitPerMinute"
              type="number"
              min="0"
              value={data.rateLimitPerMinute || ""}
              onChange={(e) =>
                onChange({
                  rateLimitPerMinute: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                })
              }
              placeholder="Unlimited"
            />
          </div>

          <div>
            <Label htmlFor="rateLimitPerHour">Calls per Hour</Label>
            <Input
              id="rateLimitPerHour"
              type="number"
              min="0"
              value={data.rateLimitPerHour || ""}
              onChange={(e) =>
                onChange({
                  rateLimitPerHour: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                })
              }
              placeholder="Unlimited"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
