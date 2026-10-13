// Usage: node --env-file=<private env> --experimental-strip-types
// scripts/prepare-course-certificates.mjs --course=<slug> --owner=<email>
// --zip=<path> --manifest=<path> --period="August 2026" [--apply]
// Manifest: [{ name, email, filename, accountName? }]. Never sends email or awards.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import JSZip from "jszip";
import Certificate from "../models/Certificate.ts";
import { certificateFilename, validateCertificatePdf } from "../lib/certificate-policy.ts";

const options = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
  const index = arg.indexOf("=");
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
const apply = process.argv.includes("--apply");
for (const key of ["course", "owner", "zip", "manifest"]) {
  if (!options[key]) throw new Error(`--${key}= is required.`);
}
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
const manifest = JSON.parse(await readFile(options.manifest, "utf8"));
if (!Array.isArray(manifest) || !manifest.length || manifest.length > 30) throw new Error("Manifest must contain 1 to 30 participants.");
const zip = await JSZip.loadAsync(await readFile(options.zip));
const names = new Set();
const files = new Set();
for (const item of manifest) {
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 160 ||
      typeof item.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) || typeof item.filename !== "string") {
    throw new Error("Each participant needs a name, email and exact ZIP filename.");
  }
  item.email = item.email.trim().toLowerCase();
  if (names.has(item.email) || files.has(item.filename)) throw new Error("Duplicate participant or PDF in manifest.");
  names.add(item.email); files.add(item.filename);
}
const pdfFiles = Object.values(zip.files).filter((file) => !file.dir && file.name.toLowerCase().endsWith(".pdf"));
if (pdfFiles.length !== manifest.length || pdfFiles.some((file) => !files.has(file.name))) throw new Error("Every PDF must be assigned exactly once.");

await mongoose.connect(process.env.MONGODB_URI);
try {
  const db = mongoose.connection.db;
  const [course, owner] = await Promise.all([
    db.collection("courses").findOne({ slug: options.course }),
    db.collection("users").findOne({ email: options.owner.toLowerCase() }),
  ]);
  if (!course || !owner || String(course.educator?.userId) !== String(owner._id)) throw new Error("Course and owner must match.");
  const drafts = [];
  // Validate the entire batch before writing any document.
  for (const item of manifest) {
    const user = await db.collection("users").findOne({ email: item.email });
    if (!user || user.name !== (item.accountName || item.name)) throw new Error(`Account name mismatch for ${item.name}.`);
    const enrollment = await db.collection("enrollments").findOne({ courseId: course._id, userId: user._id, status: { $ne: "cancelled" } });
    if (!enrollment) throw new Error(`${item.name} is not enrolled in this course.`);
    const pdf = await zip.file(item.filename).async("nodebuffer");
    validateCertificatePdf(pdf);
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const existing = await Certificate.findOne({ courseId: course._id, userId: user._id });
    if (existing && (existing.sha256 !== sha256 || existing.recipientName !== item.name || existing.recipientEmail !== item.email || existing.completionPeriod !== (options.period || ""))) {
      throw new Error(`${item.name} already has a different certificate. Review it before replacing it.`);
    }
    drafts.push({ courseId: course._id, userId: user._id, preparedBy: owner._id, recipientName: item.name, recipientEmail: item.email,
      completionPeriod: options.period || "", filename: certificateFilename(item.filename.split("/").at(-1)), pdf, sha256, existing });
  }
  if (apply) {
    await Certificate.init();
    for (const draft of drafts) {
      const { existing, ...data } = draft;
      if (!existing) await Certificate.updateOne({ courseId: data.courseId, userId: data.userId }, { $setOnInsert: { ...data, emailStatus: "ready" } }, { upsert: true, runValidators: true });
    }
  }
  console.log(JSON.stringify({ dryRun: !apply, course: course.title, completionPeriod: options.period || "", awardsIssued: 0, emailsSent: 0,
    certificates: drafts.map(({ recipientName, recipientEmail, filename, sha256, existing }) => ({ recipientName, recipientEmail, filename, sha256, status: existing?.emailStatus || "ready" })),
    reviewUrl: `https://commonlab.agentcommons.io/educator/courses/${course.slug}/certificates`,
  }, null, 2));
} finally { await mongoose.disconnect(); }
