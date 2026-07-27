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

const supportedKinds = ["background", "prop", "map", "illustration"] as const;
type AssetKind = (typeof supportedKinds)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireEducatorExperience(id);
  if (!access.ok) return access.error;
  const body = (await req.json().catch(() => ({}))) as {
    kind?: AssetKind;
    name?: string;
    prompt?: string;
    artDirection?: string;
  };
  if (!supportedKinds.includes(body.kind as AssetKind)) {
    return NextResponse.json(
      { error: "Choose a background, prop, map, or illustration." },
      { status: 400 },
    );
  }
  const kind = body.kind as AssetKind;
  const name = body.name?.trim().slice(0, 160);
  const prompt = body.prompt?.trim().slice(0, 3000);
  if (!name || !prompt) {
    return NextResponse.json(
      { error: "Name the asset and describe what the world needs." },
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
          "Connect your Commons account before generating world artwork.",
        code: connection.connectionStatus,
        retryable: false,
      },
      { status: 409 },
    );
  }

  const direction = [
    `Create one ${kind} asset named "${name}" for an immersive educational adventure.`,
    `Asset brief: ${prompt}.`,
    body.artDirection?.trim()
      ? `Shared world art bible: ${body.artDirection.trim().slice(0, 2400)}.`
      : "",
    kind === "background"
      ? "Wide cinematic establishing environment, deep foreground/midground/background composition, a usable open staging area for characters and interactive objects, no people."
      : "",
    kind === "map"
      ? "A navigable world-map plate with distinct landmark regions and clear spatial hierarchy; no labels or typography."
      : "",
    kind === "prop"
      ? "Single clearly isolated game prop, strong silhouette, generous neutral space around the object."
      : "",
    "Cohesive premium game illustration, purposeful lighting, detailed but uncluttered, suitable for full-screen web delivery.",
    "No words, labels, logos, watermark, border, or user interface.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const result = await generateAndPersistExperienceImage({
      client: connection.client,
      agentId: connection.profile.agentId,
      prompt: direction,
      name,
      keyPrefix: `experience-assets/${String(access.project._id)}/${kind}`,
      size: kind === "prop" ? "1024x1024" : "1536x1024",
      quality: "high",
      operationId: `experience:${String(access.project._id)}:${kind}:${crypto.randomUUID()}`,
    });
    return NextResponse.json({
      ...result,
      asset: {
        id: `asset-${crypto.randomUUID().slice(0, 12)}`,
        name,
        kind: "image",
        url: result.url,
        source: "generated",
        prompt: direction,
      },
    });
  } catch (error) {
    console.error("[experience-asset] generation failed:", error);
    const failure = experienceAiFailure(
      error,
      "World artwork could not be generated.",
    );
    return NextResponse.json(failure, { status: failure.status });
  }
}
