import { NextRequest, NextResponse } from "next/server";
import {
  ensureEducatorCopilotProfile,
  type CopilotUser,
} from "@/lib/educator-copilot-agent";
import { requireEducatorExperience } from "@/lib/experience-access";
import {
  isS3MediaStorageConfigured,
  uploadCourseMediaToS3,
} from "@/lib/media-storage";
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
      },
      { status: 409 },
    );
  }

  const artDirection = [
    `Create one polished full-body character illustration for "${name}".`,
    body.role?.trim() ? `Role: ${body.role.trim().slice(0, 200)}.` : "",
    body.description?.trim()
      ? `Character bible: ${body.description.trim().slice(0, 1200)}.`
      : "",
    body.world?.trim()
      ? `The visual world is ${body.world.trim().slice(0, 300)}.`
      : "",
    "Editorial educational game art, warm and expressive, clean silhouette, front three-quarter view, full body visible, generous clear space around the figure, consistent lighting, premium web-game finish.",
    "Isolated subject on a plain neutral background. No typography, labels, logos, watermark, frame, interface, or additional characters.",
  ]
    .filter(Boolean)
    .join(" ");

  let generatedFileId = "";
  try {
    const stream = connection.client.agents.stream({
      agentId: connection.profile.agentId,
      initiatorId:
        access.session.identityUserId || access.session.userId,
      messages: [
        {
          role: "user",
          content: [
            "Generate the requested character artwork now.",
            "First call your built-in generateImage tool exactly once with n=1, size=1024x1536, and medium quality.",
            "Then call select_generated_character_art with the fileId returned by generateImage. Do not substitute a guessed URL or ID.",
            `Art direction: ${artDirection}`,
          ].join("\n\n"),
        },
      ],
      cliContext:
        "This is a constrained asset-generation step in CommonLab Experience Studio. Complete the image tool call, then hand the durable file ID back through the provided CLI tool.",
      cliTools: [
        {
          name: "select_generated_character_art",
          description:
            "Hand the generated Agent Commons image file back to Experience Studio for validation and durable course-media storage.",
          parameters: {
            type: "object",
            properties: {
              fileId: {
                type: "string",
                description:
                  "The exact fileId returned by the generateImage tool.",
              },
            },
            required: ["fileId"],
            additionalProperties: false,
          },
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type !== "cli_tool_request" ||
        (event.tool || event.toolName) !== "select_generated_character_art"
      ) {
        continue;
      }
      const args =
        typeof event.args === "string"
          ? JSON.parse(event.args)
          : event.args;
      if (args && typeof args === "object") {
        generatedFileId = String(
          (args as { fileId?: unknown }).fileId || "",
        ).trim();
      }
      if (event.requestId) {
        await connection.client.agents.submitCliToolResult(
          event.requestId,
          JSON.stringify({
            accepted: Boolean(generatedFileId),
            message:
              "The generated file ID was received for validation and durable course-media storage.",
          }),
        );
      }
    }
  } catch (error) {
    console.error("[experience-character] image generation failed:", error);
    return NextResponse.json(
      { error: "Character generation could not finish. Please retry." },
      { status: 502 },
    );
  }

  if (!generatedFileId) {
    return NextResponse.json(
      { error: "The image generator did not return an artwork file." },
      { status: 422 },
    );
  }

  try {
    const content = await connection.client.files.content(generatedFileId, {
      agentId: connection.profile.agentId,
      includeImageUrls: true,
      includeDownloadUrl: true,
      maxChars: 1,
    });
    const sourceUrl =
      content.data.downloadUrl || content.data.imageUrls?.[0];
    if (!sourceUrl) {
      throw new Error("Generated image URL is unavailable.");
    }
    const source = await fetch(sourceUrl);
    if (!source.ok) {
      throw new Error("Generated image could not be downloaded.");
    }
    const mimeType = source.headers.get("content-type") || "image/png";
    if (!mimeType.startsWith("image/")) {
      throw new Error("Generated artifact is not an image.");
    }
    const data = Buffer.from(await source.arrayBuffer());
    if (!data.length || data.length > 12 * 1024 * 1024) {
      throw new Error("Generated image has an unsupported size.");
    }
    const url = await uploadCourseMediaToS3({
      file: {
        name: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "character"}.png`,
        type: mimeType,
      },
      data,
      keyPrefix: `experience-assets/${String(access.project._id)}/characters`,
    });
    return NextResponse.json({
      url,
      sourceFileId: generatedFileId,
    });
  } catch (error) {
    console.error("[experience-character] asset persistence failed:", error);
    return NextResponse.json(
      {
        error:
          "The artwork was generated, but it could not be copied into course media.",
      },
      { status: 502 },
    );
  }
}
