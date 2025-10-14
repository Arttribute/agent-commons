"use client";
import { useState } from "react";

export interface UpdateSpaceInput {
  name?: string;
  description?: string;
  image?: string;
  isPublic?: boolean;
  maxMembers?: number | null;
  settings?: any;
}

export function useUpdateSpace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateSpace(spaceId: string, input: UpdateSpaceInput) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ spaceId });
      const res = await fetch(`/api/spaces/space?${params.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update space");
      return Array.isArray(data?.data) ? data.data[0] : (data.data ?? data);
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { updateSpace, loading, error };
}
