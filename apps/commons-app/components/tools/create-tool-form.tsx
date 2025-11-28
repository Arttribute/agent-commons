"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateToolForm() {
  const router = useRouter();
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const userAddress = walletAddress?.toLowerCase() || ""; // fallback to empty string

  // Local state
  const [toolData, setToolData] = useState({
    name: "",
    displayName: "",
    description: "",
    customJson: "",
    visibility: "private" as "private" | "public" | "platform",
  });

  const [loadingCreate, setLoadingCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoadingCreate(true);

    try {
      // Parse the custom JSON to get the schema
      let schema;
      try {
        schema = JSON.parse(toolData.customJson);
      } catch (e) {
        throw new Error("Invalid JSON format in Custom Tool JSON field");
      }

      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: toolData.name,
          displayName: toolData.displayName || toolData.name,
          schema: schema,
          owner: userAddress,
          ownerType: "user",
          visibility: toolData.visibility,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create tool");
      }

      const data = await res.json();

      if (data.data) {
        setSuccess("Tool created successfully!");
        // Reset form
        setToolData({
          name: "",
          displayName: "",
          description: "",
          customJson: "",
          visibility: "private",
        });
        // Redirect to /studio/tools
        router.push("/studio/tools");
      } else {
        throw new Error("Unknown error");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingCreate(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-lg">
      <Card className="bg-background border border-gray-400 h-[600px] flex flex-col">
        <div className="m-8">
          <div className="bg-cyan-300 w-48 h-8 -mb-8 rounded-lg"></div>
          <h2 className="text-2xl font-semibold">Create New Tool</h2>
        </div>
        <CardContent className="flex flex-col flex-grow overflow-hidden">
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          {success && <p className="text-green-500 text-sm mb-2">{success}</p>}

          <div className="w-full mb-2">
            <Label htmlFor="name">Tool Name (unique identifier)</Label>
            <Input
              id="name"
              value={toolData.name}
              onChange={(e) =>
                setToolData({ ...toolData, name: e.target.value })
              }
              placeholder="my_awesome_tool"
              className="w-full"
              required
            />
          </div>

          <div className="w-full mb-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={toolData.displayName}
              onChange={(e) =>
                setToolData({ ...toolData, displayName: e.target.value })
              }
              placeholder="My Awesome Tool"
              className="w-full"
            />
          </div>

          <div className="w-full mb-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={toolData.visibility}
              onValueChange={(value: "private" | "public" | "platform") =>
                setToolData({ ...toolData, visibility: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private (only you)</SelectItem>
                <SelectItem value="public">Public (all users)</SelectItem>
                <SelectItem value="platform">Platform (system-wide)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="custom-json">Custom Tool JSON</Label>
            <Textarea
              id="custom-json"
              placeholder="Paste your custom tool JSON here..."
              value={toolData.customJson}
              onChange={(e) =>
                setToolData({ ...toolData, customJson: e.target.value })
              }
              className="h-[200px]"
            />
          </div>
          <div className="mt-auto">
            <Button type="submit" className="w-full" disabled={loadingCreate}>
              {loadingCreate ? "Creating Tool..." : "Create Tool"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
