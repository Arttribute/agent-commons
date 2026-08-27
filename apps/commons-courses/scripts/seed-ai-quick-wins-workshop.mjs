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
const captureMode = process.argv.includes("--capture");
const expandMode = process.argv.includes("--expand");
const secureMode = process.argv.includes("--secure");
const previewDir = argument("preview-dir");
let cachedPdfTools;
const inputs = secureMode
  ? {
      deck: requiredArgument("deck"),
      workbook: requiredArgument("workbook"),
      vault: requiredArgument("vault"),
    }
  : captureMode || expandMode
  ? {
      deck: requiredArgument("deck"),
      workbook: requiredArgument("workbook"),
      workbookDocx: requiredArgument("workbook-docx"),
    }
  : {
      deck: requiredArgument("deck"),
      workbook: requiredArgument("workbook"),
      cards: argument("cards"),
      guide: argument("guide"),
    };

if (!dryRun && !process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required.");
}

await (secureMode
  ? secureMain()
  : expandMode
    ? expandMain()
    : captureMode
      ? captureMain()
      : main());

async function secureMain() {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "quick-wins-secure-"));
  try {
    const [assets, vault] = await Promise.all([
      prepareSecureAssets(inputs, workDir),
      inspectSecureVault(inputs.vault),
    ]);
    if (dryRun) {
      console.log(
        JSON.stringify({
          dryRun,
          mode: "secure",
          files: Object.values(assets).map((asset) => ({
            name: asset.name,
            bytes: asset.bytes.length,
            pages: asset.pages.length,
          })),
          vault: {
            name: path.basename(inputs.vault),
            files: vault.files.length,
            bytes: vault.bytes.length,
          },
          activities: createSecureActivities(
            "preview-material",
            "preview-workspace",
          ).length,
          minutes: createSecureActivities(
            "preview-material",
            "preview-workspace",
          ).reduce(
            (total, activity) => total + (activity.estimatedMinutes || 0),
            0,
          ),
        }),
      );
      return;
    }

    await mongoose.connect(process.env.MONGODB_URI);
    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error("MongoDB connection is unavailable.");
      const [owner, course] = await Promise.all([
        db.collection("users").findOne({ email: ownerEmail }),
        db.collection("courses").findOne({ slug }),
      ]);
      if (!owner) throw new Error(`Owner not found: ${ownerEmail}`);
      if (!course) throw new Error(`Course not found: ${slug}`);
      if (!owner.identityUserId) {
        throw new Error(`${ownerEmail} is not connected to Commons Identity.`);
      }
      const session = await db.collection("livesessions").findOne({
        courseId: course._id,
      });
      if (!session)
        throw new Error("AI Quick Wins live programme was not found.");

      const now = new Date();
      const commonsFiles = await uploadToCommonsLibrary(
        Object.values(assets),
        owner.identityUserId,
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
          principalId: owner.identityUserId,
          asset,
          commonsFile: commonsFiles.get(asset.key),
          now,
        });
      }
      const workspace = await ensureSecureLabWorkspace({
        db,
        course,
        owner,
        vault,
        now,
      });

      const retainedActivities = (session.activities || []).filter(
        (activity) => !activity.id.startsWith("secure-"),
      );
      const secureActivities = createSecureActivities(
        String(materialByKey.secureDeck._id),
        String(workspace._id),
      );
      const activities = [...retainedActivities, ...secureActivities];
      const retainedParts = (session.parts || []).filter(
        (part) => part.id !== "secure",
      );
      const securePart = {
        id: "secure",
        title: "Day 4 · Secure",
        description:
          "Build the company brain, bound what can reach it, define verification and human-only work, agree the policy, and assign the next ninety days.",
        status: "closed",
        pace: "facilitator",
        activityIds: secureActivities.map((activity) => activity.id),
      };
      const parts = [...retainedParts, securePart];

      await Promise.all([
        db.collection("livesessions").updateOne(
          { _id: session._id },
          {
            $set: {
              title: "AI Quick Wins for Leaders · Live programme",
              description:
                "One live programme for Discover, Capture, Expand, and Secure. Educators can open any combination of sessions and choose the pace for each.",
              activities,
              parts,
              updatedAt: now,
            },
            $inc: { stateVersion: 1 },
          },
        ),
        db.collection("courses").updateOne(
          { _id: course._id },
          {
            $set: {
              "modules.3.lessons.0.description":
                "Build a portable company brain, reduce its blast radius, assign verification modes and human-only boundaries, draft the one-page AI policy, and leave with named owners and a ninety-day plan.",
              updatedAt: now,
            },
          },
        ),
      ]);

      console.log(
        JSON.stringify(
          {
            courseId: String(course._id),
            liveSessionId: String(session._id),
            joinCode: session.joinCode,
            retainedActivities: retainedActivities.length,
            secureActivities: secureActivities.length,
            secureMinutes: secureActivities.reduce(
              (total, activity) =>
                total + (activity.estimatedMinutes || 0),
              0,
            ),
            parts,
            workspace: {
              id: String(workspace._id),
              title: workspace.title,
              files: workspace.files.length,
            },
            materials: Object.fromEntries(
              Object.entries(materialByKey).map(([key, value]) => [
                key,
                { id: String(value._id), name: value.name },
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

async function expandMain() {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "quick-wins-expand-"));
  try {
    const assets = await prepareExpandAssets(inputs, workDir);
    if (dryRun) {
      console.log(
        JSON.stringify({
          dryRun,
          mode: "expand",
          files: Object.values(assets).map((asset) => ({
            name: asset.name,
            bytes: asset.bytes.length,
            pages: asset.pages.length,
          })),
          activities: createExpandActivities("preview-material").length,
        }),
      );
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error("MongoDB connection is unavailable.");
      const [owner, course] = await Promise.all([
        db.collection("users").findOne({ email: ownerEmail }),
        db.collection("courses").findOne({ slug }),
      ]);
      if (!owner) throw new Error(`Owner not found: ${ownerEmail}`);
      if (!course) throw new Error(`Course not found: ${slug}`);
      if (!owner.identityUserId) {
        throw new Error(`${ownerEmail} is not connected to Commons Identity.`);
      }
      const session = await db.collection("livesessions").findOne({
        courseId: course._id,
      });
      if (!session) throw new Error("AI Quick Wins live programme was not found.");

      const now = new Date();
      const commonsFiles = await uploadToCommonsLibrary(
        Object.values(assets),
        owner.identityUserId,
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
          principalId: owner.identityUserId,
          asset,
          commonsFile: commonsFiles.get(asset.key),
          now,
        });
      }

      const retainedActivities = (session.activities || []).filter(
        (activity) => !activity.id.startsWith("expand-"),
      );
      const expandActivities = createExpandActivities(
        String(materialByKey.expandDeck._id),
      );
      const activities = [...retainedActivities, ...expandActivities];
      const retainedParts = (session.parts || []).filter(
        (part) => part.id !== "expand",
      );
      const expandPart = {
        id: "expand",
        title: "Day 3 · Expand",
        description:
          "Diagnose the wall, scope connected systems, map the company brain, and specify a complete harness.",
        status: "closed",
        pace: "facilitator",
        activityIds: expandActivities.map((activity) => activity.id),
      };
      const secureIndex = retainedParts.findIndex(
        (part) => part.id === "secure",
      );
      const parts = [...retainedParts];
      parts.splice(secureIndex < 0 ? parts.length : secureIndex, 0, expandPart);

      await Promise.all([
        db.collection("livesessions").updateOne(
          { _id: session._id },
          {
            $set: {
              title: "AI Quick Wins for Leaders · Live programme",
              description:
                "One live programme for Discover, Capture, Expand, and Secure. Educators can open any combination of sessions and choose the pace for each.",
              activities,
              parts,
              updatedAt: now,
            },
            $inc: { stateVersion: 1 },
          },
        ),
        db.collection("courses").updateOne(
          { _id: course._id },
          {
            $set: {
              "modules.2.lessons.0.description":
                "Diagnose the wall your automation hit, scope what it can safely reach, map the first version of the company brain, and build an eleven-field harness specification.",
              updatedAt: now,
            },
          },
        ),
      ]);

      console.log(
        JSON.stringify(
          {
            courseId: String(course._id),
            liveSessionId: String(session._id),
            joinCode: session.joinCode,
            retainedActivities: retainedActivities.length,
            expandActivities: expandActivities.length,
            parts,
            materials: Object.fromEntries(
              Object.entries(materialByKey).map(([key, value]) => [
                key,
                { id: String(value._id), name: value.name },
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

async function captureMain() {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "quick-wins-capture-"));
  try {
    const assets = await prepareCaptureAssets(inputs, workDir);
    if (dryRun) {
      console.log(
        JSON.stringify({
          dryRun,
          mode: "capture",
          files: Object.values(assets).map((asset) => ({
            name: asset.name,
            bytes: asset.bytes.length,
            pages: asset.pages.length,
          })),
          activities: createCaptureActivities("preview-material").length,
        }),
      );
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error("MongoDB connection is unavailable.");
      const [owner, course] = await Promise.all([
        db.collection("users").findOne({ email: ownerEmail }),
        db.collection("courses").findOne({ slug }),
      ]);
      if (!owner) throw new Error(`Owner not found: ${ownerEmail}`);
      if (!course) throw new Error(`Course not found: ${slug}`);
      if (!owner.identityUserId) {
        throw new Error(`${ownerEmail} is not connected to Commons Identity.`);
      }
      const session = await db.collection("livesessions").findOne({
        courseId: course._id,
      });
      if (!session)
        throw new Error("AI Quick Wins live programme was not found.");
      const now = new Date();
      const commonsFiles = await uploadToCommonsLibrary(
        Object.values(assets),
        owner.identityUserId,
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
          principalId: owner.identityUserId,
          asset,
          commonsFile: commonsFiles.get(asset.key),
          now,
        });
      }
      const discoverActivities = (session.activities || []).filter(
        (activity) => !activity.id.startsWith("capture-"),
      );
      const captureActivities = createCaptureActivities(
        String(materialByKey.captureDeck._id),
      );
      const activities = [...discoverActivities, ...captureActivities];
      const discoverPart = {
        id: "discover",
        title: "Day 1 · Discover",
        description:
          "Map recurring work, unpack task anatomy, and choose the first useful task to offload.",
        status: "open",
        pace: "learner",
        activityIds: discoverActivities.map((activity) => activity.id),
      };
      const capturePart = {
        id: "capture",
        title: "Day 2 · Capture",
        description:
          "Turn the chosen task into a reusable procedure, run it, automate it, and evaluate what breaks.",
        status: "closed",
        pace: "facilitator",
        activityIds: captureActivities.map((activity) => activity.id),
      };
      await Promise.all([
        db.collection("livesessions").updateOne(
          { _id: session._id },
          {
            $set: {
              title: "AI Quick Wins for Leaders · Live programme",
              description:
                "One live programme for Discover, Capture, Expand, and Secure. Educators open each session when the group is ready.",
              pace: "learner",
              currentPartId: "discover",
              activities: activities.map((activity) => ({
                ...activity,
                status: activity.id.startsWith("capture-") ? "draft" : "open",
              })),
              parts: [discoverPart, capturePart],
              updatedAt: now,
            },
            $inc: { stateVersion: 1 },
          },
        ),
        db.collection("courses").updateOne(
          { _id: course._id },
          {
            $set: {
              "modules.1.lessons.0.description":
                "Build a reusable procedure, add a trigger, test it twice, classify failures, and prepare a live demonstration.",
              updatedAt: now,
            },
          },
        ),
      ]);
      console.log(
        JSON.stringify(
          {
            courseId: String(course._id),
            liveSessionId: String(session._id),
            joinCode: session.joinCode,
            discoverActivities: discoverActivities.length,
            captureActivities: captureActivities.length,
            parts: [discoverPart, capturePart],
            materials: Object.fromEntries(
              Object.entries(materialByKey).map(([key, value]) => [
                key,
                { id: String(value._id), name: value.name },
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
  const taskCardFields = () => [
    field("task-name", "1. Task name", "short_text", {
      required: true,
      placeholder: "Six words or fewer",
    }),
    field("task-trigger", "2. What triggers it?", "long_text", {
      required: true,
    }),
    field(
      "task-frequency",
      "3. How often, and how long does it take?",
      "long_text",
    ),
    field("task-tools", "4. Which tools or apps are involved?", "long_text"),
    field(
      "task-inputs",
      "5. What inputs are needed, and where do they live?",
      "long_text",
    ),
    field("task-steps", "6. What are the steps?", "long_text", {
      required: true,
    }),
    field("task-judgment", "7. Where do you pause and think?", "long_text"),
    field(
      "task-exceptions",
      "8. What exceptions change the process?",
      "long_text",
    ),
    field(
      "task-quality",
      "9. What separates a good result from a bad one?",
      "long_text",
      { required: true },
    ),
    field("task-tacit", "10. What part do you ‘just know’?", "long_text"),
    field(
      "task-loss",
      "11. What would be lost if this were delegated?",
      "long_text",
    ),
    field("task-never", "12. What should AI never give up?", "long_text"),
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
        field(
          "outcome",
          "By the end of session four, I will be able to…",
          "long_text",
          { required: true, section: "Outcome contract" },
        ),
        field("evidence", "The evidence that it worked will be…", "long_text", {
          required: true,
          section: "Outcome contract",
        }),
        field("signature", "Name or signature", "short_text", {
          section: "Outcome contract",
        }),
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
        field(
          "knowledge",
          "Knowledge: what does the organisation need to know, and where does it live?",
          "long_text",
          { required: true, section: "Organisational foundations" },
        ),
        field(
          "tools",
          "Tools: which systems does the organisation actually use?",
          "long_text",
          { required: true, section: "Organisational foundations" },
        ),
        field(
          "procedures",
          "Procedures: where are repeatable processes written down—or only held in people’s heads?",
          "long_text",
          { required: true, section: "Organisational foundations" },
        ),
        field(
          "rules",
          "Rules: what policies, boundaries, approvals, and risks must an AI system respect?",
          "long_text",
          { required: true, section: "Organisational foundations" },
        ),
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
          field(`tool-${row}`, "Tool", "short_text", {
            section: `Tool ${row}`,
          }),
          field(
            `tool-${row}-frequency`,
            "How often do you use it?",
            "short_text",
            { section: `Tool ${row}` },
          ),
          field(`tool-${row}-use`, "What do you use it for?", "long_text", {
            section: `Tool ${row}`,
          }),
          field(
            `tool-${row}-trust`,
            "Where did you stop trusting it?",
            "long_text",
            { section: `Tool ${row}` },
          ),
        ]),
        field("gave-up", "What have you tried and given up on?", "long_text", {
          required: true,
          section: "Patterns",
        }),
        field(
          "repeated-context",
          "Where do you paste the same context again and again?",
          "long_text",
          { required: true, section: "Patterns" },
        ),
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
    {
      ...content(
        "discover-task-anatomies",
        "Task anatomy cards",
        "Unpack each shortlisted routine and surface the judgment hidden inside it.",
        35,
        20,
      ),
      type: "card_collection",
      required: true,
      minItems: 1,
      itemTitleFieldId: "task-name",
      worksheetFields: taskCardFields(),
      instructions:
        "Add one card for every task you want to examine. Work from the real task, not the ideal process. You can create as many cards as you need, save progress, and return to any card.",
      successCriteria:
        "Each card names the steps, at least one decision point, an exception, and what good looks like.",
    },
    {
      ...content(
        "discover-final-choice",
        "Choose the first task to offload",
        "Score the tasks you just unpacked and choose the first one you will carry through all four sessions.",
        36,
        12,
      ),
      type: "linked_scorecard",
      required: true,
      sourceActivityId: "discover-task-anatomies",
      selectionPrompt: "Choose the first task you will offload.",
      scoreCriteria: scoreCriteria.map(([id, label]) => ({
        id,
        label,
        min: 1,
        max: 5,
        lowLabel: "Low",
        highLabel: "High",
      })),
      instructions:
        "Your task cards are already here. Score each one for frequency, time cost, repeatability, verifiability, reversibility, data access, and judgment density—then choose your first build.",
      successCriteria:
        "Choose one task and explain why it is a safe, useful first build.",
    },
    worksheet(
      "discover-recording-commitment",
      "Your recording commitment",
      "What will you record before Day 2, and by when?",
      37,
      8,
      [
        field("recorded-task", "The task I will record", "short_text", {
          required: true,
          section: "Assignment",
        }),
        field("recording-date", "I will record it by", "date", {
          required: true,
          section: "Assignment",
        }),
        field(
          "support-needed",
          "What help, access, or support do you need?",
          "long_text",
          { section: "Assignment" },
        ),
        field(
          "commitment",
          "Write your commitment in one sentence",
          "long_text",
          {
            required: true,
            section: "Commitment",
            placeholder: "I am recording ___ by ___.",
          },
        ),
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

function createCaptureActivities(materialId) {
  const field = (id, label, type = "long_text", extra = {}) => ({
    id,
    label,
    type,
    required: false,
    ...extra,
  });
  const base = (id, title, prompt, slide, minutes, extra = {}) => ({
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
  const worksheet = (
    id,
    title,
    prompt,
    slide,
    minutes,
    worksheetFields,
    extra = {},
  ) => ({
    ...base(id, title, prompt, slide, minutes),
    type: "worksheet",
    required: true,
    worksheetFields,
    ...extra,
  });
  const scale = (id, label) =>
    field(id, label, "scale", {
      required: true,
      min: 0,
      max: 1,
      lowLabel: "Not yet",
      highLabel: "Yes",
    });

  return [
    base(
      "capture-recap",
      "Where we left off",
      "Reconnect with the task you selected in Discover and see how its anatomy card becomes an automated task.",
      1,
      8,
      {
        facilitatorNotes:
          "Ask learners to keep their Discover task cards available. Tonight they build, test, and demonstrate one real task.",
      },
    ),
    base(
      "capture-standard",
      "What good looks like",
      "Understand the three moves—capture, run, automate—and the seven-test standard for tonight’s build.",
      8,
      12,
    ),
    worksheet(
      "capture-extraction",
      "Extraction prompt and tacit-knowledge questions",
      "Use your recording transcript to create a draft procedure, then capture the questions that expose what was left unsaid.",
      12,
      10,
      [
        field(
          "task-from-discover",
          "The task I selected in Discover",
          "short_text",
          { required: true, section: "Starting point" },
        ),
        field(
          "question-1",
          "Question 1 the assistant asked that I could not answer immediately",
          "long_text",
          { required: true, section: "Tacit knowledge" },
        ),
        field("question-2", "Question 2 the assistant asked", "long_text", {
          section: "Tacit knowledge",
        }),
        field("question-3", "Question 3 the assistant asked", "long_text", {
          section: "Tacit knowledge",
        }),
        field(
          "corrections",
          "What did the assistant infer incorrectly, and how did you correct it?",
          "long_text",
          { section: "Tacit knowledge" },
        ),
      ],
      {
        sourceActivityId: "discover-final-choice",
        instructions:
          "Paste your anatomy card and transcript into your assistant with the extraction prompt shown in the deck. Answer every question in full sentences. If the answer is ‘it depends’, finish the sentence with exactly what it depends on.",
        successCriteria:
          "You have a draft procedure plus an explicit record of uncertain assumptions and corrections.",
      },
    ),
    worksheet(
      "capture-canvas",
      "The automated-task canvas",
      "Turn the selected routine into instructions that a colleague—or an automated task—could actually run.",
      13,
      20,
      [
        field("name", "1. Name it—short and about the task", "short_text", {
          required: true,
          section: "Definition",
        }),
        field(
          "preconditions",
          "2. What must be true before it can start?",
          "long_text",
          {
            required: true,
            section: "Definition",
          },
        ),
        field(
          "inputs",
          "3. Inputs, and where they actually live",
          "long_text",
          {
            required: true,
            section: "Procedure",
          },
        ),
        field("steps", "4. Steps, in order", "long_text", {
          required: true,
          section: "Procedure",
        }),
        field("not-use", "5. When should it not be used?", "long_text", {
          required: true,
          section: "Boundaries",
        }),
        field("never", "6. What must it never do?", "long_text", {
          required: true,
          section: "Boundaries",
        }),
        field(
          "decisions",
          "7. Decision points, and what you weigh at each",
          "long_text",
          {
            required: true,
            section: "Judgment",
          },
        ),
        field(
          "exceptions",
          "8. Exceptions, and what triggers them",
          "long_text",
          {
            required: true,
            section: "Judgment",
          },
        ),
        field(
          "quality",
          "9. Quality bar—what done well looks like",
          "long_text",
          {
            required: true,
            section: "Quality and control",
          },
        ),
        field(
          "escalation",
          "10. What stops and waits for a person—and whom?",
          "long_text",
          {
            required: true,
            section: "Quality and control",
          },
        ),
        field(
          "example",
          "11. One worked example, start to finish",
          "long_text",
          {
            required: true,
            section: "Example and trigger",
          },
        ),
        field(
          "description",
          "12. Description—when should this run?",
          "long_text",
          {
            required: true,
            section: "Example and trigger",
            description:
              "Write this last, after the rest of the procedure is honest.",
          },
        ),
      ],
      {
        sourceActivityId: "discover-final-choice",
        instructions:
          "Copy the six fields already captured in your Discover anatomy card, then spend your time on the never list, quality bar, escalation, and precise trigger.",
        successCriteria:
          "All twelve fields are concrete enough for another person to follow without guessing.",
      },
    ),
    worksheet(
      "capture-run-and-trigger",
      "Run it, then put a trigger on it",
      "Watch the procedure work once on live input before you automate it, then choose where it starts, lands, and stops.",
      15,
      20,
      [
        field(
          "live-input",
          "What fresh, live input did you test it on?",
          "long_text",
          {
            required: true,
            section: "Run it by hand",
          },
        ),
        field(
          "observed-output",
          "What did you observe in the full output?",
          "long_text",
          {
            required: true,
            section: "Run it by hand",
          },
        ),
        field(
          "trigger",
          "The time or event that will trigger it",
          "long_text",
          {
            required: true,
            section: "Automate it",
          },
        ),
        field(
          "destination",
          "Where will the output land—somewhere you already look?",
          "long_text",
          {
            required: true,
            section: "Automate it",
          },
        ),
        field(
          "stop",
          "How do you stop it, and how many seconds does that take?",
          "long_text",
          {
            required: true,
            section: "Automate it",
          },
        ),
      ],
      {
        instructions:
          "Never automate something you have not watched work once. If you only reach the manual run tonight, record that honestly.",
      },
    ),
    worksheet(
      "capture-library",
      "Where this procedure lives",
      "Make the build organisational knowledge rather than a personal trick on one laptop.",
      16,
      5,
      [
        field(
          "location",
          "Shared folder, workspace, or repository",
          "long_text",
          {
            required: true,
          },
        ),
        field("owner", "Named owner", "short_text", { required: true }),
        field("author", "Who wrote it?", "short_text"),
        field("purpose", "What does it do?", "long_text"),
      ],
      {
        successCriteria:
          "The location is shared and an accountable owner is named.",
      },
    ),
    worksheet(
      "capture-evaluation",
      "Score the task and classify what broke",
      "Run the task twice on live work, score it honestly, then change one thing only before the second run.",
      17,
      18,
      [
        scale("starts", "It starts itself"),
        scale("judgment", "It uses my judgment"),
        scale("consistent", "The output is consistent"),
        scale("catch-bad", "I would catch a bad output within a day"),
        scale("lands", "It lands somewhere I already look"),
        scale("colleague", "Someone else could run it"),
        scale("stop", "I can stop it in seconds"),
        field("missed", "Which tests did you miss?", "long_text", {
          required: true,
          section: "Failure",
        }),
        field(
          "failure-class",
          "Failure class: context, constraint, verification, or planning",
          "short_text",
          { required: true, section: "Failure" },
        ),
        field("run-one", "What failed on run 1?", "long_text", {
          required: true,
          section: "Two runs, one change",
        }),
        field("change", "The one change you made", "long_text", {
          required: true,
          section: "Two runs, one change",
        }),
        field("run-two", "Was run 2 better? What changed?", "long_text", {
          required: true,
          section: "Two runs, one change",
        }),
      ],
      {
        instructions:
          "Five out of seven is a good first build. Context and constraint failures can usually be fixed in the procedure tonight; verification and planning failures become inputs to later sessions.",
      },
    ),
    {
      ...base(
        "capture-run-log",
        "Run log",
        "Log both runs tonight, then add one card for every daily run or human intervention before Session 3.",
        18,
        8,
      ),
      type: "card_collection",
      required: true,
      minItems: 2,
      itemTitleFieldId: "date",
      entryLabel: "Add a run",
      worksheetFields: [
        field("date", "Date or run label", "short_text", { required: true }),
        field(
          "failure-class",
          "Class: context, constraint, verification, or planning",
          "short_text",
        ),
        field(
          "failure",
          "What failed, or where did you step in?",
          "long_text",
          {
            required: true,
          },
        ),
        field("change", "What did you change?", "long_text"),
      ],
      instructions:
        "The interventions are data, not embarrassment. Add another run whenever the task needs a human to step in.",
    },
    worksheet(
      "capture-demo",
      "Your three-minute demo card",
      "Prepare the plain-language story, the actual output, and the honest failure you will show the room.",
      20,
      10,
      [
        field(
          "task-cost",
          "The task, how often it happens, and what it used to cost",
          "long_text",
          {
            required: true,
          },
        ),
        field(
          "evidence",
          "What actual run or output will you show?",
          "long_text",
          {
            required: true,
          },
        ),
        field(
          "failure-fix",
          "What broke, its class, and whether run 2 improved",
          "long_text",
          {
            required: true,
          },
        ),
        field("question", "One thing you want to ask the room", "long_text"),
      ],
      {
        successCriteria:
          "The demo shows the output itself and names an honest failure—not just the model or tool used.",
      },
    ),
    base(
      "capture-what-breaks-next",
      "What breaks next",
      "Connect the limits you hit to loops, tools, context, and controls—the components Session 3 adds around your procedure.",
      24,
      12,
    ),
    worksheet(
      "capture-assignment",
      "Let it run, then bring back the wall you hit",
      "Commit to daily runs and capture the access and information gaps that Session 3 needs to solve.",
      28,
      8,
      [
        field("start-date", "I will start the daily run on", "date", {
          required: true,
          section: "Commitment",
        }),
        field(
          "cannot-reach",
          "What could the task not do because it could not reach something?",
          "long_text",
          {
            required: true,
            section: "Questions for Session 3",
          },
        ),
        field(
          "information-lives",
          "Where does the information it needs live right now?",
          "long_text",
          {
            required: true,
            section: "Questions for Session 3",
          },
        ),
        field(
          "second-task",
          "Which second task card will you turn into a task?",
          "short_text",
          {
            section: "Build",
          },
        ),
        field(
          "wall",
          "The one thing I could not get working tonight",
          "long_text",
          {
            required: true,
            section: "Bring this back",
          },
        ),
      ],
      {
        instructions:
          "Keep adding to the run log until Session 3. If the information lives in someone’s head, write that down—it is a useful answer.",
      },
    ),
    base(
      "capture-close",
      "Commitment and close",
      "Name the score, the shared location and owner, and the daily-run commitment before leaving the room.",
      29,
      2,
    ),
  ];
}

function createSecureActivities(materialId, labWorkspaceId) {
  const field = (id, label, type = "short_text", extra = {}) => ({
    id,
    label,
    type,
    required: false,
    ...extra,
  });
  const base = (id, title, prompt, slide, minutes, extra = {}) => ({
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
  const worksheet = (
    id,
    title,
    prompt,
    slide,
    minutes,
    worksheetFields,
    extra = {},
  ) => ({
    ...base(id, title, prompt, slide, minutes),
    type: "worksheet",
    required: true,
    worksheetFields,
    ...extra,
  });

  return [
    base(
      "secure-welcome",
      "Secure: build it, bound it, carry it",
      "Reconnect the four programme verbs and make tonight's contract explicit: build the brain, make the system safe to leave running, and assign what happens next.",
      3,
      5,
      {
        facilitatorNotes:
          "Keep earlier sessions open if learners need their chosen task, task file, run log, harness, or company-brain map.",
      },
    ),
    worksheet(
      "secure-baseline",
      "Where everyone got to",
      "Record what is actually running, what broke or stopped you, and your current rung from prompt to company brain.",
      6,
      10,
      [
        field("running", "What is running now?", "long_text", {
          required: true,
          section: "Honest baseline",
        }),
        field("ran-alone", "Did it run without you this week?", "short_text", {
          required: true,
          section: "Honest baseline",
        }),
        field("broke", "What broke, or what stopped you?", "long_text", {
          required: true,
          section: "Honest baseline",
        }),
        field("rung", "Your rung tonight", "scale", {
          required: true,
          min: 0,
          max: 6,
          lowLabel: "0 · Prompt",
          highLabel: "6 · Company brain",
          section: "Ninety-day baseline",
        }),
        field(
          "ninety-day-target",
          "The rung I want to report in ninety days",
          "scale",
          {
            min: 0,
            max: 6,
            lowLabel: "0 · Prompt",
            highLabel: "6 · Company brain",
            section: "Ninety-day baseline",
          },
        ),
      ],
      {
        facilitatorNotes:
          "Use ninety seconds each. This is a baseline, not a performance review.",
      },
    ),
    base(
      "secure-brain-demo",
      "A company brain is a folder—with provenance and shelf life",
      "Demonstrate the Northwind vault as ordinary text files, then show retrieval, conflicts, stale facts, commitments, and a governed write-back.",
      12,
      15,
      {
        labWorkspaceId,
        labEntryPath: "00-how-this-works/demo-questions.md",
        instructions:
          "Open the supplied Northwind demo vault alongside the slides. Watch what each question proves and why source, owner, verified, and review-by change the answer.",
        facilitatorNotes:
          "Use the seven demo questions, then turn the raw management meeting note into a decision note. Call out that the assistant just wrote to organisational memory.",
      },
    ),
    worksheet(
      "secure-build-brain",
      "Build your AI Brain v0",
      "Create the portable structure, carry over the rules and template, write three real notes, and test one question only those notes can answer.",
      16,
      20,
      [
        field("vault-location", "Where my brain vault lives", "long_text", {
          required: true,
          section: "Set up",
        }),
        field("structure", "Folder structure copied", "short_text", {
          required: true,
          section: "Set up",
          placeholder: "Done / blocked — and what is blocking me",
        }),
        field("rules", "Rules file and note template copied", "short_text", {
          required: true,
          section: "Set up",
        }),
        field("definition", "The definition I wrote", "long_text", {
          required: true,
          section: "Three real notes",
        }),
        field("decision", "The decision I wrote", "long_text", {
          required: true,
          section: "Three real notes",
        }),
        field(
          "relationship",
          "The client, supplier, or commitment I wrote",
          "long_text",
          { required: true, section: "Three real notes" },
        ),
        field("source-owner", "How each note records source and owner", "long_text", {
          required: true,
          section: "Governance",
        }),
        field("verified-review", "Verified and review-by dates", "long_text", {
          required: true,
          section: "Governance",
        }),
        field("test-question", "The question only these notes can answer", "long_text", {
          required: true,
          section: "Test",
        }),
        field("test-answer", "What happened when I asked it", "long_text", {
          required: true,
          section: "Test",
        }),
      ],
      {
        labWorkspaceId,
        labEntryPath: "README.md",
        instructions:
          "Use the demo vault as a pattern, not as your organisation's content. Start with structure and three real facts; this is not a migration project.",
        successCriteria:
          "The vault contains a definition, decision, relationship or commitment, governance metadata, and a test question grounded in those notes.",
      },
    ),
    base(
      "secure-blast-concept",
      "Blast radius: everything it can reach",
      "Separate requested work from reachable capability, and use the three documented cases to see how broad access compounds across a plan.",
      27,
      5,
      {
        facilitatorNotes:
          "Keep the examples concrete: read content can become instructions, trusted extensions inherit access, and a well-intentioned agent can still act outside the intended boundary.",
      },
    ),
    worksheet(
      "secure-blast-controls",
      "Cut the blast radius",
      "Apply all four controls to your own setup and remove one unnecessary reach before moving on.",
      9,
      15,
      [
        field("automation", "The automation or brain this protects", "long_text", {
          required: true,
          section: "Your boundary",
        }),
        field("reachable", "Everything it can currently reach", "long_text", {
          required: true,
          section: "Your boundary",
        }),
        field("one-folder", "The one-folder scope", "long_text", {
          required: true,
          section: "Four controls",
        }),
        field("draft-merge", "Where agents draft and which named human merges", "long_text", {
          required: true,
          section: "Four controls",
        }),
        field("identity", "Its separate identity and permissions", "long_text", {
          required: true,
          section: "Four controls",
        }),
        field("tested-stop", "How it stops, who can stop it, and how long that takes", "long_text", {
          required: true,
          section: "Four controls",
        }),
        field("remove-tonight", "The one thing I am removing tonight", "long_text", {
          required: true,
          section: "Action",
        }),
      ],
      {
        successCriteria:
          "The learner names the reachable scope, draft/merge boundary, identity, tested stop, and one concrete permission or path removed.",
      },
    ),
    worksheet(
      "secure-verification",
      "Assign the right verification gate",
      "Classify your work by impact and reversibility, then name the exact evidence and person used at the gate.",
      32,
      10,
      [
        field("let-run", "Let it run and log it: which work belongs here?", "long_text", {
          section: "Four modes",
        }),
        field("spot-check", "Spot check a sample: which work and what sample?", "long_text", {
          section: "Four modes",
        }),
        field("review-before", "Review before it goes: which work and who approves?", "long_text", {
          section: "Four modes",
        }),
        field("person-decides", "A person decides: which work and who owns it?", "long_text", {
          section: "Four modes",
        }),
        field("my-mode", "My workflow's verification mode", "short_text", {
          required: true,
          section: "My gate",
        }),
        field("raw-evidence", "The raw action or evidence the checker must inspect", "long_text", {
          required: true,
          section: "My gate",
        }),
        field("named-checker", "The checker, by name", "short_text", {
          required: true,
          section: "My gate",
        }),
      ],
      {
        instructions:
          "Do not verify an agent's summary with the same summary. Name the raw transaction, source record, file, or sample the person will inspect.",
      },
    ),
    worksheet(
      "secure-human-only",
      "The human-only list",
      "Decide which work must remain human because of risk, ownership, relationship, or the meaning created by a person doing it.",
      21,
      8,
      [
        field("agree", "Items from the proposed list we agree are human-only", "long_text", {
          required: true,
        }),
        field("strike", "Items we would strike, and why", "long_text"),
        field("add", "What this organisation must add", "long_text", {
          required: true,
        }),
        field("my-boundary", "One thing I will not automate that I might have three weeks ago", "long_text", {
          required: true,
        }),
      ],
      {
        facilitatorNotes:
          "Expect disagreement. Capture the room's actual boundary rather than forcing consensus around every suggested item.",
      },
    ),
    worksheet(
      "secure-policy",
      "Draft the one-page AI policy",
      "Write the operational agreement this room can use tomorrow: specific tools, data, human boundaries, gates, ownership, register, incident path, and review.",
      8,
      12,
      [
        field("scope", "1. Scope: what this policy covers", "long_text", { required: true }),
        field("tools", "2. Approved tools", "long_text", { required: true }),
        field("data-never", "3. Data that never goes into any AI system", "long_text", { required: true }),
        field("data-care", "4. What may be used, with care", "long_text", { required: true }),
        field("human-only", "5. The human-only list", "long_text", { required: true }),
        field("verification", "6. Verification modes and classification", "long_text", { required: true }),
        field("attribution", "7. Ownership, logging, and disclosure minimums", "long_text", { required: true }),
        field("register", "8. The automation register and its owner", "long_text", { required: true }),
        field("incident", "9. Incident procedure: who, how fast, what stops", "long_text", { required: true }),
        field("review", "10. Policy owner and review date", "long_text", { required: true }),
        field("insists", "11. Anything else this room insists on", "long_text"),
        field("signoff", "12. Signed off by, and date", "long_text", { required: true }),
      ],
      {
        successCriteria:
          "The policy is specific enough to follow under time pressure and has a named owner, incident path, and review date.",
      },
    ),
    worksheet(
      "secure-owners-plan",
      "Owners, dates, and the next ninety days",
      "Put names and dates against the shared brain, library, register, policy, first safe connection, and your own outcome measure.",
      18,
      15,
      [
        field("brain-owner", "The brain owner, review owner, and first monthly review", "long_text", { required: true, section: "Shared commitments" }),
        field("library-owner", "The skills and tasks library owner", "long_text", { required: true, section: "Shared commitments" }),
        field("register-owner", "The automation register and permissions-review owner", "long_text", { required: true, section: "Shared commitments" }),
        field("policy-owner", "The policy circulation owner and quarterly review date", "long_text", { required: true, section: "Shared commitments" }),
        field("first-system", "The first system to be safely connected, owner, and date", "long_text", { required: true, section: "Shared commitments" }),
        field("workflow", "My workflow and rung tonight", "long_text", { required: true, section: "My ninety-day plan" }),
        field("mode-owner", "Its verification mode, and me as named owner", "long_text", { required: true, section: "My ninety-day plan" }),
        field("number-90", "The number I will report in ninety days", "long_text", { required: true, section: "My ninety-day plan" }),
        field("number-now", "What that number is today", "long_text", { required: true, section: "My ninety-day plan" }),
        field("not-automate", "One thing I will not automate", "long_text", { required: true, section: "My ninety-day plan" }),
      ],
      {
        instructions:
          "A commitment nobody can find was never made. Use named people and dates, then circulate the record within 48 hours.",
      },
    ),
    worksheet(
      "secure-feedback",
      "Tell us the truth",
      "Give specific programme feedback that the facilitators can act on and use to shape the next cohort.",
      31,
      4,
      [
        field("changed", "What actually changed for you?", "long_text", { required: true }),
        field("weakest", "What was weakest?", "long_text", { required: true }),
        field("missing", "What is still missing?", "long_text", { required: true }),
        field("recommend", "Would you recommend it, and to whom?", "long_text", { required: true }),
        field("tell-next", "What would you tell someone considering the next cohort?", "long_text"),
        field("quote", "May we quote this response? Yes or no", "short_text"),
      ],
    ),
    worksheet(
      "secure-close",
      "Back to the wall",
      "Return to the outcome you named at the beginning, say whether the programme delivered it, and name the help you still need.",
      19,
      1,
      [
        field("original-outcome", "What I wanted to walk out with", "long_text", { required: true }),
        field("did-we", "Did we do it?", "short_text", { required: true }),
        field("starting-advice", "What I would tell someone starting this programme", "long_text", { required: true }),
        field("help", "What I still need help with", "long_text"),
      ],
      {
        facilitatorNotes:
          "Read each learner's original sentence back if you have it. A no is useful evidence, not a failure to smooth over.",
      },
    ),
  ];
}

function createExpandActivities(materialId) {
  const field = (id, label, type = "short_text", extra = {}) => ({
    id,
    label,
    type,
    required: false,
    ...extra,
  });
  const base = (id, title, prompt, slide, minutes, extra = {}) => ({
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
  const worksheet = (
    id,
    title,
    prompt,
    slide,
    minutes,
    worksheetFields,
    extra = {},
  ) => ({
    ...base(id, title, prompt, slide, minutes),
    type: "worksheet",
    required: true,
    worksheetFields,
    ...extra,
  });
  const cards = (
    id,
    title,
    prompt,
    slide,
    minutes,
    worksheetFields,
    itemTitleFieldId,
    extra = {},
  ) => ({
    ...base(id, title, prompt, slide, minutes),
    type: "card_collection",
    required: true,
    minItems: 1,
    entryLabel: "Add another",
    itemTitleFieldId,
    worksheetFields,
    ...extra,
  });

  return [
    base(
      "expand-welcome",
      "Expand: turn the wall into a specification",
      "Reconnect to the workflow you carried through Discover and Capture, then name what it could not reach, know, continue, or ask.",
      1,
      5,
      {
        facilitatorNotes:
          "Keep Session 1 and Session 2 open if learners need to retrieve their earlier task anatomy, procedure, evaluation, or failure log.",
      },
    ),
    worksheet(
      "expand-wall-diagnosis",
      "The wall your automation hit",
      "Describe the wall, classify it, and convert the failure into something the harness must provide.",
      5,
      10,
      [
        field("automation", "The automation this is for", "long_text", {
          required: true,
          section: "Your wall",
        }),
        field("wall", "What could it not do?", "long_text", {
          required: true,
          section: "Your wall",
        }),
        field(
          "kind",
          "Kind of wall: reach, knowledge, loop, or control",
          "short_text",
          { required: true, section: "Diagnosis" },
        ),
        field("needs", "What does it need to get past this wall?", "long_text", {
          required: true,
          section: "Diagnosis",
        }),
        field("owner", "Who owns what it needs?", "short_text", {
          section: "Diagnosis",
        }),
      ],
      {
        instructions:
          "Your wall is not a mistake. Make it concrete enough that another person could tell what must be added around the model.",
        successCriteria:
          "The wall is classified and names a specific missing tool, context, loop, or control.",
      },
    ),
    base(
      "expand-harness-concept",
      "Agent = model + harness",
      "Translate the four wall types into the loop, tool interface, context, and controls that surround a model.",
      8,
      15,
      {
        facilitatorNotes:
          "Anchor this in familiar management practice: job description, access, briefing, and approval limits.",
      },
    ),
    worksheet(
      "expand-connection-scope",
      "Three routes in—and the scope that matters",
      "Choose the lightest useful route into one system and write the minimum safe scope in one sentence.",
      13,
      13,
      [
        field("system", "The system my automation needs", "short_text", {
          required: true,
          section: "Connection",
        }),
        field(
          "route",
          "Route: existing connector, files, API, or not yet",
          "short_text",
          { required: true, section: "Connection" },
        ),
        field(
          "scope",
          "The scope I would grant, in one sentence",
          "long_text",
          {
            required: true,
            section: "Least agency",
            placeholder:
              "It may read open opportunities owned by this team, and write nothing.",
          },
        ),
        field("permission-owner", "Who approves this scope?", "short_text", {
          required: true,
          section: "Least agency",
        }),
      ],
      {
        successCriteria:
          "The scope names operations, records, permissions, and an accountable owner.",
      },
    ),
    cards(
      "expand-systems-map",
      "What do we actually run?",
      "Add every system the organisation uses. For each one, name its owner, what AI could safely read, and what it must never touch.",
      16,
      12,
      [
        field("system", "System", "short_text", { required: true }),
        field("owner", "Named owner", "short_text", { required: true }),
        field("safe-read", "What AI could safely read", "long_text", {
          required: true,
        }),
        field("never-touch", "What it must never touch", "long_text", {
          required: true,
        }),
        field(
          "hidden-risk",
          "What is in there that should not be in there?",
          "long_text",
        ),
        field(
          "priority",
          "Connection priority: value × safety (1–5)",
          "scale",
          { min: 1, max: 5, lowLabel: "Later", highLabel: "First" },
        ),
      ],
      "system",
      {
        entryLabel: "Add a system",
        instructions:
          "Build this together. Add as many systems as the organisation actually uses; do not stop at the examples on the slide.",
      },
    ),
    base(
      "expand-company-brain-concept",
      "Where the organisation keeps what it knows",
      "Separate a trustworthy company brain from a wiki, search box, pile of documents, or memory trapped inside one tool.",
      17,
      10,
    ),
    cards(
      "expand-company-brain-map",
      "The questions an agent must answer correctly",
      "Capture the questions that matter, where each answer lives today, who owns it, and whether it is current and queryable.",
      21,
      20,
      [
        field("question", "Question the agent must answer", "long_text", {
          required: true,
        }),
        field("where", "Where the answer lives today", "long_text", {
          required: true,
        }),
        field("owner", "Named owner", "short_text", { required: true }),
        field(
          "current",
          "Is it current, sourced, and queryable?",
          "long_text",
          { required: true },
        ),
        field(
          "v0-priority",
          "Priority for company brain v0 (1–5)",
          "scale",
          { min: 1, max: 5, lowLabel: "Later", highLabel: "Top three" },
        ),
        field("target-date", "Owner's target date", "date"),
      ],
      "question",
      {
        entryLabel: "Add a question",
        minItems: 3,
        instructions:
          "Start with the twelve prompts in the workbook, then add what is specific to this organisation. Mark the three worst, highest-value rows as priority 5 and give each an owner and date.",
        successCriteria:
          "At least three high-value questions have a source, owner, current-state assessment, and target date.",
      },
    ),
    worksheet(
      "expand-harness-canvas",
      "Your harness specification",
      "Complete all eleven fields around the automation you have carried through the programme.",
      23,
      25,
      [
        field("automation", "The automation this is for", "long_text", {
          required: true,
          section: "Purpose",
        }),
        field("trigger", "1. Trigger: what starts it?", "long_text", {
          required: true,
          section: "Run conditions",
        }),
        field("inputs", "2. Inputs: what must be present first?", "long_text", {
          required: true,
          section: "Run conditions",
        }),
        field(
          "context",
          "3. Context: what must it know, and from where?",
          "long_text",
          { required: true, section: "Reach and knowledge" },
        ),
        field(
          "tools",
          "4. Tools: what must it reach, read, and write?",
          "long_text",
          { required: true, section: "Reach and knowledge" },
        ),
        field(
          "procedure",
          "5. Procedure: which written task does it follow?",
          "long_text",
          { required: true, section: "Procedure" },
        ),
        field(
          "stopping-condition",
          "6. Stopping condition: how does it know it is done?",
          "long_text",
          { required: true, section: "Controls" },
        ),
        field(
          "stop-early",
          "7. What makes it stop early and ask?",
          "long_text",
          { required: true, section: "Controls" },
        ),
        field(
          "destination",
          "8. Output destination: where does the result go, and to whom?",
          "long_text",
          { required: true, section: "Delivery" },
        ),
        field(
          "verification",
          "9. Verification gate: who checks it, against what?",
          "long_text",
          { required: true, section: "Controls" },
        ),
        field("owner", "10. Owner: which named person is accountable?", "short_text", {
          required: true,
          section: "Ownership",
        }),
        field(
          "limits",
          "11. Limits and kill switch: the most it may touch, and how to stop it",
          "long_text",
          { required: true, section: "Ownership" },
        ),
        field(
          "walls-down",
          "Which of my walls does this bring down?",
          "long_text",
          { required: true, section: "Evidence" },
        ),
      ],
      {
        instructions:
          "Fields 6, 7, and 9 must be observable. Do not write ‘when it is done’ or ‘I will check it’. Name the condition, evidence, person, and moment.",
        successCriteria:
          "Another person could tell when the automation starts, stops, escalates, is verified, and how to shut it down.",
      },
    ),
    worksheet(
      "expand-live-connection-evidence",
      "Take one wall down",
      "Record the scoped connection, rerun the same procedure, and isolate what changed outside the model.",
      25,
      10,
      [
        field("wall", "The wall we chose", "long_text", { required: true }),
        field("connection", "System and exact scope connected", "long_text", {
          required: true,
        }),
        field("before", "What the task could not do before", "long_text", {
          required: true,
        }),
        field("after", "What changed when we reran it", "long_text", {
          required: true,
        }),
        field("remaining", "What is still in the way?", "long_text"),
      ],
      {
        facilitatorNotes:
          "Use one or two volunteers. Prefer a familiar reporting or finance wall and keep the connection read-only.",
      },
    ),
    base(
      "expand-stack",
      "The stack—and what to ignore",
      "Place prompt, context, harness, and loop engineering on the stack, then deliberately defer meta-harness and autonomous-loop complexity.",
      26,
      10,
      {
        successCriteria:
          "Learners can explain why a loop amplifies a weak harness instead of repairing it.",
      },
    ),
    worksheet(
      "expand-assignment",
      "The 2am question",
      "Prepare the evidence and ownership needed for Session 4: Secure.",
      30,
      5,
      [
        field(
          "worst-case",
          "If this system did something wrong at 2am on Saturday, what is the worst thing that could happen?",
          "long_text",
          { required: true, section: "The 2am question" },
        ),
        field("who-finds-out", "Who would find out—and how?", "long_text", {
          required: true,
          section: "The 2am question",
        }),
        field(
          "thin-fields",
          "Which harness fields are still thin or vague?",
          "long_text",
          { section: "Before Session 4" },
        ),
        field(
          "brain-owners",
          "The three company-brain rows, owners, and next steps",
          "long_text",
          { required: true, section: "Before Session 4" },
        ),
        field(
          "connection-change",
          "If you connect one scoped system, what changed?",
          "long_text",
          { section: "Before Session 4" },
        ),
        field("remaining-wall", "The wall still in the way", "long_text", {
          required: true,
          section: "Commitment",
        }),
        field(
          "commitment",
          "My commitment",
          "long_text",
          {
            required: true,
            section: "Commitment",
            placeholder:
              "I am answering the 2am question before Session 4, in writing.",
          },
        ),
      ],
      {
        facilitatorNotes:
          "Close by reading out the three company-brain owners and having each learner say the commitment aloud.",
      },
    ),
  ];
}

async function prepareSecureAssets(source, workDir) {
  const deckBytes = await readFile(source.deck);
  const deckPdf = await convertToPdf(source.deck, workDir, "secure-deck");
  const workbookPdf = await readFile(source.workbook);
  return {
    secureDeck: {
      key: "secureDeck",
      name: path.basename(source.deck),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "presentation",
      visibility: "course",
      bytes: deckBytes,
      pages: await renderPdfPages(deckPdf),
      textPreview: await extractPresentationText(deckBytes),
      aliases: ["Session 4 Secure Slides.pptx"],
    },
    secureWorkbookPdf: {
      key: "secureWorkbookPdf",
      name: "Session 4 Participant Workbook.pdf",
      mimeType: "application/pdf",
      kind: "pdf",
      visibility: "course",
      bytes: workbookPdf,
      pages: [],
      textPreview: await extractPdfText(workbookPdf),
    },
  };
}

async function inspectSecureVault(sourcePath) {
  const bytes = await readFile(sourcePath);
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(archive.files).filter(
    (entry) =>
      !entry.dir &&
      !entry.name.startsWith("__MACOSX/") &&
      !entry.name.endsWith("/.DS_Store"),
  );
  const roots = new Set(entries.map((entry) => entry.name.split("/")[0]));
  const commonRoot =
    roots.size === 1 && entries.every((entry) => entry.name.includes("/"))
      ? [...roots][0]
      : undefined;
  const files = [];
  for (const entry of entries) {
    const relativePath = commonRoot
      ? entry.name.slice(commonRoot.length + 1)
      : entry.name;
    if (
      !relativePath ||
      relativePath.startsWith("/") ||
      relativePath.split("/").some((segment) => segment === "..")
    ) {
      throw new Error(`Unsafe path in demo vault: ${entry.name}`);
    }
    const fileBytes = Buffer.from(await entry.async("uint8array"));
    files.push({
      path: relativePath,
      name: path.posix.basename(relativePath),
      bytes: fileBytes,
      mimeType: mimeForSecureVault(relativePath),
    });
  }
  return {
    bytes,
    sourceFileName: path.basename(sourcePath),
    files,
  };
}

async function ensureSecureLabWorkspace({
  db,
  course,
  owner,
  vault,
  now,
}) {
  const title = "Northwind Coffee · Company Brain demo vault";
  const existing = await db.collection("labworkspaces").findOne({
    courseId: course._id,
    title,
  });
  if (existing) return existing;

  const bucket = new mongo.GridFSBucket(db, { bucketName: "labWorkspaces" });
  const uploadedIds = [];
  try {
    const sourcePackGridFsId = await upload(
      bucket,
      vault.bytes,
      vault.sourceFileName,
      "application/zip",
    );
    uploadedIds.push(sourcePackGridFsId);
    const learnerPackGridFsId = await upload(
      bucket,
      vault.bytes,
      vault.sourceFileName.replace(/\.zip$/i, "-learner.zip"),
      "application/zip",
    );
    uploadedIds.push(learnerPackGridFsId);
    const files = [];
    for (const file of vault.files) {
      const gridFsId = await upload(
        bucket,
        file.bytes,
        file.name,
        file.mimeType,
      );
      uploadedIds.push(gridFsId);
      const editable =
        (file.mimeType.startsWith("text/") || /\.(md|json|ya?ml)$/i.test(file.path)) &&
        file.bytes.length <= 250 * 1024;
      files.push({
        id: crypto.randomUUID(),
        path: file.path,
        name: file.name,
        mimeType: file.mimeType,
        size: file.bytes.length,
        audience: "learner",
        purpose: secureVaultPurpose(file.path),
        editable,
        preview: editable ? file.bytes.toString("utf8") : undefined,
        gridFsId,
      });
    }
    const document = {
      courseId: course._id,
      courseSlug: slug,
      ownerUserId: owner._id,
      title,
      description:
        "A portable example company brain made from governed Markdown notes: definitions, decisions, buyers, commitments, people, procedures, suppliers, review queues, and safe write-back examples.",
      instructions:
        "Start with README.md and 00-how-this-works/how-this-brain-works.md. Use the demo questions during the facilitator demonstration, then copy the structure—not Northwind's facts—into your own vault.",
      visibility: "course",
      sourceFileName: vault.sourceFileName,
      sourcePackGridFsId,
      sourcePackSize: vault.bytes.length,
      learnerPackGridFsId,
      learnerPackSize: vault.bytes.length,
      files,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await db.collection("labworkspaces").insertOne(document);
    return { _id: inserted.insertedId, ...document };
  } catch (error) {
    await Promise.allSettled(uploadedIds.map((id) => bucket.delete(id)));
    throw error;
  }
}

function mimeForSecureVault(filePath) {
  if (/\.md$/i.test(filePath)) return "text/markdown";
  if (/\.txt$/i.test(filePath)) return "text/plain";
  if (/\.json$/i.test(filePath)) return "application/json";
  if (/\.csv$/i.test(filePath)) return "text/csv";
  return "application/octet-stream";
}

function secureVaultPurpose(filePath) {
  if (filePath === "README.md") return "Start here and understand the demo vault.";
  if (filePath.includes("demo-questions"))
    return "Questions used in the live company-brain demonstration.";
  if (filePath.includes("safety")) return "Rules for safe retrieval and write-back.";
  if (filePath.includes("note-template"))
    return "Template learners copy into their own governed vault.";
  if (filePath.includes("inbox/"))
    return "Raw information used to demonstrate governed write-back.";
  return "Example company-brain note.";
}

async function prepareExpandAssets(source, workDir) {
  const deckBytes = await readFile(source.deck);
  const deckPdf = await convertToPdf(source.deck, workDir, "expand-deck");
  const renderedPages = await renderPdfPages(deckPdf);
  const deckPages =
    renderedPages.length === 64 ? renderedPages.slice(0, 32) : renderedPages;
  const presentationText = await extractPresentationText(deckBytes);
  const workbookPdf = await readFile(source.workbook);
  const workbookDocx = await readFile(source.workbookDocx);
  return {
    expandDeck: {
      key: "expandDeck",
      name: path.basename(source.deck),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "presentation",
      visibility: "course",
      bytes: deckBytes,
      pages: deckPages,
      textPreview: presentationText.split("--- Slide 33 ---")[0].trim(),
      aliases: ["AI Quick Wins Session 3.pptx"],
    },
    expandWorkbookPdf: {
      key: "expandWorkbookPdf",
      name: "Session 3 Participant Workbook.pdf",
      mimeType: "application/pdf",
      kind: "pdf",
      visibility: "course",
      bytes: workbookPdf,
      pages: [],
      textPreview: await extractPdfText(workbookPdf),
    },
    expandWorkbookDocx: {
      key: "expandWorkbookDocx",
      name: "Session 3 Participant Workbook.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "document",
      visibility: "course",
      bytes: workbookDocx,
      pages: [],
      textPreview: await extractPdfText(
        await convertToPdf(
          source.workbookDocx,
          workDir,
          "expand-workbook-docx",
        ),
      ),
    },
  };
}

async function prepareCaptureAssets(source, workDir) {
  const deckBytes = await readFile(source.deck);
  const deckPdf = await convertToPdf(source.deck, workDir, "capture-deck");
  const workbookPdf = await readFile(source.workbook);
  const workbookDocx = await readFile(source.workbookDocx);
  return {
    captureDeck: {
      key: "captureDeck",
      name: path.basename(source.deck),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "presentation",
      visibility: "course",
      bytes: deckBytes,
      pages: await renderPdfPages(deckPdf),
      textPreview: await extractPresentationText(deckBytes),
      aliases: ["AI Quick Wins Session 2.pptx"],
    },
    captureWorkbookPdf: {
      key: "captureWorkbookPdf",
      name: "Session 2 Participant Workbook.pdf",
      mimeType: "application/pdf",
      kind: "pdf",
      visibility: "course",
      bytes: workbookPdf,
      pages: [],
      textPreview: await extractPdfText(workbookPdf),
    },
    captureWorkbookDocx: {
      key: "captureWorkbookDocx",
      name: "Session 2 Participant Workbook.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "document",
      visibility: "course",
      bytes: workbookDocx,
      pages: [],
      textPreview: await extractPdfText(
        await convertToPdf(
          source.workbookDocx,
          workDir,
          "capture-workbook-docx",
        ),
      ),
    },
  };
}

async function prepareAssets(source, workDir) {
  const deckBytes = await readFile(source.deck);
  const deckPdf = await convertToPdf(source.deck, workDir, "deck");
  const deckPages = await renderPdfPages(deckPdf);
  const deckText = await extractPresentationText(deckBytes);
  const documentDefinitions = [
    [
      "workbook",
      source.workbook,
      "Session 1 Participant Workbook.pdf",
      "course",
    ],
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
    if (!committed)
      await Promise.allSettled(newIds.map((id) => bucket.delete(id)));
  }
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

async function createUniqueJoinCode(db) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100_000 + Math.random() * 900_000));
    const exists = await db
      .collection("livesessions")
      .findOne({ joinCode: code });
    if (!exists) return code;
  }
  throw new Error("A unique live-session join code could not be generated.");
}

async function writePreviews(pages, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const indexes = [
    0,
    6,
    7,
    17,
    20,
    23,
    30,
    31,
    33,
    34,
    35,
    36,
    37,
    pages.length - 1,
  ].filter(
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
