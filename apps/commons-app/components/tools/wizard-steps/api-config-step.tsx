"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ApiSpecBuilder } from "../api-spec-builder";
import { ToolFormData } from "../create-tool-wizard";
import { Info } from "lucide-react";

interface ApiConfigStepProps {
  data: ToolFormData;
  onChange: (updates: Partial<ToolFormData>) => void;
}

export function ApiConfigStep({ data, onChange }: ApiConfigStepProps) {
  const hasApiSpec = !!data.apiSpec;

  const toggleApiSpec = (enabled: boolean) => {
    if (enabled) {
      onChange({
        apiSpec: {
          baseUrl: "",
          path: "",
          method: "GET",
          authType: "none",
        },
      });
    } else {
      onChange({ apiSpec: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-xl">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-purple-900 mb-1">
              API Configuration (Optional)
            </h3>
            <p className="text-sm text-purple-700">
              If your tool calls an external API, configure the endpoint and
              authentication here. Skip this step if you're creating a
              code-based tool or using custom logic.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <Label htmlFor="enable-api" className="text-base font-medium">
            Enable API Configuration
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Configure this tool to call an external API
          </p>
        </div>
        <Switch
          id="enable-api"
          checked={hasApiSpec}
          onCheckedChange={toggleApiSpec}
        />
      </div>

      {hasApiSpec && data.apiSpec && (
        <ApiSpecBuilder
          value={data.apiSpec}
          onChange={(apiSpec) => onChange({ apiSpec })}
        />
      )}

      {!hasApiSpec && (
        <div className="text-center py-12 text-muted-foreground">
          <p>API configuration is disabled</p>
          <p className="text-sm mt-1">
            Enable it above to configure external API calls
          </p>
        </div>
      )}
    </div>
  );
}
