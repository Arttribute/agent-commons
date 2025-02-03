"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { CommonAgent } from "@/types/agent";

export function AIAgentBuilder() {
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedAgent, setGeneratedAgent] = useState<CommonAgent | null>(
    null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulating AI processing time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // TODO: Replace this with actual AI-generated agent
    const mockGeneratedAgent: CommonAgent = {
      agentId: "ai-generated-1",
      name: "AI Assistant",
      profileImage: "/placeholder.svg?height=200&width=200",
      persona: "A helpful AI assistant generated based on your description.",
      instruction:
        "Assist users with various tasks based on the given description.",
      address: "0x1234567890123456789012345678901234567890",
      mode: "userDriven",
      core_tools: ["search", "calculator"],
      common_tools: [],
      external_tools: [],
      knowledgebase: "Generated knowledge based on the description.",
      memory: "",
      owner: "user123",
    };

    setGeneratedAgent(mockGeneratedAgent);
    setIsLoading(false);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>AI-Powered Agent Builder</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder="Describe the agent you want to create..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[200px]"
          />
          <Button
            type="submit"
            disabled={isLoading || description.trim() === ""}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Agent...
              </>
            ) : (
              "Generate Agent"
            )}
          </Button>
        </form>

        {generatedAgent && (
          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-semibold">Generated Agent:</h3>
            <pre className="bg-muted p-4 rounded-md overflow-auto">
              {JSON.stringify(generatedAgent, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
