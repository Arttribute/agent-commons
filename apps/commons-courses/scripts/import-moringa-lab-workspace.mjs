import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import JSZip from "jszip";
import mongoose, { mongo } from "mongoose";

const mongoUri = process.env.MONGODB_URI;
const sourcePath = process.argv[2];
const learnerPath = process.argv[3];
const ownerEmail = "bashybaranaba@gmail.com";
const courseSlug = "claude-skills-for-everyday-work-moringa";
const liveSessionId = "6a7d76665ca03a4a097ff615";
const workspaceTitle =
  "Claude Skills for Everyday Work · Moringa lab workspace";
const practicalActivityPattern =
  /setup|lab\s*\d|gallery|build a skill|work safely|first-week plan/i;

if (!mongoUri || !sourcePath || !learnerPath) {
  console.error(
    "Usage: MONGODB_URI=… node scripts/import-moringa-lab-workspace.mjs FULL.zip LEARNER.zip",
  );
  process.exit(1);
}

await mongoose.connect(mongoUri);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");
  const owner = await db.collection("users").findOne({ email: ownerEmail });
  const course = await db.collection("courses").findOne({ slug: courseSlug });
  if (!owner) throw new Error(`Owner not found: ${ownerEmail}`);
  if (!course) throw new Error(`Course not found: ${courseSlug}`);

  let workspace = await db.collection("labworkspaces").findOne({
    courseId: course._id,
    title: workspaceTitle,
  });
  if (!workspace) {
    const sourceBytes = await fs.readFile(sourcePath);
    const learnerBytes = await fs.readFile(learnerPath);
    const archive = await JSZip.loadAsync(sourceBytes, { checkCRC32: true });
    const entries = Object.values(archive.files).filter(
      (entry) =>
        !entry.dir &&
        !entry.name.startsWith("__MACOSX/") &&
        !entry.name.endsWith("/.DS_Store"),
    );
    const commonRoot = findCommonRoot(entries.map((entry) => entry.name));
    const expanded = await Promise.all(
      entries.map(async (entry) => ({
        path: commonRoot ? entry.name.slice(commonRoot.length + 1) : entry.name,
        bytes: Buffer.from(await entry.async("uint8array")),
      })),
    );
    const manifestFile = expanded.find(
      (file) => file.path.toLowerCase() === "lab_asset_manifest.csv",
    );
    const manifest = manifestFile
      ? parseManifest(manifestFile.bytes.toString("utf8"))
      : new Map();
    const bucket = new mongo.GridFSBucket(db, { bucketName: "labWorkspaces" });
    const uploadedIds = [];
    try {
      const sourcePackGridFsId = await upload(
        bucket,
        sourceBytes,
        path.basename(sourcePath),
        "application/zip",
      );
      uploadedIds.push(sourcePackGridFsId);
      const learnerPackGridFsId = await upload(
        bucket,
        learnerBytes,
        path.basename(learnerPath),
        "application/zip",
      );
      uploadedIds.push(learnerPackGridFsId);
      const files = [];
      for (const file of expanded) {
        const metadata = manifest.get(file.path.toLowerCase());
        const audience =
          metadata?.audience ||
          (file.path.toLowerCase().startsWith("facilitator/")
            ? "facilitator"
            : "learner");
        const mimeType = mimeFor(file.path);
        const editable =
          (mimeType.startsWith("text/") ||
            /\.(md|json|ya?ml)$/i.test(file.path)) &&
          file.bytes.length <= 250 * 1024;
        const gridFsId = await upload(
          bucket,
          file.bytes,
          path.posix.basename(file.path),
          mimeType,
        );
        uploadedIds.push(gridFsId);
        files.push({
          id: crypto.randomUUID(),
          path: file.path,
          name: path.posix.basename(file.path),
          mimeType,
          size: file.bytes.length,
          audience,
          purpose: metadata?.purpose,
          editable,
          preview: editable ? file.bytes.toString("utf8") : undefined,
          gridFsId,
        });
      }
      const now = new Date();
      const document = {
        courseId: course._id,
        courseSlug,
        ownerUserId: owner._id,
        title: workspaceTitle,
        description:
          "All workshop source files in one private, structured workspace. Open text sources here or download the complete learner pack for Claude Cowork and desktop apps.",
        instructions:
          "Start with README.md. Download the learner pack when a lab asks you to work in Claude Cowork. Your browser working copies stay on this device; facilitator references are never included.",
        visibility: "live",
        sourceFileName: path.basename(sourcePath),
        sourcePackGridFsId,
        sourcePackSize: sourceBytes.length,
        learnerPackGridFsId,
        learnerPackSize: learnerBytes.length,
        files,
        createdAt: now,
        updatedAt: now,
      };
      const inserted = await db.collection("labworkspaces").insertOne(document);
      workspace = { _id: inserted.insertedId, ...document };
    } catch (error) {
      await Promise.allSettled(uploadedIds.map((id) => bucket.delete(id)));
      throw error;
    }
  }

  const sessionObjectId = new mongoose.Types.ObjectId(liveSessionId);
  const session = await db
    .collection("livesessions")
    .findOne({ _id: sessionObjectId });
  if (!session) throw new Error(`Live session not found: ${liveSessionId}`);
  const activities = (session.activities || []).map((activity) =>
    practicalActivityPattern.test(activity.title || "")
      ? { ...activity, labWorkspaceId: String(workspace._id) }
      : activity,
  );
  await db.collection("livesessions").updateOne(
    { _id: sessionObjectId },
    {
      $set: { activities, updatedAt: new Date() },
      $inc: { stateVersion: 1 },
    },
  );

  const modules = (course.modules || []).map((module, index) =>
    index === 0
      ? {
          ...module,
          lessons: [
            ...(module.lessons || []).filter(
              (lesson) => lesson.title !== "Moringa workshop lab workspace",
            ),
            {
              title: "Moringa workshop lab workspace",
              duration: "Use throughout the day",
              description:
                "<p>Open the structured source files for each workshop lab, keep editable working copies in your browser, or download the learner pack for Claude Cowork.</p>",
              labWorkspaceId: String(workspace._id),
              isFree: false,
            },
          ],
        }
      : module,
  );
  await db.collection("courses").updateOne(
    { _id: course._id },
    {
      $set: {
        modules,
        modulesCount: modules.length,
        lessonsCount: modules.reduce(
          (total, module) => total + (module.lessons || []).length,
          0,
        ),
        updatedAt: new Date(),
      },
    },
  );
  const attached = activities.filter(
    (activity) => activity.labWorkspaceId === String(workspace._id),
  );
  console.log(
    JSON.stringify(
      {
        workspaceId: String(workspace._id),
        files: workspace.files.length,
        learnerFiles: workspace.files.filter(
          (file) => file.audience === "learner",
        ).length,
        facilitatorFiles: workspace.files.filter(
          (file) => file.audience === "facilitator",
        ).length,
        attachedActivities: attached.map((activity) => activity.title),
      },
      null,
      2,
    ),
  );
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
function findCommonRoot(paths) {
  const roots = new Set(paths.map((item) => item.split("/")[0]));
  return roots.size === 1 && paths.every((item) => item.includes("/"))
    ? [...roots][0]
    : undefined;
}
function parseManifest(value) {
  const rows = parseCsv(value);
  const headers = rows.shift().map((cell) => cell.trim().toLowerCase());
  const pathIndex = headers.indexOf("path");
  const audienceIndex = headers.indexOf("audience");
  const purposeIndex = headers.indexOf("purpose");
  const result = new Map();
  for (const row of rows) {
    const entryPath = row[pathIndex]?.trim().toLowerCase();
    if (entryPath)
      result.set(entryPath, {
        audience:
          row[audienceIndex]?.trim().toLowerCase() === "facilitator"
            ? "facilitator"
            : "learner",
        purpose: row[purposeIndex]?.trim() || undefined,
      });
  }
  return result;
}
function parseCsv(value) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '"') {
      if (quoted && value[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && value[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function mimeFor(filePath) {
  const extension = path.posix.extname(filePath).toLowerCase();
  return (
    {
      ".md": "text/markdown; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".pdf": "application/pdf",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    }[extension] || "application/octet-stream"
  );
}
