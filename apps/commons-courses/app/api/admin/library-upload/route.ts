import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { uploadEducatorCopilotFiles } from "@/lib/educator-copilot-files";
import { platformServiceToken } from "@/lib/platform-service-token";
import User from "@/models/User";

const allowed = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const maxSize = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (
    !process.env.ADMIN_SECRET ||
    req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const form = await req.formData();
  const ownerEmail = String(form.get("ownerEmail") || "")
    .trim()
    .toLowerCase();
  const files = form
    .getAll("files")
    .filter((item): item is File => item instanceof File)
    .slice(0, 10);
  if (!ownerEmail || !files.length) {
    return NextResponse.json(
      { error: "An owner email and at least one file are required." },
      { status: 400 },
    );
  }
  const invalid = files.find(
    (file) => !allowed.has(file.type) || file.size > maxSize,
  );
  if (invalid) {
    return NextResponse.json(
      {
        error: `${invalid.name} must be a PDF, PowerPoint, or Word file smaller than 50 MB.`,
      },
      { status: 400 },
    );
  }
  await connectDB();
  const owner = (await User.findOne({ email: ownerEmail })
    .select("identityUserId identityWorkspaceId")
    .lean()) as {
    identityUserId?: string;
    identityWorkspaceId?: string;
  } | null;
  if (!owner?.identityUserId) {
    return NextResponse.json(
      { error: "The educator is not connected to Commons Identity." },
      { status: 404 },
    );
  }
  const accessToken = await platformServiceToken(
    "agent_commons",
    "activity:read",
  );
  if (!accessToken) {
    return NextResponse.json(
      { error: "Commons Library service access is unavailable." },
      { status: 503 },
    );
  }
  const uploaded = await uploadEducatorCopilotFiles(files, {
    accessToken,
    principalId: owner.identityUserId,
    workspaceId: owner.identityWorkspaceId,
    storageProvider: "s3",
  });
  if (uploaded.length !== files.length) {
    return NextResponse.json(
      { error: "One or more files could not be stored in Commons Library." },
      { status: 502 },
    );
  }
  return NextResponse.json({ data: uploaded }, { status: 201 });
}
