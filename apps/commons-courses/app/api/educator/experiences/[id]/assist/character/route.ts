import { NextRequest, NextResponse } from "next/server";
import {
  ensureEducatorCopilotProfile,
  type CopilotUser,
} from "@/lib/educator-copilot-agent";
import {
  experienceAiFailure,
  generateAndPersistExperienceImage,
} from "@/lib/experience-ai";
import { requireEducatorExperience } from "@/lib/experience-access";
import { isS3MediaStorageConfigured } from "@/lib/media-storage";
import User from "@/models/User";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireEducatorExperience(id);
  if (!access.ok) return access.error;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    role?: string;
    description?: string;
    world?: string;
  };
  const name = body.name?.trim().slice(0, 100);
  if (!name) {
    return NextResponse.json(
      { error: "Give the character a name before generating artwork." },
      { status: 400 },
    );
  }
  if (!isS3MediaStorageConfigured()) {
    return NextResponse.json(
      { error: "Course media storage is not configured." },
      { status: 500 },
    );
  }

  const userDoc = (await User.findById(access.session.userId)
    .select("name")
    .lean()) as { name?: string } | null;
  const user: CopilotUser = {
    id: access.session.userId,
    email: access.session.email,
    name: userDoc?.name,
    role: access.session.role,
    accessToken: access.session.accessToken,
    accessTokenError: access.session.accessTokenError,
    identityUserId: access.session.identityUserId,
    identityWorkspaceId: access.session.identityWorkspaceId,
  };
  const connection = await ensureEducatorCopilotProfile(user);
  if (
    !connection.client ||
    !connection.agentReady ||
    !connection.profile.agentId
  ) {
    return NextResponse.json(
      {
        error:
          connection.connectionMessage ||
          "Connect your Commons account before generating character artwork.",
        code: connection.connectionStatus,
        retryable: false,
      },
      { status: 409 },
    );
  }

  const artDirection = [
    `Create one polished full-body character illustration for "${name}".`,
    body.role?.trim() ? `Role: ${body.role.trim().slice(0, 200)}.` : "",
    body.description?.trim()
      ? `Character bible: ${body.description.trim().slice(0, 1400)}.`
      : "",
    body.world?.trim()
      ? `Shared world art bible: ${body.world.trim().slice(0, 1800)}.`
      : "",
    "Cinematic editorial educational adventure art; expressive face and hands; strong readable silhouette; full body visible from head to feet; front three-quarter view; consistent directional lighting; premium web-game finish.",
    "Isolated subject on a plain chroma-neutral background with generous clear space. No typography, labels, logos, watermark, frame, UI, scenery, or additional characters.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const result = await generateAndPersistExperienceImage({
      client: connection.client,
      agentId: connection.profile.agentId,
      prompt: artDirection,
      name,
      keyPrefix: `experience-assets/${String(access.project._id)}/characters`,
      size: "1024x1536",
      quality: "high",
      operationId: `experience:${String(access.project._id)}:character:${crypto.randomUUID()}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[experience-character] generation failed:", error);
    const failure = experienceAiFailure(
      error,
      "Character artwork could not be generated.",
    );
    return NextResponse.json(failure, { status: failure.status });
  }
}
