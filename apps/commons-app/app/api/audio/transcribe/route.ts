import { NextRequest } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "Server base URL not configured" }), { status: 500 });
  }

  const { user } = await requireCurrentCommonsUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const formData = await request.formData();

  const authHeaders = await backendAuthHeaders();
  const upstream = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "x-initiator": user.userId,
    },
    body: formData,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
