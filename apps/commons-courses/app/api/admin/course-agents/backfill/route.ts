import { NextRequest, NextResponse } from "next/server";
import { getDefaultCourseAgents } from "@/lib/course-agent-defaults";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";

function isAuthorized(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return Boolean(secret) && secret === process.env.ADMIN_SECRET;
}

const missingCourseAgentsFilter = {
  $or: [{ agents: { $exists: false } }, { agents: { $size: 0 } }],
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const missingAgentsCount = await Course.countDocuments(missingCourseAgentsFilter);

  return NextResponse.json({
    missingAgentsCount,
    defaultAgents: getDefaultCourseAgents(),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const defaults = getDefaultCourseAgents();
  const result = await Course.updateMany(missingCourseAgentsFilter, {
    $set: { agents: defaults },
  });

  return NextResponse.json({
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    agentsApplied: defaults.length,
  });
}
