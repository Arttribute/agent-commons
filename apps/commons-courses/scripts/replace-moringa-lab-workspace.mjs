import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import JSZip from "jszip";
import mongoose, { mongo } from "mongoose";
import { parseLabArchive } from "../lib/lab-archive.ts";

const mongoUri = process.env.MONGODB_URI;
const sourcePath = process.argv[2];
const courseSlug = "claude-skills-for-everyday-work-moringa";

if (!mongoUri || !sourcePath) {
  console.error(
    "Usage: MONGODB_URI=… node --experimental-strip-types scripts/replace-moringa-lab-workspace.mjs MATERIALS.zip",
  );
  process.exit(1);
}

await mongoose.connect(mongoUri);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");
  const course = await db.collection("courses").findOne({ slug: courseSlug });
  if (!course) throw new Error(`Course not found: ${courseSlug}`);
  const workspace = await db.collection("labworkspaces").findOne({
    courseId: course._id,
  });
  if (!workspace) throw new Error("The Moringa lab workspace was not found.");

  const input = await fs.readFile(sourcePath);
  const parsed = await parseLabArchive(input);
  const sourcePack = new JSZip();
  for (const file of parsed.files) sourcePack.file(file.path, file.bytes);
  const sanitizedSource = Buffer.from(
    await sourcePack.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    }),
  );

  const bucket = new mongo.GridFSBucket(db, { bucketName: "labWorkspaces" });
  const newIds = [];
  let committed = false;
  try {
    const sourcePackGridFsId = await upload(
      bucket,
      sanitizedSource,
      path.basename(sourcePath),
      "application/zip",
    );
    newIds.push(sourcePackGridFsId);
    const learnerPackGridFsId = await upload(
      bucket,
      parsed.learnerPack,
      path.basename(sourcePath).replace(/\.zip$/i, "-learner.zip"),
      "application/zip",
    );
    newIds.push(learnerPackGridFsId);

    const files = [];
    for (const file of parsed.files) {
      const gridFsId = await upload(
        bucket,
        file.bytes,
        file.name,
        file.mimeType,
      );
      newIds.push(gridFsId);
      files.push({
        id: file.id,
        path: file.path,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        audience: file.audience,
        purpose: file.purpose,
        editable: file.editable,
        preview: file.preview,
        gridFsId,
      });
    }

    const replacement = await db.collection("labworkspaces").findOneAndUpdate(
      { _id: workspace._id },
      {
        $set: {
          title: "Zawadi workshop materials",
          description:
            "Workshop files organized from setup through planning. Open a folder, preview an artifact, or download the clean learner pack for Claude Cowork.",
          instructions:
            "Open 00 START HERE first, then complete the pre-workshop setup guide before the session. During the workshop, use the numbered folders in order.",
          sourceFileName: path.basename(sourcePath),
          sourcePackGridFsId,
          sourcePackSize: sanitizedSource.length,
          learnerPackGridFsId,
          learnerPackSize: parsed.learnerPack.length,
          files,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    if (!replacement)
      throw new Error("The workspace replacement did not save.");
    committed = true;

    const oldIds = [
      workspace.sourcePackGridFsId,
      workspace.learnerPackGridFsId,
      ...(workspace.files || []).map((file) => file.gridFsId),
    ].filter(Boolean);
    await Promise.allSettled(oldIds.map((id) => bucket.delete(id)));
    try {
      await db
        .collection("livesessions")
        .updateMany(
          { "activities.labWorkspaceId": String(workspace._id) },
          { $inc: { stateVersion: 1 }, $set: { updatedAt: new Date() } },
        );
    } catch (error) {
      console.warn(
        "The workspace was replaced, but live-session refresh failed:",
        error,
      );
    }

    console.log(
      JSON.stringify(
        {
          workspaceId: String(workspace._id),
          sourceFile: path.basename(sourcePath),
          files: replacement.files.length,
          learnerFiles: replacement.files.filter(
            (file) => file.audience === "learner",
          ).length,
          facilitatorFiles: replacement.files.filter(
            (file) => file.audience === "facilitator",
          ).length,
          paths: replacement.files.map((file) => file.path),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (!committed) {
      await Promise.allSettled(newIds.map((id) => bucket.delete(id)));
    }
    throw error;
  }
} finally {
  await mongoose.disconnect();
}

async function upload(bucket, bytes, filename, contentType) {
  const stream = bucket.openUploadStream(filename, {
    contentType,
    metadata: { private: true },
  });
  await new Promise((resolve, reject) =>
    Readable.from(bytes).pipe(stream).on("finish", resolve).on("error", reject),
  );
  return stream.id;
}
