import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { platformServiceToken } from "@/lib/platform-service-token";
import { connectDB } from "@/lib/db";
import { getCommonsPrincipal } from "@/lib/commons-principal";

type ChatBody = {
  agentId?: string;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  sessionId?: string;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as ChatBody;
  if (!body.agentId || !body.messages?.length) {
    return NextResponse.json(
      { error: "agentId and messages are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const principal = await getCommonsPrincipal(session);
  if (!principal?.identityUserId) {
    return NextResponse.json(
      { error: "Your account is not linked to Commons Identity yet." },
      { status: 409 }
    );
  }

  const baseUrl =
    process.env.COMMONS_API_URL ||
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;
  const token =
    session.accessToken || (await platformServiceToken("agent_commons", "agents:run"));
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Agent Commons chat is not configured yet." },
      { status: 503 }
    );
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/agents/run/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-initiator": principal.identityUserId,
    },
    body: JSON.stringify({
      agentId: body.agentId,
      messages: body.messages,
      sessionId: body.sessionId,
      initiator: principal.identityUserId,
      initiatorId: principal.identityUserId,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({
      error: response.statusText || "Agent run failed.",
    }));
    return NextResponse.json(data, { status: response.status });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
