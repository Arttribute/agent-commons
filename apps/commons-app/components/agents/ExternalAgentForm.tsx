"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, InfoIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ImageUploader from "./ImageUploader";
import { FundAgent } from "@/components/agents/FundAgent";

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
  const [toolSchema, setToolSchema] = useState<any>(null);
  const [agentBalance, setAgentBalance] = useState<bigint>(0n);

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
      console.log("Agent created:", data);
      setResult(data); // Store liaison details
      setToolSchema({
        info: {
          title: "Liaison Agent Interaction API",
          description:
            "Allows external agents to interact with a liaison agent that gives access to all info about Agent Commons.",
          version: "v1.0.0",
        },
        servers: [
          {
            url: `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1`,
          },
        ],
        paths: {
          "/liaison/interact": {
            post: {
              description: "Send a message to the liaison agent",
              operationId: "interactWithLiaison",
              parameters: [
                {
                  name: "x-api-key",
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
                          description: `The unique ID of the liaison agent which is ${data.data.agentId}`,
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
      });
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
              {"Register an External Agent"}
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
                <Label htmlFor="name">{"Agent Name"}</Label>
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
                {"Public URL (for user interaction)"}
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
                {" API Endpoint (for agent calls)"}
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
                {
                  "This will register your external agent with a liaison agent that interacts with the Commons ecosystem on its behalf. If you want your agent to perform actions directly, you can add the commnons functions to your agents code. Learn more"
                }
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
          <div className="mb-8">
            <div className="bg-emerald-300 w-80 h-8 -mb-8 rounded-lg"></div>
            <h2 className="text-xl font-bold mb-4">
              {"Agent Registered with Liaison!"}
            </h2>
          </div>
          {/* Agent ID */}

          {/* Liaison Secret */}
          <p className="text-sm font-semibold">{"Liaison Key"}</p>
          <div className="flex justify-between items-center bg-gray-100 px-4 p-1 rounded">
            <p className="text-sm">
              {result.liaisonKey.slice(0, 16) +
                "...." +
                result.liaisonKey.slice(-16)}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopy(result.liaisonKey, "liaisonKey")}
            >
              {copiedField === "liaisonKey" ? (
                <Check className="text-green-500" />
              ) : (
                <Copy />
              )}
            </Button>
          </div>
          <p className="text-xs  text-amber-700 mt-1">
            <InfoIcon className="w-3 h-3 inline mr-1 mb-0.5" />
            {"This secret will only be shown once."}
          </p>

          {/* Liaison Tool Schema */}
          <div className="mt-4">
            <p className="text-sm font-semibold">{"Liaison Tool Schema:"}</p>
            <pre className="bg-slate-900 text-sm text-white p-2 rounded overflow-auto max-h-40">
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
              {"Copy Schema"}
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-2 mt-1 border p-1 rounded-lg w-full">
            <div className="col-span-4 flex flex-col justify-center">
              <p className="font-semibold text-gray-800 ml-2">
                Common$:{" "}
                <span className="text-blue-700">
                  {(Number(agentBalance) / 1e18).toFixed(4)}
                </span>
              </p>
            </div>
            <div className="col-span-3">
              <FundAgent
                agentAddress={result.data.agentId as `0x${string}`}
                onFundSuccess={() => {
                  if (result?.agentId) {
                    setAgentBalance(agentBalance + 20n);
                  }
                }}
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="-p-1 mt-4  bg-sky-200 rounded-lg">
            <p className="text-xs  text-gray-700">
              {
                "Copy the liaison secret and this schema and insert it into your external agent platform. This allows your agent to interact with the liaison via the specified API. Learn more"
              }
            </p>
          </div>

          <Button
            className="mt-4 w-full"
            onClick={() => router.push("/studio/agents")}
          >
            {"Go to Dashboard"}
          </Button>
        </Card>
      )}
    </>
  );
}
