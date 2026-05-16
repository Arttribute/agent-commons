import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import {
  canManageCourseCollaborators,
  requireEducatorCourse,
} from "@/lib/educator-auth";
import { sendCourseCollaboratorInvite } from "@/lib/email/resend";
import User from "@/models/User";

type CollaboratorRole = "co_owner" | "editor";
type InviteUser = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  email?: string;
};

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase();
}

function serializeCollaborators(course: {
  collaborators?: Array<{
    id: string;
    email: string;
    name?: string;
    role: CollaboratorRole;
    userId?: { toString(): string };
    invitedAt?: Date;
    lastInvitedAt?: Date;
  }>;
}) {
  return (course.collaborators || []).map((collaborator) => ({
    id: collaborator.id,
    email: collaborator.email,
    name: collaborator.name,
    role: collaborator.role,
    userId: collaborator.userId?.toString(),
    invitedAt: collaborator.invitedAt,
    lastInvitedAt: collaborator.lastInvitedAt,
  }));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  return NextResponse.json({
    collaborators: serializeCollaborators(result.course),
    canManageCollaborators: canManageCourseCollaborators(
      result.course,
      result.session
    ),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  if (!canManageCourseCollaborators(result.course, result.session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await req.json()) as {
    email?: string;
    name?: string;
    role?: CollaboratorRole;
  };
  const email = normalizeEmail(body.email);
  const role: CollaboratorRole =
    body.role === "co_owner" ? "co_owner" : "editor";

  if (!email) {
    return NextResponse.json(
      { error: "A collaborator email is required." },
      { status: 400 }
    );
  }
  if (email === result.session.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "You already manage this course." },
      { status: 400 }
    );
  }
  const owner = result.course.educator?.userId
    ? ((await User.findById(result.course.educator.userId)
        .select("email")
        .lean()) as { email?: string } | null)
    : null;
  if (email === owner?.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "The primary owner already manages this course." },
      { status: 400 }
    );
  }

  const invitedUser = (await User.findOne({ email })
    .select("name email")
    .lean()) as InviteUser | null;
  const now = new Date();
  const existing = result.course.collaborators.find(
    (collaborator) => collaborator.email.toLowerCase() === email
  );

  if (existing) {
    existing.name = body.name?.trim() || invitedUser?.name || existing.name;
    existing.role = role;
    existing.userId = invitedUser?._id || existing.userId;
    existing.lastInvitedAt = now;
  } else {
    result.course.collaborators.push({
      id: crypto.randomUUID(),
      email,
      name: body.name?.trim() || invitedUser?.name,
      role,
      userId: invitedUser?._id,
      invitedBy: new mongoose.Types.ObjectId(result.session.userId),
      invitedAt: now,
      lastInvitedAt: now,
    });
  }

  await result.course.save();
  await sendCourseCollaboratorInvite({
    recipient: {
      email,
      name: body.name?.trim() || invitedUser?.name,
    },
    inviterName: result.session.email,
    role,
    course: {
      title: result.course.title,
      slug: result.course.slug,
      instructor: result.course.instructor,
      settings: result.course.emailSettings,
    },
  });

  return NextResponse.json({
    collaborators: serializeCollaborators(result.course),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  if (!canManageCourseCollaborators(result.course, result.session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Collaborator id is required." },
      { status: 400 }
    );
  }

  result.course.collaborators = result.course.collaborators.filter(
    (collaborator) => collaborator.id !== id
  );
  await result.course.save();

  return NextResponse.json({
    collaborators: serializeCollaborators(result.course),
  });
}
