// File: app/api/agents/agent/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
export const maxDuration = 45;

/**
 * GET /api/agents/agent?agentId=xxxx
 * Fetch a single agent by ID.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("agent")
      .select("*")
      .eq("agent_id", agentId)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error fetching agent:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST (run agent) /api/agents/agent?agentId=xxxx
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("agentId");
  if (!id) {
    return NextResponse.json(
      { error: "Missing agentId query param" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/agents/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: id, messages: body.messages }),
    });
    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error running agent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  try {
    const updates = await request.json();
    const {
      name,
      persona,
      instructions,
      knowledgebase,
      avatar,
      common_tools,
      external_tools,
      temperature,
      maxTokens,
      stopSequence,
      topP,
      frequencyPenalty,
      presencePenalty,
    } = updates;

    // Update the agent with the new data
    const { data, error } = await supabase
      .from("agent")
      .update({
        name,
        persona,
        instructions,
        knowledgebase,
        avatar,
        common_tools,
        external_tools,
        temperature,
        max_tokens: maxTokens,
        stop_sequence: stopSequence,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
      })
      .eq("agent_id", agentId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error updating agent:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
