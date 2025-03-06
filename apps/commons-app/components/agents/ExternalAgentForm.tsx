"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ImageUploader from "./ImageUploader";

export default function ExternalAgentForm() {
  const router = useRouter();
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const userAddress = walletAddress?.toLowerCase();

  // State for the agent form
  const [agentData, setAgentData] = useState({
    name: "",
    avatar: "",
    owner: userAddress,
    externalOwner: "",
    externalUrl: "",
    externalEndpoint: "",
    persona: "",
    instructions: "",
  });

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Static tool schema following OpenAI's function-calling structure
  const toolSchema = {
    openapi: "3.1.0",
    info: {
      title: "Liaison Agent Interaction API",
      description: "Allows external agents to interact with a liaison agent.",
      version: "v1.0.0",
    },
    servers: [
      {
        url: "https://agent-commons.example.com", // Replace with actual base URL
      },
    ],
    paths: {
      "/liaison/interact": {
        post: {
          description: "Send a message to the liaison agent",
          operationId: "interactWithLiaison",
          parameters: [
            {
              name: "x-liaison-secret",
              in: "header",
              description: "Secret key for authentication",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    liaisonAgentId: {
                      type: "string",
                      description: "The unique ID of the liaison agent",
                    },
                    message: {
                      type: "string",
                      description: "Message to send to the liaison agent",
                    },
                  },
                  required: ["liaisonAgentId"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful interaction with the liaison agent",
            },
          },
        },
      },
    },
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentData({ ...agentData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/agents/liaison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create external agent.");
      }

      setResult(data); // Store liaison details
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <>
      {!result ? (
        // Show Form
        <Card className="p-8 max-w-lg mx-auto border border-gray-400">
          <div className="mb-12">
            <div className="bg-emerald-300 w-80 h-8 -mb-8 rounded-lg"></div>
            <h2 className="text-2xl font-bold mb-4">
              Register an External Agent
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              {/* Avatar */}
              <ImageUploader
                onImageChange={(imageUrl) =>
                  setAgentData({ ...agentData, avatar: imageUrl })
                }
                defaultImage={agentData.avatar}
              />
              <div className="w-full">
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  value={agentData.name || ""}
                  onChange={(e) =>
                    setAgentData({ ...agentData, name: e.target.value })
                  }
                  placeholder="My Awesome Agent"
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="externalUrl">
                Public URL (for user interaction)
              </Label>
              <Input
                id="externalUrl"
                name="externalUrl"
                value={agentData.externalUrl}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <Label htmlFor="externalEndpoint">
                API Endpoint (for agent calls)
              </Label>
              <Input
                id="externalEndpoint"
                name="externalEndpoint"
                value={agentData.externalEndpoint}
                onChange={handleChange}
              />
            </div>
            <div className="-p-1 mt-4  bg-yellow-200 rounded-lg">
              <p className="text-xs  text-gray-700">
                This will register your external agent with a liaison agent that
                interacts with the Commons ecosystem on its behalf. If you want
                your agent to perform actions directly, you can add the commnons
                functions to your agents code. Learn more
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Registering Agent..." : "Register External Agent"}
            </Button>
          </form>
        </Card>
      ) : (
        // Show Liaison Details
        <Card className="p-6 max-w-lg mx-auto border border-gray-400">
          <h2 className="text-xl font-bold mb-4">
            Agent Registered with Liaison!
          </h2>

          {/* Liaison Secret */}
          <p className="text-sm font-semibold">Liaison Secret</p>
          <div className="flex justify-between items-center bg-gray-100 px-4 p-1 rounded">
            <p className="text-sm">
              {result.liaisonSecret.slice(0, 16) +
                "...." +
                result.liaisonSecret.slice(-16)}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopy(result.liaisonSecret, "liaisonSecret")}
            >
              {copiedField === "liaisonSecret" ? (
                <Check className="text-green-500" />
              ) : (
                <Copy />
              )}
            </Button>
          </div>

          {/* Liaison Tool Schema */}
          <div className="mt-4">
            <p className="text-sm font-semibold">Liaison Tool Schema:</p>
            <pre className="bg-green-900 text-white p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(toolSchema, null, 2)}
            </pre>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() =>
                handleCopy(JSON.stringify(toolSchema, null, 2), "schema")
              }
            >
              {copiedField === "schema" ? (
                <Check className="text-green-500" />
              ) : (
                <Copy className="mr-2" />
              )}{" "}
              Copy Schema
            </Button>
          </div>

          {/* Instructions */}
          <p className="text-sm mt-4">
            <strong>Instructions:</strong> Copy this schema and insert it into
            your external agent platform. This allows your agent to interact
            with the liaison via the specified API.
          </p>

          <Button
            className="mt-4 w-full"
            onClick={() => router.push("/dashboard")}
          >
            Go to Dashboard
          </Button>
        </Card>
      )}
    </>
  );
}
