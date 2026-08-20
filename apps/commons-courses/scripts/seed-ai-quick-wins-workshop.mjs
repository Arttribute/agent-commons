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
  cards: argument("cards"),
  guide: argument("guide"),
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
  const field = (id, label, type = "short_text", extra = {}) => ({
    id,
    label,
    type,
    required: false,
    ...extra,
  });
  const worksheet = (
    id,
    title,
    prompt,
    slide,
    minutes,
    worksheetFields,
    extra = {},
  ) => ({
    ...content(id, title, prompt, slide, minutes),
    type: "worksheet",
    required: true,
    worksheetFields,
    ...extra,
  });
  const taskCardFields = (card) => [
    field(`task-${card}-name`, "1. Task name", "short_text", {
      required: true,
      placeholder: "Six words or fewer",
      section: `Task ${card}`,
    }),
    field(`task-${card}-trigger`, "2. What triggers it?", "long_text", {
      required: true,
      section: `Task ${card}`,
    }),
    field(`task-${card}-frequency`, "3. How often, and how long does it take?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-tools`, "4. Which tools or apps are involved?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-inputs`, "5. What inputs are needed, and where do they live?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-steps`, "6. What are the steps?", "long_text", { required: true, section: `Task ${card}` }),
    field(`task-${card}-judgment`, "7. Where do you pause and think?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-exceptions`, "8. What exceptions change the process?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-quality`, "9. What separates a good result from a bad one?", "long_text", { required: true, section: `Task ${card}` }),
    field(`task-${card}-tacit`, "10. What part do you ‘just know’?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-loss`, "11. What would be lost if this were delegated?", "long_text", { section: `Task ${card}` }),
    field(`task-${card}-never`, "12. What should AI never give up?", "long_text", { section: `Task ${card}` }),
  ];
  const scoreCriteria = [
    ["frequency", "Frequency"],
    ["time", "Time cost"],
    ["repeatability", "Repeatability"],
    ["verifiability", "Verifiability"],
    ["reversibility", "Reversibility"],
    ["access", "Data access"],
    ["judgment", "Low judgment density"],
  ];
  const scorecardFields = [1, 2, 3, 4].flatMap((task) => [
    field(`score-task-${task}-name`, `Task ${task} name`, "short_text", {
      required: true,
      section: `Candidate ${task}`,
      placeholder: "Copy one of your shortlisted routines",
    }),
    ...scoreCriteria.map(([id, label]) =>
      field(`score-task-${task}-${id}`, label, "scale", {
        section: `Candidate ${task}`,
        min: 1,
        max: 5,
        lowLabel: "Low",
        highLabel: "High",
      }),
    ),
  ]);

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
    worksheet(
      "discover-outcome-contract",
      "Your outcome contract",
      "Define what will change by the end of Day 4 and how you will know it worked.",
      7,
      7,
      [
        field("outcome", "By the end of session four, I will be able to…", "long_text", { required: true, section: "Outcome contract" }),
        field("evidence", "The evidence that it worked will be…", "long_text", { required: true, section: "Outcome contract" }),
        field("signature", "Name or signature", "short_text", { section: "Outcome contract" }),
      ],
      {
        instructions:
          "Make the outcome observable enough that a colleague could tell whether it happened. Save progress at any point, then complete the section when you are ready.",
        successCriteria:
          "Your statement names a changed action and evidence you could actually observe.",
      },
    ),
    content(
      "discover-reality-check",
      "Why most AI activity does not become value",
      "Separate experimentation from reliable organisational value, and identify what has to change.",
      8,
      10,
    ),
    content(
      "discover-building-blocks",
      "The building blocks of agentic AI",
      "Place models, skills, tools, workflows, schedules, harnesses, and connections on one practical map.",
      14,
      18,
    ),
    {
      id: "discover-ladder-check",
      type: "poll",
      title: "Where are you on the Capability Ladder?",
      prompt: "Choose the highest rung that describes how you work today.",
      instructions:
        "Choose honestly. This is a starting point, not a score, and we will revisit it on Day 4.",
      materialId,
      materialStartSlide: 18,
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
      18,
      {
        facilitatorNotes:
          "Bashy drives; Jessica narrates the business meaning. Do not teach the clicks.",
      },
    ),
    worksheet(
      "discover-foundations",
      "AI in your organisation",
      "Audit the four foundations: knowledge, tools, procedures, and rules.",
      24,
      15,
      [
        field("knowledge", "Knowledge: what does the organisation need to know, and where does it live?", "long_text", { required: true, section: "Organisational foundations" }),
        field("tools", "Tools: which systems does the organisation actually use?", "long_text", { required: true, section: "Organisational foundations" }),
        field("procedures", "Procedures: where are repeatable processes written down—or only held in people’s heads?", "long_text", { required: true, section: "Organisational foundations" }),
        field("rules", "Rules: what policies, boundaries, approvals, and risks must an AI system respect?", "long_text", { required: true, section: "Organisational foundations" }),
      ],
      {
        instructions:
          "Capture your own organisation’s current state. Specific systems, documents, and unwritten rules are more useful than general statements.",
      },
    ),
    worksheet(
      "discover-tool-trust",
      "Tool and trust inventory",
      "Where are you already using AI—and where has trust broken down?",
      31,
      8,
      [
        ...[1, 2, 3, 4].flatMap((row) => [
          field(`tool-${row}`, "Tool", "short_text", { section: `Tool ${row}` }),
          field(`tool-${row}-frequency`, "How often do you use it?", "short_text", { section: `Tool ${row}` }),
          field(`tool-${row}-use`, "What do you use it for?", "long_text", { section: `Tool ${row}` }),
          field(`tool-${row}-trust`, "Where did you stop trusting it?", "long_text", { section: `Tool ${row}` }),
        ]),
        field("gave-up", "What have you tried and given up on?", "long_text", { required: true, section: "Patterns" }),
        field("repeated-context", "Where do you paste the same context again and again?", "long_text", { required: true, section: "Patterns" }),
      ],
      {
        instructions:
          "Repeated context is often a reusable skill waiting to be written. Be specific about where trust broke down.",
      },
    ),
    {
      id: "discover-routine-shortlist",
      type: "prioritization",
      title: "Sweep your week: what repeats?",
      prompt:
        "Capture as many recurring routines as you can, then shortlist four you would most like to automate or offload.",
      instructions:
        "Think across meetings, reporting, communication, approvals, research, follow-up, planning, data entry, and coordination. Keep each routine short and specific. Quantity first; selection second.",
      successCriteria:
        "You have at least eight real routines and a shortlist of four automation candidates.",
      facilitatorNotes:
        "Give the room four silent minutes for quantity, then ask them to shortlist four. If someone stalls, ask what they did three times last week.",
      materialId,
      materialStartSlide: 34,
      estimatedMinutes: 14,
      status: "draft",
      required: true,
      randomizeOptions: false,
      showResults: false,
      entryLabel: "Add a routine you repeat",
      selectionPrompt:
        "Choose four routines you would feel relieved to automate or offload.",
      minItems: 8,
      maxSelections: 4,
      points: 0,
      options: [],
    },
    ...[1, 2, 3, 4].map((card) =>
      worksheet(
        `discover-task-anatomy-${card}`,
        `Task anatomy card ${card}`,
        "Unpack one shortlisted routine and surface the judgment hidden inside it.",
        35,
        8,
        taskCardFields(card),
        {
          instructions:
            "Work from the real task, not the ideal process. Capture decisions, exceptions, the quality bar, and anything you describe as ‘I just know’. Save progress if you need to return to it.",
          successCriteria:
            "You can name the steps, at least one decision point, one exception, and what good looks like.",
        },
      ),
    ),
    worksheet(
      "discover-final-choice",
      "Choose the first task to offload",
      "Score your four candidates and choose the first one you will carry through all four sessions.",
      36,
      12,
      [
        ...scorecardFields,
        field("selected-task", "The first task I will offload is…", "short_text", { required: true, section: "Decision", placeholder: "Six words or fewer" }),
        field("selection-reason", "Why is this a safe, useful first build?", "long_text", { required: true, section: "Decision" }),
      ],
      {
        instructions:
          "Consider frequency, time cost, repeatability, verifiability, reversibility, data access, and judgment density. For a first build, favour something easy to verify and easy to reverse.",
        successCriteria:
          "Name one task in six words or fewer and explain why it is a safe, useful first build.",
      },
    ),
    worksheet(
      "discover-recording-commitment",
      "Your recording commitment",
      "What will you record before Day 2, and by when?",
      37,
      8,
      [
        field("recorded-task", "The task I will record", "short_text", { required: true, section: "Assignment" }),
        field("recording-date", "I will record it by", "date", { required: true, section: "Assignment" }),
        field("support-needed", "What help, access, or support do you need?", "long_text", { section: "Assignment" }),
        field("commitment", "Write your commitment in one sentence", "long_text", { required: true, section: "Commitment", placeholder: "I am recording ___ by ___." }),
      ],
      {
        instructions:
          "Record one full run with your voice, narrating decisions rather than clicks. Add any support you need before you begin.",
        successCriteria:
          "The task and deadline are explicit enough to read aloud to the room.",
      },
    ),
    content(
      "discover-close",
      "Close and next step",
      "Day 2 turns your recording into a reusable skill file that can run consistently.",
      39,
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
  ].filter(([, sourcePath]) => Boolean(sourcePath));
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
      aliases: ["AI Quick Win for Leaders.pptx"],
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
  if (path.extname(sourcePath).toLowerCase() === ".pdf") {
    return readFile(sourcePath);
  }
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
  const adminUploadUrl = process.env.COURSES_ADMIN_UPLOAD_URL?.trim();
  let response;
  if (adminUploadUrl) {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) throw new Error("ADMIN_SECRET is required.");
    form.append("ownerEmail", ownerEmail);
    response = await fetch(adminUploadUrl, {
      method: "POST",
      headers: { "x-admin-secret": adminSecret },
      body: form,
    });
  } else {
    const apiKey = await agentCommonsAccessToken();
    const baseUrl = (
      process.env.AGENT_COMMONS_API_URL || "https://api.agentcommons.io"
    ).replace(/\/$/, "");
    response = await fetch(`${baseUrl}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-initiator": String(principalId),
        "x-owner-id": String(principalId),
      },
      body: form,
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.data)) {
    const detail =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : "Workshop files could not be added to Commons Library.";
    throw new Error(
      `Commons Library upload failed (${response.status}): ${detail}`,
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

async function agentCommonsAccessToken() {
  if (process.env.AGENT_COMMONS_API_KEY) {
    return process.env.AGENT_COMMONS_API_KEY;
  }
  const issuer = process.env.COMMONS_IDENTITY_ISSUER;
  const clientId =
    process.env.AGENT_COMMONS_SERVICE_CLIENT_ID ||
    process.env.COURSES_VERIFIER_CLIENT_ID;
  const clientSecret =
    process.env.AGENT_COMMONS_SERVICE_CLIENT_SECRET ||
    process.env.COURSES_VERIFIER_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    throw new Error(
      "A Commons API key or Commons Identity service credentials are required.",
    );
  }
  const response = await fetch(`${issuer.replace(/\/$/, "")}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "activity:read",
      resource: "commons-platform",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(
      `Commons Identity token request failed (${response.status}).`,
    );
  }
  return payload.access_token;
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
    name: { $in: [asset.name, ...(asset.aliases || [])] },
  });
  const materialFilter = existing?._id
    ? { _id: existing._id }
    : { courseId: course._id, name: asset.name };
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
      materialFilter,
      {
        $set: {
          name: asset.name,
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
  const indexes = [0, 6, 7, 17, 20, 23, 30, 31, 33, 34, 35, 36, 37, pages.length - 1].filter(
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
