import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import nextEnv from "@next/env";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(appRoot);

const bucket = process.env.COURSE_MEDIA_S3_BUCKET;
const region = process.env.COURSE_MEDIA_S3_REGION;
const publicBaseUrl =
  process.env.COURSE_MEDIA_CDN_URL || process.env.COURSE_MEDIA_PUBLIC_URL;
const mongoUri = process.env.MONGODB_URI;

const localAssetDir =
  process.env.AI_FLUENCY_ASSET_DIR ||
  "/Users/bashybaranaba/Downloads/Copy of Commons-Education";

const assets = [
  {
    role: "course-cover",
    filename: "1.png",
    dbFields: ["imageUrl", "bannerImageUrl", "previewImageUrl"],
  },
  { challengeId: "sense-of-ai", lessonId: "sense-of-ai", filename: "2.png" },
  { challengeId: "llms-vs-agents", lessonId: "llms-vs-agents", filename: "3.png" },
  { challengeId: "core-loop", lessonId: "core-loop", filename: "4.png" },
  {
    challengeId: "memory-workflows",
    lessonId: "memory-workflows",
    filename: "5.png",
  },
  { challengeId: "apis-mcp", lessonId: "apis-mcp", filename: "6.png" },
  {
    challengeId: "what-agents-can-do",
    lessonId: "what-agents-can-do",
    filename: "7.png",
  },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  assertConfigured();

  const client = new S3Client({ region });
  const uploaded = new Map();

  for (const asset of assets) {
    const key = `course-media/ai-fluency-starter/${asset.filename}`;
    const filePath = path.join(localAssetDir, asset.filename);
    const data = await readFile(filePath);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const url = `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
    uploaded.set(asset.filename, url);
    console.log(`uploaded ${asset.filename} -> ${url}`);
  }

  await mongoose.connect(mongoUri);
  const courses = mongoose.connection.collection("courses");
  const course = await courses.findOne({ slug: "ai-fluency-starter" });
  if (!course) throw new Error("Course not found: ai-fluency-starter");

  const cover = uploaded.get("1.png");
  const assetByChallengeId = new Map(
    assets
      .filter((asset) => asset.challengeId)
      .map((asset) => [asset.challengeId, uploaded.get(asset.filename)])
  );

  const challenges = course.skillPack.challenges.map((challenge) => ({
    ...challenge,
    assetUrl: assetByChallengeId.get(challenge.id) || challenge.assetUrl,
  }));

  const assetByLessonId = new Map(
    assets
      .filter((asset) => asset.lessonId)
      .map((asset) => [asset.lessonId, uploaded.get(asset.filename)])
  );
  const lessonAssetUrls = assets
    .filter((asset) => asset.lessonId)
    .map((asset) => uploaded.get(asset.filename));

  const modules = course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson, index) => ({
      ...lesson,
      assetUrl:
        assetByLessonId.get(lesson.id) ||
        lessonAssetUrls[index] ||
        lesson.assetUrl,
    })),
  }));

  const result = await courses.updateOne(
    { slug: "ai-fluency-starter" },
    {
      $set: {
        imageUrl: cover,
        bannerImageUrl: cover,
        previewImageUrl: cover,
        "skillPack.challenges": challenges,
        modules,
      },
    }
  );

  console.log(
    JSON.stringify(
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        course: "ai-fluency-starter",
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

function assertConfigured() {
  const missing = [];
  if (!mongoUri) missing.push("MONGODB_URI");
  if (!bucket) missing.push("COURSE_MEDIA_S3_BUCKET");
  if (!region) missing.push("COURSE_MEDIA_S3_REGION");
  if (!publicBaseUrl) {
    missing.push("COURSE_MEDIA_CDN_URL or COURSE_MEDIA_PUBLIC_URL");
  }
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
