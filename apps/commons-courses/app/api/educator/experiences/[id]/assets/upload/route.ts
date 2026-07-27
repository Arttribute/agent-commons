import { NextRequest, NextResponse } from "next/server";
import { requireEducatorExperience } from "@/lib/experience-access";
import {
  createCourseMediaUpload,
  isS3MediaStorageConfigured,
} from "@/lib/media-storage";
import type { ExperienceAssetKind } from "@/types/experience";

const limits: Record<ExperienceAssetKind, number> = {
  image: 20 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  audio: 80 * 1024 * 1024,
  model3d: 100 * 1024 * 1024,
};

const allowedTypes: Record<ExperienceAssetKind, Set<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  video: new Set(["video/mp4", "video/webm"]),
  audio: new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"]),
  model3d: new Set(["model/gltf-binary", "model/gltf+json", "application/octet-stream"]),
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireEducatorExperience(id);
  if (!access.ok) return access.error;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    type?: string;
    size?: number;
    kind?: ExperienceAssetKind;
  };
  const kind = body.kind;
  const name = body.name?.trim().slice(0, 240);
  const type = body.type?.trim().toLowerCase();
  const size = Number(body.size);
  if (!kind || !name || !type || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: "File name, media type, size, and asset kind are required." },
      { status: 400 },
    );
  }
  if (!allowedTypes[kind]?.has(type)) {
    return NextResponse.json(
      {
        error:
          kind === "model3d"
            ? "Upload a GLB or glTF model."
            : `This ${kind} format is not supported.`,
      },
      { status: 400 },
    );
  }
  if (size > limits[kind]) {
    return NextResponse.json(
      { error: `${kind} files must be smaller than ${Math.round(limits[kind] / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }
  if (!isS3MediaStorageConfigured()) {
    return NextResponse.json(
      { error: "Course media storage is not configured." },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(
      await createCourseMediaUpload({
        fileName: name,
        contentType: type,
        keyPrefix: `experience-assets/${String(access.project._id)}/uploads/${kind}`,
      }),
    );
  } catch (error) {
    console.error("[experience-assets] could not create upload:", error);
    return NextResponse.json(
      { error: "A secure upload could not be prepared." },
      { status: 502 },
    );
  }
}
