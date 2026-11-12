import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  publicRegistration,
  quoteRegistration,
  startRegistration,
  getRegistrationReceipt,
} from "@/lib/course-registration";
import { RegistrationError } from "@/lib/registration-policy";
import { connectDB } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ slug: string; action?: string[] }> };
let ttlReady = false;
async function handle(req: NextRequest, context: Context) {
  try {
    const { slug, action = [] } = await context.params;
    const path = action.join("/");
    await connectDB();
    const mongo = (await import("mongoose")).default;
    const counters = mongo.connection.db!.collection(
      "registration_rate_limits",
    );
    if (!ttlReady) {
      await counters.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      ttlReady = true;
    }
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const bucket = Math.floor(Date.now() / 60_000);
    const limit = req.method === "GET" ? 120 : path === "quote" ? 20 : 12;
    const id = createHash("sha256")
      .update(
        `${ip}:${slug}:${req.method}:${path.includes("payments/") ? "receipt" : path}:${bucket}`,
      )
      .digest("hex");
    const count = await counters.findOneAndUpdate(
      { _id: id as any },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(Date.now() + 5 * 60_000) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (Number(count?.count) > limit)
      throw new RegistrationError("Please wait a minute and try again", 429);
    let data;
    if (req.method === "GET" && !path) data = await publicRegistration(slug);
    else if (
      req.method === "GET" &&
      action.length === 2 &&
      action[0] === "payments"
    )
      data = await getRegistrationReceipt(slug, action[1]);
    else if (
      req.method === "POST" &&
      action.length === 3 &&
      action[0] === "payments" &&
      action[2] === "verify"
    )
      data = await getRegistrationReceipt(slug, action[1], true);
    else if (
      req.method === "POST" &&
      (path === "quote" || path === "checkout")
    ) {
      const text = await req.text();
      if (text.length > 16000)
        throw new RegistrationError("Please keep the registration short");
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new RegistrationError("Please check the form");
      }
      data =
        path === "quote"
          ? await quoteRegistration(slug, body)
          : await startRegistration(slug, body);
    } else throw new RegistrationError("Page not found", 404);
    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    if (error instanceof RegistrationError)
      return NextResponse.json(
        { message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    console.error(
      "Course registration request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { message: "Registration is temporarily unavailable. Please try again" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handle;
export const POST = handle;
