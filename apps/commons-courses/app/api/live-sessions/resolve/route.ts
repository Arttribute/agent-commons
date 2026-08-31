import { NextRequest, NextResponse } from "next/server";
import LiveSession from "@/models/LiveSession";
import { connectDB } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";
  if (code.length !== 6) {
    return NextResponse.json({ error: "Enter the six-digit session code." }, { status: 400 });
  }
  await connectDB();
  const session = (await LiveSession.findOne({ joinCode: code })
    .select("_id status")
    .lean()) as unknown as { _id: unknown; status: "draft" | "lobby" | "live" | "ended" } | null;
  if (!session || session.status === "draft" || session.status === "ended") {
    return NextResponse.json({ error: "That session is not open for joining." }, { status: 404 });
  }
  return NextResponse.json({ sessionId: String(session._id) });
}
