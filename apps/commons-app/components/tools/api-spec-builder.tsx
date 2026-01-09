"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KeyValueEditor } from "./key-value-editor";
import { TagsInput } from "@/components/ui/tags-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ApiSpec {
  baseUrl: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: any;
  authType?: "none" | "bearer" | "api-key" | "basic" | "oauth2";
  authKeyName?: string;
  oauthProviderKey?: string;
  oauthScopes?: string[];
  oauthTokenLocation?: "header" | "query" | "body";
  oauthTokenKey?: string;
  oauthTokenPrefix?: string;
}

interface ApiSpecBuilderProps {
  value: Partial<ApiSpec>;
  onChange: (value: Partial<ApiSpec>) => void;
  className?: string;
}

export function ApiSpecBuilder({
  value,
  onChange,
  className,
}: ApiSpecBuilderProps) {
  const updateField = <K extends keyof ApiSpec>(field: K, val: ApiSpec[K]) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* API Endpoint Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={value.baseUrl || ""}
              onChange={(e) => updateField("baseUrl", e.target.value)}
              placeholder="https://api.example.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="path">Path</Label>
              <Input
                id="path"
                value={value.path || ""}
                onChange={(e) => updateField("path", e.target.value)}
                placeholder="/v1/endpoint"
              />
            </div>

            <div>
              <Label htmlFor="method">Method</Label>
              <Select
                value={value.method || "GET"}
                onValueChange={(val) =>
                  updateField("method", val as ApiSpec["method"])
                }
              >
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Headers</Label>
            <KeyValueEditor
              value={value.headers || {}}
              onChange={(val) => updateField("headers", val)}
              keyPlaceholder="Header name"
              valuePlaceholder="Header value"
            />
          </div>

          <div>
            <Label>Query Parameters</Label>
            <KeyValueEditor
              value={value.queryParams || {}}
              onChange={(val) => updateField("queryParams", val)}
              keyPlaceholder="Parameter name"
              valuePlaceholder="Parameter value"
            />
          </div>

          {(value.method === "POST" ||
            value.method === "PUT" ||
            value.method === "PATCH") && (
            <div>
              <Label htmlFor="bodyTemplate">Body Template (JSON)</Label>
              <Textarea
                id="bodyTemplate"
                value={
                  value.bodyTemplate
                    ? JSON.stringify(value.bodyTemplate, null, 2)
                    : ""
                }
                onChange={(e) => {
                  try {
                    const parsed = e.target.value
                      ? JSON.parse(e.target.value)
                      : undefined;
                    updateField("bodyTemplate", parsed);
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                placeholder='{"key": "value"}'
                className="h-[100px] font-mono text-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authentication Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="authType">Auth Type</Label>
            <Select
              value={value.authType || "none"}
              onValueChange={(val) =>
                updateField("authType", val as ApiSpec["authType"])
              }
            >
              <SelectTrigger id="authType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="oauth2">OAuth 2.0</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(value.authType === "api-key" || value.authType === "bearer") && (
            <div>
              <Label htmlFor="authKeyName">Auth Key Name</Label>
              <Input
                id="authKeyName"
                value={value.authKeyName || ""}
                onChange={(e) => updateField("authKeyName", e.target.value)}
                placeholder="e.g., OPENAI_API_KEY"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Users will need to provide this key when using the tool
              </p>
            </div>
          )}

          {value.authType === "oauth2" && (
            <>
              <div>
                <Label htmlFor="oauthProviderKey">OAuth Provider</Label>
                <Input
                  id="oauthProviderKey"
                  value={value.oauthProviderKey || ""}
                  onChange={(e) =>
                    updateField("oauthProviderKey", e.target.value)
                  }
                  placeholder="e.g., google_workspace, github"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The provider key must match a configured OAuth provider
                </p>
              </div>

              <div>
                <Label>OAuth Scopes</Label>
                <TagsInput
                  value={value.oauthScopes || []}
                  onChange={(val) => updateField("oauthScopes", val)}
                  placeholder="Add scopes..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Press Enter or comma to add scopes
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="oauthTokenLocation">Token Location</Label>
                  <Select
                    value={value.oauthTokenLocation || "header"}
                    onValueChange={(val) =>
                      updateField(
                        "oauthTokenLocation",
                        val as ApiSpec["oauthTokenLocation"]
                      )
                    }
                  >
                    <SelectTrigger id="oauthTokenLocation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Header</SelectItem>
                      <SelectItem value="query">Query Parameter</SelectItem>
                      <SelectItem value="body">Body</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="oauthTokenKey">Token Key</Label>
                  <Input
                    id="oauthTokenKey"
                    value={value.oauthTokenKey || ""}
                    onChange={(e) =>
                      updateField("oauthTokenKey", e.target.value)
                    }
                    placeholder="e.g., Authorization, access_token"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="oauthTokenPrefix">Token Prefix (Optional)</Label>
                <Input
                  id="oauthTokenPrefix"
                  value={value.oauthTokenPrefix || ""}
                  onChange={(e) =>
                    updateField("oauthTokenPrefix", e.target.value)
                  }
                  placeholder='e.g., "Bearer ", "token "'
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
