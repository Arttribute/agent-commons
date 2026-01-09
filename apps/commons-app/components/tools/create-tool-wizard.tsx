"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BasicInfoStep } from "./wizard-steps/basic-info-step";
import { ApiConfigStep } from "./wizard-steps/api-config-step";
import { SchemaStep } from "./wizard-steps/schema-step";

export interface ToolFormData {
  // Basic Info
  name: string;
  displayName: string;
  description: string;
  category: string;
  visibility: "private" | "public" | "platform";
  icon?: string;
  tags: string[];
  version: string;

  // API Configuration
  apiSpec?: {
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
  };

  // Schema & Advanced
  schemaType: "auto" | "custom";
  customSchema?: any;
  inputSchema?: any;
  outputSchema?: any;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
}

const INITIAL_FORM_DATA: ToolFormData = {
  name: "",
  displayName: "",
  description: "",
  category: "",
  visibility: "private",
  tags: [],
  version: "1.0.0",
  schemaType: "custom",
};

export function CreateToolWizard() {
  const router = useRouter();
  const { authState } = useAuth();
  const { walletAddress } = authState;

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ToolFormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFormData = (updates: Partial<ToolFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.name.trim()) {
        setError("Tool name is required");
        return false;
      }
      if (!formData.description.trim()) {
        setError("Description is required");
        return false;
      }
    }
    if (step === 3) {
      if (formData.schemaType === "custom" && !formData.customSchema) {
        setError("Custom schema is required");
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    setLoading(true);
    setError(null);

    try {
      // Build the tool schema
      let schema = formData.customSchema;

      // If auto-generating from API spec, create a basic schema
      if (formData.schemaType === "auto" && formData.apiSpec) {
        schema = {
          type: "function",
          function: {
            name: formData.name,
            description: formData.description,
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        };
      }

      const toolPayload = {
        name: formData.name,
        displayName: formData.displayName || formData.name,
        description: formData.description,
        schema: schema,
        apiSpec: formData.apiSpec,
        visibility: formData.visibility,
        owner: walletAddress?.toLowerCase() || "",
        ownerType: "user",
        category: formData.category || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        icon: formData.icon || undefined,
        version: formData.version,
        inputSchema: formData.inputSchema || undefined,
        outputSchema: formData.outputSchema || undefined,
        rateLimitPerMinute: formData.rateLimitPerMinute || undefined,
        rateLimitPerHour: formData.rateLimitPerHour || undefined,
      };

      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toolPayload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create tool");
      }

      // Success! Redirect to tools management
      router.push("/studio/tools");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <Card className="border-2">
        <CardHeader>
          <div className="bg-purple-200 w-48 h-8 -mb-8 rounded-lg"></div>
          <h2 className="text-2xl font-semibold">
            Create New Tool - Step {currentStep} of 3
          </h2>
        </CardHeader>

        <CardContent className="pt-6">
          {/* Step Indicator */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={cn(
                  "h-2 flex-1 rounded-full transition-colors",
                  step === currentStep
                    ? "bg-primary"
                    : step < currentStep
                    ? "bg-primary/50"
                    : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Step Content */}
          <ScrollArea className="h-[500px] pr-4">
            {currentStep === 1 && (
              <BasicInfoStep
                data={formData}
                onChange={updateFormData}
              />
            )}
            {currentStep === 2 && (
              <ApiConfigStep
                data={formData}
                onChange={updateFormData}
              />
            )}
            {currentStep === 3 && (
              <SchemaStep
                data={formData}
                onChange={updateFormData}
              />
            )}
          </ScrollArea>
        </CardContent>

        <CardFooter className="flex justify-between border-t pt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1 || loading}
          >
            Back
          </Button>

          {currentStep < 3 ? (
            <Button onClick={handleNext} disabled={loading}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Tool
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
