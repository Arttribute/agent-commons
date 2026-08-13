import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireEducatorCourse } from "@/lib/educator-auth";
import LiveSession from "@/models/LiveSession";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  await connectDB();
  const session = await LiveSession.findById(id).select(
    "courseSlug title joinCode",
  );
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const authorization = await requireEducatorCourse(session.courseSlug);
  if (authorization.error) return authorization.error;

  const format =
    req.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const joinUrl = `${req.nextUrl.origin}/live/${session.id}`;
  const qrUrl = new URL("https://quickchart.io/qr");
  qrUrl.searchParams.set("size", format === "svg" ? "1200" : "1600");
  qrUrl.searchParams.set("margin", "2");
  qrUrl.searchParams.set("ecLevel", "H");
  qrUrl.searchParams.set("format", format);
  qrUrl.searchParams.set("text", joinUrl);

  const qrResponse = await fetch(qrUrl, { cache: "no-store" });
  if (!qrResponse.ok) {
    return NextResponse.json(
      { error: "Could not generate the QR code." },
      { status: 502 },
    );
  }

  const safeTitle = session.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(await qrResponse.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeTitle || "live-session"}-qr.${format}"`,
      "Content-Type": format === "svg" ? "image/svg+xml" : "image/png",
    },
  });
}
