import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import JSZip from "jszip";
import mongoose, { mongo } from "mongoose";

const execFileAsync = promisify(execFile);
const apiRequire = createRequire(
  new URL("../../commons-api/package.json", import.meta.url),
);
const materialId = "6a7d938993daf891cb967bd9";
const sessionId = "6a7d76665ca03a4a097ff615";
const sourcePath = process.argv.slice(2).find((value) => !value.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const previewArg = process.argv.find((value) => value.startsWith("--preview-dir="));
const previewDir = previewArg?.slice("--preview-dir=".length);

if (!sourcePath || !process.env.MONGODB_URI) {
  console.error(
    "Usage: MONGODB_URI=… node scripts/replace-moringa-presentation.mjs DECK.pptx [--dry-run] [--preview-dir=PATH]",
  );
  process.exit(1);
}

const source = await readFile(sourcePath);
const { textPreview, slideCount } = await extractPresentationText(source);
const workDir = await mkdtemp(path.join(os.tmpdir(), "moringa-deck-"));

try {
  const slides = await renderPresentation(source, sourcePath, workDir);
  if (slides.length !== slideCount) {
    throw new Error(
      `Rendered ${slides.length} slides, but the PowerPoint contains ${slideCount}.`,
    );
  }
  if (previewDir) {
    await mkdir(previewDir, { recursive: true });
    for (const index of [0, slides.length - 1]) {
      await writeFile(
        path.join(previewDir, `slide-${index + 1}.png`),
        slides[index],
      );
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection is unavailable.");
    const objectId = new mongoose.Types.ObjectId(materialId);
    const material = await db.collection("coursematerials").findOne({ _id: objectId });
    if (!material) throw new Error("The Moringa course material was not found.");
    if (String(material.ownerUserId) !== "6a057f5b3aaf94d0be1275cb") {
      throw new Error("The Moringa presentation is not owned by the expected educator account.");
    }

    if (!dryRun) {
      const bucket = new mongo.GridFSBucket(db, { bucketName: "courseMaterials" });
      const newIds = [];
      let committed = false;
      try {
        const originalId = await upload(
          bucket,
          source,
          path.basename(sourcePath),
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        );
        newIds.push(originalId);
        const slideIds = [];
        for (const [index, bytes] of slides.entries()) {
          const id = await upload(
            bucket,
            bytes,
            `slide-${index + 1}.png`,
            "image/png",
          );
          newIds.push(id);
          slideIds.push(id);
        }
        const result = await db.collection("coursematerials").updateOne(
          { _id: objectId },
          {
            $set: {
              name: path.basename(sourcePath),
              mimeType:
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              size: source.length,
              storage: "gridfs",
              gridFsId: originalId,
              slideGridFsIds: slideIds,
              textPreview,
              status: "ready",
              updatedAt: new Date(),
            },
          },
        );
        if (result.modifiedCount !== 1) throw new Error("The material replacement did not save.");
        committed = true;
        const oldIds = [material.gridFsId, ...(material.slideGridFsIds || [])].filter(Boolean);
        await Promise.allSettled(oldIds.map((id) => bucket.delete(id)));
        await db.collection("livesessions").updateOne(
          { _id: new mongoose.Types.ObjectId(sessionId) },
          { $inc: { stateVersion: 1 }, $set: { updatedAt: new Date() } },
        );
      } catch (error) {
        if (!committed) {
          const bucket = new mongo.GridFSBucket(db, { bucketName: "courseMaterials" });
          await Promise.allSettled(newIds.map((id) => bucket.delete(id)));
        }
        throw error;
      }
    }

    console.log(
      JSON.stringify(
        {
          materialId,
          file: path.basename(sourcePath),
          bytes: source.length,
          slides: slides.length,
          ownerUserId: String(material.ownerUserId),
          dryRun,
          previewDir: previewDir || undefined,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}

async function renderPresentation(bytes, originalName, workDir) {
  const inputPath = path.join(workDir, path.basename(originalName));
  const outputDir = path.join(workDir, "output");
  const profileDir = path.join(workDir, "profile");
  await Promise.all([
    writeFile(inputPath, bytes),
    mkdir(outputDir, { recursive: true }),
    mkdir(profileDir, { recursive: true }),
  ]);
  await execFileAsync(
    process.env.LIBREOFFICE_BINARY || "/opt/homebrew/bin/soffice",
    [
      "--headless",
      "--nologo",
      "--nolockcheck",
      "--nodefault",
      "--norestore",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "pdf:impress_pdf_Export",
      "--outdir",
      outputDir,
      inputPath,
    ],
    { timeout: 180_000, maxBuffer: 2 * 1024 * 1024 },
  );
  const pdfPath = path.join(outputDir, `${path.parse(inputPath).name}.pdf`);
  const pdfBytes = await readFile(pdfPath);
  const pdfjsPath = apiRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsRoot = path.dirname(apiRequire.resolve("pdfjs-dist/package.json"));
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const canvasModule = await import(
    pathToFileURL(apiRequire.resolve("@napi-rs/canvas")).href
  );
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    disableWorker: true,
    useSystemFonts: false,
    standardFontDataUrl: `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`,
    cMapUrl: `${path.join(pdfjsRoot, "cmaps")}${path.sep}`,
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const slides = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1920 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = canvasModule.createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    slides.push(canvas.toBuffer("image/png"));
  }
  await loadingTask.destroy?.();
  return slides;
}

async function extractPresentationText(bytes) {
  const archive = await JSZip.loadAsync(bytes);
  const slideFiles = Object.values(archive.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort(
      (a, b) =>
        Number(a.name.match(/\d+/)?.[0]) - Number(b.name.match(/\d+/)?.[0]),
    );
  const sections = [];
  for (const slide of slideFiles) {
    const xml = await slide.async("string");
    if (/<p:sld[^>]*\bshow="0"/.test(xml)) continue;
    const lines = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
      .map((match) => decodeXml(match[1]).trim())
      .filter(Boolean);
    sections.push(`--- Slide ${sections.length + 1} ---\n${lines.join("\n")}`);
  }
  return { textPreview: sections.join("\n\n"), slideCount: sections.length };
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
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
