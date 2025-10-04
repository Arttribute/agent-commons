"use client";
import { useState } from "react";

export interface CreateSpaceInput {
  name: string;
  description?: string;
  isPublic?: boolean;
  maxMembers?: number;
}

export function useCreateSpace(
  creatorId?: string,
  creatorType: "agent" | "human" = "human"
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSpace(input: CreateSpaceInput) {
    if (!creatorId) throw new Error("creatorId required");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-creator-id": creatorId,
          "x-creator-type": creatorType,
        },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create space");
      return data.data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { createSpace, loading, error };
}
