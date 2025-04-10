// app/api/tools/available/route.ts

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    // Parse query params: ?type=common or ?type=external
    // For external, we expect ?owner=0x1234...
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const owner = searchParams.get("owner") || "";

    if (!type) {
      return NextResponse.json({ error: "Missing type" }, { status: 400 });
    }

    if (type === "common") {
      // Query the "resource" table for rows with resource_type = "tool"
      const { data, error } = await supabase
        .from("resource")
        .select("resource_id, schema")
        .eq("resource_type", "tool");

      if (error) throw error;

      // We assume the resource name is in schema->>name
      const tools = (data || []).map((row) => ({
        id: row.resource_id,
        name: row.schema?.name ?? "(No Name)",
      }));

      return NextResponse.json(tools);
    } else if (type === "external") {
      // Query the "tool" table for rows with owner = userAddress
      if (!owner) {
        return NextResponse.json({ error: "Missing owner" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("tool")
        .select("tool_id, name")
        .eq("owner", owner);

      if (error) throw error;

      const tools = (data || []).map((row) => ({
        id: row.tool_id,
        name: row.name,
      }));

      return NextResponse.json(tools);
    } else {
      return NextResponse.json(
        { error: `Unknown type "${type}"` },
        { status: 400 }
      );
    }
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
