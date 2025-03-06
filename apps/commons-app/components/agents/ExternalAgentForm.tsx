"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

export default function ExternalAgentForm() {
  const router = useRouter();
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const userAddress = walletAddress?.toLowerCase();
  const [agentData, setAgentData] = useState({
    name: "",
    owner: userAddress,
    externalOwner: "",
    externalUrl: "",
    externalEndpoint: "",
    persona: "",
    instructions: "",
  });

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

      setResult(data);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 max-w-lg mx-auto mt-10">
      <h2 className="text-xl font-bold mb-4">Register an External Agent</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Agent Name</Label>
          <Input
            id="name"
            name="name"
            value={agentData.name}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <Label htmlFor="externalUrl">Public URL (for user interaction)</Label>
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating Agent..." : "Create External Agent"}
        </Button>
      </form>

      {result && (
        <CardContent className="mt-6 p-4 border rounded bg-gray-100">
          <h3 className="text-lg font-semibold">
            Liaison Created Successfully!
          </h3>
          <p>
            <strong>Liaison Secret:</strong> {result.liaisonSecret}
          </p>
          <p>
            <strong>API Schema:</strong>
          </p>
          <pre className="bg-black text-white p-2 mt-2 rounded">
            {JSON.stringify(result.data, null, 2)}
          </pre>
          <p className="mt-4">
            <strong>Instructions:</strong> Copy this schema and use it in your
            external agent's platform.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
