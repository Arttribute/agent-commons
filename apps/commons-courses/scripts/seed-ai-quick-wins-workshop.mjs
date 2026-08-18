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
const slug = "ai-quick-wins-for-leaders";
const ownerEmail = "bashybaranaba@gmail.com";
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const previewDir = argument("preview-dir");
let cachedPdfTools;
const inputs = {
  deck: requiredArgument("deck"),
  workbook: requiredArgument("workbook"),
  cards: requiredArgument("cards"),
  guide: requiredArgument("guide"),
};

if (!dryRun && !process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required.");
}

await main();

async function main() {
const workDir = await mkdtemp(path.join(os.tmpdir(), "quick-wins-workshop-"));
try {
  const assets = await prepareAssets(inputs, workDir);
  if (previewDir) await writePreviews(assets.deck.pages, previewDir);
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun,
          files: Object.values(assets).map((asset) => ({
            name: asset.name,
            bytes: asset.bytes.length,
            pages: asset.pages.length,
            visibility: asset.visibility,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection is unavailable.");
    const owner = await db.collection("users").findOne({ email: ownerEmail });
    if (!owner) throw new Error(`Owner not found: ${ownerEmail}`);
    const principalId = owner.identityUserId;
    if (!principalId) {
      throw new Error(`${ownerEmail} is not connected to Commons Identity.`);
    }
    const profile = await db
      .collection("educatorprofiles")
      .findOne({ userId: owner._id });
    const sourceCourse = await db.collection("courses").findOne({
      slug: "claude-skills-for-everyday-work-moringa",
    });
    const now = new Date();
    const course = await upsertCourse(db, {
      owner,
      profile,
      agents: sourceCourse?.agents || [],
      now,
    });

    const existingSession = await db.collection("livesessions").findOne({
      courseId: course._id,
      title: "Day 1 · Discover — AI Quick Wins for Leaders",
    });
    if (existingSession && existingSession.status !== "draft" && !force) {
      throw new Error(
        "The Day 1 session has already been opened. Re-run with --force only if replacing its plan is intentional.",
      );
    }

    const commonsFiles = await uploadToCommonsLibrary(
      Object.values(assets),
      principalId,
      owner.identityWorkspaceId,
    );
    const bucket = new mongo.GridFSBucket(db, {
      bucketName: "courseMaterials",
    });
    const materialByKey = {};
    for (const asset of Object.values(assets)) {
      materialByKey[asset.key] = await syncMaterial({
        db,
        bucket,
        course,
        owner,
        principalId,
        asset,
        commonsFile: commonsFiles.get(asset.key),
        now,
      });
    }

    const joinCode =
      existingSession?.joinCode || (await createUniqueJoinCode(db));
    const activities = createDiscoverActivities(
      String(materialByKey.deck._id),
    );
    const session = await db.collection("livesessions").findOneAndUpdate(
      {
        courseId: course._id,
        title: "Day 1 · Discover — AI Quick Wins for Leaders",
      },
      {
        $set: {
          courseSlug: slug,
          description:
            "Discover the AI landscape, map the organisation, capture recurring routines, and choose the first safe task to offload.",
          joinCode,
          status: "draft",
          pace: "facilitator",
          access: "open",
          invitedEmails: [],
          activities,
          settings: {
            allowLateJoin: true,
            showParticipantNames: true,
            showLeaderboard: false,
            learnerCopilot: {
              enabled: false,
              explainCurrentActivity: true,
              coachResponses: true,
              useCourseMaterials: true,
              giveDirectExplanations: false,
            },
          },
          createdBy: owner._id,
          updatedAt: now,
        },
        $unset: { currentActivityId: "" },
        $setOnInsert: { createdAt: now },
        $inc: { stateVersion: 1 },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!session) throw new Error("Live session could not be created.");

    console.log(
      JSON.stringify(
        {
          owner: owner.email,
          course: {
            id: String(course._id),
            slug: course.slug,
            visibility: course.catalogVisibility,
          },
          liveSession: {
            id: String(session._id),
            joinCode: session.joinCode,
            activities: session.activities.length,
            access: session.access,
          },
          materials: Object.fromEntries(
            Object.entries(materialByKey).map(([key, value]) => [
              key,
              {
                id: String(value._id),
                name: value.name,
                visibility: value.visibility,
                fileId: value.fileId,
              },
            ]),
          ),
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
}

async function upsertCourse(db, { owner, profile, agents, now }) {
  return db.collection("courses").findOneAndUpdate(
    { slug },
    {
      $set: {
        title: "AI Quick Wins for Leaders",
        tagline:
          "Take one real workflow from discovery to a safe, connected AI system.",
        description:
          "A four-part, facilitator-led leadership programme. Day 1 maps the AI landscape and helps every participant identify, shortlist, and select a practical automation opportunity.",
        longDescription:
          "<p>AI Quick Wins for Leaders is a practical four-session programme built around one real workflow. Participants discover the opportunity, capture how the work is done, expand it into connected AI systems, and secure it for responsible use.</p>",
        price: 0,
        currency: "USD",
        isFree: true,
        courseType: "live",
        level: "beginner",
        duration: "4 sessions · 2 hours each",
        lessonsCount: 4,
        modulesCount: 4,
        instructor: "Bashy Baranaba & Jessica Colaco",
        educator: {
          userId: owner._id,
          name: profile?.displayName || owner.name,
          plan: profile?.plan || "free",
          settlementMode: profile?.settlementMode || "platform_rails",
          platformFeePercent: profile?.platformFeePercent ?? 20,
          paystackSubaccountCode: profile?.paystackSubaccountCode,
          stripeAccountId: profile?.stripeAccountId,
        },
        tags: [
          "AI leadership",
          "automation",
          "agents",
          "workflows",
          "live workshop",
        ],
        modules: [
          {
            title: "Day 1 · Discover",
            description:
              "Understand the AI landscape, capture recurring routines, and choose a safe first automation opportunity.",
            lessons: [
              {
                title: "Discover your AI quick win",
                duration: "120",
                description:
                  "Landscape, capability ladder, organisational foundations, routine capture, prioritisation, and commitment.",
                isFree: false,
              },
            ],
          },
          {
            title: "Day 2 · Capture",
            description:
              "Capture how you work and turn your know-how into reusable skills and workflows.",
            lessons: [
              {
                title: "Turn know-how into a reusable skill",
                duration: "120",
                description: "Session materials will be released for Day 2.",
                isFree: false,
              },
            ],
          },
          {
            title: "Day 3 · Expand",
            description:
              "Expand into agents, harnesses, connected AI systems, and your AI Brain.",
            lessons: [
              {
                title: "Connect the system",
                duration: "120",
                description: "Session materials will be released for Day 3.",
                isFree: false,
              },
            ],
          },
          {
            title: "Day 4 · Secure",
            description:
              "Make your AI systems safe, reliable, verifiable, and ready for responsible use.",
            lessons: [
              {
                title: "Build the safety and verification layer",
                duration: "120",
                description: "Session materials will be released for Day 4.",
                isFree: false,
              },
            ],
          },
        ],
        agents,
        published: true,
        catalogVisibility: "private",
        theme: {
          primary: "#102A2A",
          accent: "#71E0E7",
          highlight: "#B8F56D",
          background: "#F4F7F6",
          surface: "#FFFFFF",
          text: "#102A2A",
        },
        isMainFeatured: false,
        isFeatured: false,
        emailSettings: {
          welcomeEnabled: true,
          enrollmentEnabled: true,
          assignmentCreatedEnabled: true,
          assignmentUpdatedEnabled: true,
          courseUpdateEnabled: false,
          agentManaged: false,
          replyTo: owner.email,
          branding: { enabled: false },
        },
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, collaborators: [] },
    },
    { upsert: true, returnDocument: "after" },
  );
}

function createDiscoverActivities(materialId) {
  const content = (id, title, prompt, slide, minutes, extra = {}) => ({
    id,
    type: "content",
    title,
    prompt,
    materialId,
    materialStartSlide: slide,
    estimatedMinutes: minutes,
    status: "draft",
    required: false,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
    ...extra,
  });
  return [
    content(
      "discover-welcome",
      "Welcome: one workflow, four transformations",
      "Meet the facilitators, understand the four-day journey, and see what you will leave with.",
      1,
      4,
      {
        facilitatorNotes:
          "Set the promise and the boundary together: this is a build, not a tour of tools.",
      },
    ),
    {
      ...content(
        "discover-outcome-contract",
        "Your outcome contract",
        "By the end of Day 4, what will you be able to do—and what observable evidence will prove it worked?",
        8,
        5,
      ),
      type: "reflection",
      instructions:
        "Complete both halves in one sentence. Make the outcome observable enough that a colleague could tell whether it happened.",
      successCriteria:
        "Your sentence names a changed action and evidence you could actually observe.",
      required: true,
    },
    content(
      "discover-reality-check",
      "The reality check",
      "AI adoption is widespread. Reliable value capture is not. These numbers show why leadership and organisational design matter.",
      9,
      7,
    ),
    content(
      "discover-building-blocks",
      "The building blocks of agentic AI",
      "Place models, skills, tools, workflows, schedules, and connections on one practical map.",
      14,
      20,
    ),
    {
      id: "discover-ladder-check",
      type: "poll",
      title: "Where are you on the Capability Ladder?",
      prompt: "Choose the highest rung that describes how you work today.",
      instructions:
        "Choose honestly. This is a starting point, not a score, and we will revisit it on Day 4.",
      materialId,
      materialStartSlide: 20,
      estimatedMinutes: 4,
      status: "draft",
      required: true,
      randomizeOptions: false,
      showResults: true,
      responseStyle: "cards",
      points: 0,
      options: [
        ["rung-0", "0 · Prompt"],
        ["rung-1", "1 · Skill"],
        ["rung-2", "2 · Workflow"],
        ["rung-3", "3 · Scheduled task"],
        ["rung-4", "4 · Harness"],
        ["rung-5", "5 · Meta harness"],
        ["rung-6", "6 · Company brain"],
      ].map(([id, label]) => ({ id, label, isCorrect: false })),
    },
    content(
      "discover-live-build",
      "Live build: the daily email triage",
      "Watch one ordinary task climb from a prompt to a reusable skill, connected workflow, and scheduled task.",
      21,
      20,
      {
        facilitatorNotes:
          "Bashy drives; Jessica narrates the business meaning. Do not teach the clicks.",
      },
    ),
    content(
      "discover-foundations",
      "AI in your organisation",
      "Audit the four foundations: knowledge, tools, procedures, and rules.",
      24,
      15,
      {
        instructions:
          "As a group, capture where organisational knowledge lives and which systems the organisation actually runs.",
      },
    ),
    {
      ...content(
        "discover-tool-trust",
        "Tool and trust inventory",
        "Where are you already using AI—and where has trust broken down?",
        31,
        5,
      ),
      type: "reflection",
      instructions:
        "Name one thing you tried and gave up on, then identify context you repeatedly paste into an AI tool. Repeated context is often a reusable skill waiting to be written.",
      required: true,
    },
    {
      id: "discover-routine-shortlist",
      type: "prioritization",
      title: "Routine storm: what repeats in your week?",
      prompt:
        "Capture as many recurring routines as you can, then shortlist the ones you would most like to automate or offload.",
      instructions:
        "Think across meetings, reporting, communication, approvals, research, follow-up, planning, data entry, and coordination. Keep each routine short and specific. Quantity first; selection second.",
      successCriteria:
        "You have at least five real routines and a shortlist of up to three automation candidates.",
      facilitatorNotes:
        "Give the room three silent minutes for quantity, then ask them to shortlist. If someone stalls, ask what they did three times last week.",
      materialId,
      materialStartSlide: 32,
      estimatedMinutes: 12,
      status: "draft",
      required: true,
      randomizeOptions: false,
      showResults: false,
      entryLabel: "Add a routine you repeat",
      selectionPrompt:
        "Choose up to three routines you would feel relieved to automate or offload.",
      minItems: 5,
      maxSelections: 3,
      points: 0,
      options: [],
    },
    {
      ...content(
        "discover-pair-interview",
        "Pair interview: unpack one real routine",
        "Interview your partner about one shortlisted routine and surface the judgment hidden inside it.",
        33,
        18,
      ),
      type: "task",
      instructions:
        "The interviewer asks and writes. Focus especially on decisions, exceptions, the quality bar, and anything described as ‘I just know’. Add a concise note capturing the most important hidden decision or exception you uncovered.",
      successCriteria:
        "You can name the steps, at least one decision point, one exception, and what good looks like.",
      required: true,
    },
    {
      ...content(
        "discover-final-choice",
        "Choose the first task to offload",
        "Score your shortlisted routines and name the first one you will carry through all four days.",
        35,
        10,
      ),
      type: "reflection",
      instructions:
        "Consider frequency, time cost, repeatability, verifiability, reversibility, data access, and judgment density. For a first build, favour something easy to verify and easy to reverse.",
      successCriteria:
        "Name one task in six words or fewer and explain why it is a safe, useful first build.",
      required: true,
    },
    {
      ...content(
        "discover-recording-commitment",
        "Your recording commitment",
        "What will you record before Day 2, and by when?",
        36,
        8,
      ),
      type: "task",
      instructions:
        "Write: ‘I am recording ___ by ___.’ Record one full run with your voice, narrating decisions rather than clicks. Add any support you need before you begin.",
      successCriteria:
        "The task and deadline are explicit enough to read aloud to the room.",
      required: true,
    },
    content(
      "discover-close",
      "Close and next step",
      "Day 2 turns your recording into a reusable skill file that can run consistently.",
      37,
      2,
    ),
  ];
}

async function prepareAssets(source, workDir) {
  const deckBytes = await readFile(source.deck);
  const deckPdf = await convertToPdf(source.deck, workDir, "deck");
  const deckPages = await renderPdfPages(deckPdf);
  const deckText = await extractPresentationText(deckBytes);
  const documentDefinitions = [
    ["workbook", source.workbook, "Session 1 Participant Workbook.pdf", "course"],
    ["cards", source.cards, "Session 1 Reference Cards.pdf", "course"],
    ["guide", source.guide, "Session 1 Facilitator Guide.pdf", "educator"],
  ];
  const assets = {
    deck: {
      key: "deck",
      name: path.basename(source.deck),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "presentation",
      visibility: "course",
      bytes: deckBytes,
      pages: deckPages,
      textPreview: deckText,
    },
  };
  for (const [key, sourcePath, name, visibility] of documentDefinitions) {
    const pdf = await convertToPdf(sourcePath, workDir, key);
    assets[key] = {
      key,
      name,
      mimeType: "application/pdf",
      kind: "pdf",
      visibility,
      bytes: pdf,
      pages: [],
      textPreview: await extractPdfText(pdf),
    };
  }
  return assets;
}

async function convertToPdf(sourcePath, workDir, prefix) {
  const inputDir = path.join(workDir, `${prefix}-input`);
  const outputDir = path.join(workDir, `${prefix}-output`);
  const profileDir = path.join(workDir, `${prefix}-profile`);
  await Promise.all([
    mkdir(inputDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
    mkdir(profileDir, { recursive: true }),
  ]);
  const inputPath = path.join(inputDir, path.basename(sourcePath));
  await writeFile(inputPath, await readFile(sourcePath));
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
      path.extname(sourcePath).toLowerCase() === ".pptx"
        ? "pdf:impress_pdf_Export"
        : "pdf:writer_pdf_Export",
      "--outdir",
      outputDir,
      inputPath,
    ],
    { timeout: 180_000, maxBuffer: 2 * 1024 * 1024 },
  );
  const outputPath = path.join(outputDir, `${path.parse(inputPath).name}.pdf`);
  return readFile(outputPath);
}

async function renderPdfPages(bytes) {
  const { pdfjs, canvasModule, root } = await pdfTools();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useSystemFonts: false,
    standardFontDataUrl: `${path.join(root, "standard_fonts")}${path.sep}`,
    cMapUrl: `${path.join(root, "cmaps")}${path.sep}`,
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1920 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = canvasModule.createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    pages.push(canvas.toBuffer("image/png"));
  }
  await loadingTask.destroy?.();
  return pages;
}

async function extractPdfText(bytes) {
  const { pdfjs } = await pdfTools();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const sections = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    sections.push(`--- Page ${pageNumber} ---\n${text}`);
  }
  await loadingTask.destroy?.();
  return sections.join("\n\n");
}

async function pdfTools() {
  if (!cachedPdfTools) {
    const pdfjsPath = apiRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    const root = path.dirname(apiRequire.resolve("pdfjs-dist/package.json"));
    cachedPdfTools = {
      root,
      pdfjs: await import(pathToFileURL(pdfjsPath).href),
      canvasModule: await import(
        pathToFileURL(apiRequire.resolve("@napi-rs/canvas")).href
      ),
    };
  }
  return cachedPdfTools;
}

async function extractPresentationText(bytes) {
  const archive = await JSZip.loadAsync(bytes);
  const slides = Object.values(archive.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort(
      (a, b) =>
        Number(a.name.match(/\d+/)?.[0]) - Number(b.name.match(/\d+/)?.[0]),
    );
  const sections = [];
  for (const slide of slides) {
    const xml = await slide.async("string");
    if (/<p:sld[^>]*\bshow="0"/.test(xml)) continue;
    const lines = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
      .map((match) => decodeXml(match[1]).trim())
      .filter(Boolean);
    sections.push(`--- Slide ${sections.length + 1} ---\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

async function uploadToCommonsLibrary(assets, principalId, workspaceId) {
  const apiKey = process.env.AGENT_COMMONS_API_KEY;
  if (!apiKey) throw new Error("AGENT_COMMONS_API_KEY is required.");
  const form = new FormData();
  for (const asset of assets) {
    form.append(
      "files",
      new File([asset.bytes], asset.name, { type: asset.mimeType }),
      asset.name,
    );
  }
  if (workspaceId) form.append("workspaceId", String(workspaceId));
  form.append("storageProvider", "s3");
  const baseUrl = (
    process.env.AGENT_COMMONS_API_URL || "https://api.agentcommons.io"
  ).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/v1/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-initiator": String(principalId),
      "x-owner-id": String(principalId),
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.data)) {
    throw new Error(
      payload.message || "Workshop files could not be added to Commons Library.",
    );
  }
  const byName = new Map(payload.data.map((item) => [item.name, item]));
  const result = new Map();
  for (const asset of assets) {
    const item = byName.get(asset.name);
    if (!item?.fileId) {
      throw new Error(`${asset.name} was not returned by Commons Library.`);
    }
    result.set(asset.key, item);
  }
  return result;
}

async function syncMaterial({
  db,
  bucket,
  course,
  owner,
  principalId,
  asset,
  commonsFile,
  now,
}) {
  const collection = db.collection("coursematerials");
  const existing = await collection.findOne({
    courseId: course._id,
    name: asset.name,
  });
  const newIds = [];
  let committed = false;
  try {
    const originalId = await upload(
      bucket,
      asset.bytes,
      asset.name,
      asset.mimeType,
    );
    newIds.push(originalId);
    const slideIds = [];
    for (const [index, page] of asset.pages.entries()) {
      const slideId = await upload(
        bucket,
        page,
        `${asset.key}-slide-${index + 1}.png`,
        "image/png",
      );
      newIds.push(slideId);
      slideIds.push(slideId);
    }
    const material = await collection.findOneAndUpdate(
      { courseId: course._id, name: asset.name },
      {
        $set: {
          courseSlug: slug,
          ownerUserId: owner._id,
          ownerPrincipalId: String(principalId),
          fileId: commonsFile.fileId,
          storage: "gridfs",
          gridFsId: originalId,
          slideGridFsIds: slideIds,
          mimeType: asset.mimeType,
          size: asset.bytes.length,
          kind: asset.kind,
          visibility: asset.visibility,
          status: "ready",
          textPreview: asset.textPreview,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!material) throw new Error(`${asset.name} could not be saved.`);
    committed = true;
    const oldIds = [
      existing?.gridFsId,
      ...(existing?.slideGridFsIds || []),
    ].filter(Boolean);
    await Promise.allSettled(oldIds.map((id) => bucket.delete(id)));
    return material;
  } finally {
    if (!committed) await Promise.allSettled(newIds.map((id) => bucket.delete(id)));
  }
}

async function upload(bucket, bytes, filename, contentType) {
  const stream = bucket.openUploadStream(filename, {
    contentType,
    metadata: { private: true },
  });
  await new Promise((resolve, reject) =>
    Readable.from(bytes)
      .pipe(stream)
      .on("finish", resolve)
      .on("error", reject),
  );
  return stream.id;
}

async function createUniqueJoinCode(db) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100_000 + Math.random() * 900_000));
    const exists = await db.collection("livesessions").findOne({ joinCode: code });
    if (!exists) return code;
  }
  throw new Error("A unique live-session join code could not be generated.");
}

async function writePreviews(pages, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const indexes = [0, 7, 31, pages.length - 1].filter(
    (value, index, values) =>
      value >= 0 && value < pages.length && values.indexOf(value) === index,
  );
  await Promise.all(
    indexes.map((index) =>
      writeFile(path.join(targetDir, `slide-${index + 1}.png`), pages[index]),
    ),
  );
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function argument(name) {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`--${name}=PATH is required.`);
  return value;
}
