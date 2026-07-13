import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import nextEnv from "@next/env";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(appRoot);

const envPaths = [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "apps/commons-courses/.env.local"),
  path.join(process.cwd(), "apps/commons-courses/.env"),
];

for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is required. Run from the repo root or apps/commons-courses.");
}

const bucket = process.env.COURSE_MEDIA_S3_BUCKET;
const region = process.env.COURSE_MEDIA_S3_REGION;
const publicBaseUrl =
  process.env.COURSE_MEDIA_CDN_URL || process.env.COURSE_MEDIA_PUBLIC_URL;
const skipMediaUpload = process.env.COURSE_MEDIA_SKIP_UPLOAD === "1";
const useStaticAssets = process.env.COURSE_MEDIA_USE_STATIC_ASSETS === "1";
const staticBaseUrl =
  process.env.COURSE_MEDIA_STATIC_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXTAUTH_URL ||
  "";

const CourseSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Course = mongoose.models.Course || mongoose.model("Course", CourseSchema);

const sourceDir = "/Users/bashybaranaba/Downloads/Copy of Commons-Education (3)";
const featureImagePath = "/Users/bashybaranaba/Downloads/Copy of Commons-Education (4).png";
const skillSlug = "intro-to-multi-agent-systems";
const targetCourseSlug = "ai-fluency-starter";

const assetFiles = {
  cover: { sourcePath: featureImagePath, keyName: "feature.png" },
  multipleAgents: "20.png",
  architecture: "21.png",
  subagentsTeams: "22.png",
  coordination: "23.png",
};

function rich(paragraphs) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

async function upsertMedia(asset) {
  const filename = typeof asset === "string" ? asset : asset.keyName;
  const filePath =
    typeof asset === "string" ? path.join(sourceDir, asset) : asset.sourcePath;
  const key = `course-media/${targetCourseSlug}/${skillSlug}/${filename}`;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing source asset: ${filePath}`);
  }
  if (useStaticAssets) {
    return `${staticBaseUrl.replace(/\/+$/, "")}/${key}`;
  }
  if (skipMediaUpload) {
    return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  const data = fs.readFileSync(filePath);
  const client = createS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
}

function createS3Client() {
  const roleArn = process.env.AWS_ROLE_ARN || process.env.COURSE_MEDIA_AWS_ROLE_ARN;
  if (!roleArn) return new S3Client({ region });

  return new S3Client({
    region,
    credentials: awsCredentialsProvider({
      roleArn,
      audience: "https://sts.amazonaws.com",
      clientConfig: { region },
      roleSessionName: "commonlab-multi-agent-media-seed",
    }),
  });
}

function createSkillPack(assetUrls) {
  return {
    slug: skillSlug,
    enabled: true,
    title: "Intro to Multi-Agent Systems",
    subtitle:
      "Learn how several focused agents can coordinate around one larger goal.",
    coverUrl: assetUrls.cover,
    learnerPromise:
      "By the end, you will understand when multi-agent systems help, how common architectures move work, and how to design a small coordinated agent team.",
    challenges: [
      {
        id: "from-one-to-multiple-agents",
        day: 1,
        title: "From One to Multiple Agents",
        shortTitle: "One to many",
        minutes: 8,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.multipleAgents,
        assetAlt: "Slide comparing a single agent carrying all work with a multi-agent system splitting work across focused contexts.",
        accentColor: "#EAFE62",
        audioCue: "focus",
        hook:
          "One agent can do a lot. At some point, the challenge is no longer only capability. It is context.",
        lesson: rich([
          "You have already seen how an agent can use tools, follow workflows, remember useful context, and work inside a scoped environment.",
          "That gives one agent a lot of reach. But as the task grows, everything starts competing for the same attention: more files, more searches, more decisions, more unfinished work.",
          "A single agent is not automatically incapable in that situation. It may simply be carrying too much at once inside one context.",
          "A multi-agent system splits the work across several focused contexts. One agent might research. Another might analyse. Another might write. Another might review.",
          "The important part is not adding agents for decoration. The point is to keep work separated while preserving one shared goal.",
          "Only the useful result needs to move forward. That is how a larger task can stay organised instead of becoming one crowded conversation.",
        ]),
        keyIdeas: [
          "One agent carries the whole task inside one context.",
          "Multiple agents divide a larger task across focused contexts.",
          "A multi-agent system should keep work separated without losing the shared goal.",
        ],
        microTask:
          "Choose one large task and split it into three focused agent roles. Name the role and the result each role should return.",
        questions: [
          {
            id: "q1",
            prompt: "What problem does the lesson identify as a major reason to use multiple agents?",
            options: [
              "Too much work competing for one context",
              "The single agent has no intelligence at all",
              "The task must always use four agents",
              "Every tool must be replaced by another agent",
            ],
            answerIndex: 0,
            explanation:
              "The lesson frames context pressure as the turning point: research, files, decisions, drafts, and corrections can crowd one agent's working context.",
          },
          {
            id: "q2",
            prompt: "Which split best matches the idea of focused contexts?",
            options: [
              "Research agent, analysis agent, writing agent, and review agent",
              "Four agents all reading everything and writing the same final answer",
              "One agent with a longer name and no separated work",
              "A timer, a file, a button, and a color palette",
            ],
            answerIndex: 0,
            explanation:
              "The roles separate the work while still supporting one shared goal.",
          },
        ],
      },
      {
        id: "multi-agent-architectures",
        day: 2,
        title: "Multi-Agent Architectures",
        shortTitle: "Architectures",
        minutes: 9,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.architecture,
        assetAlt: "Slide showing hierarchical, peer-to-peer, sequential, and hybrid multi-agent architectures.",
        accentColor: "#9CF66F",
        audioCue: "spark",
        hook:
          "Once you have multiple agents, structure matters. Who leads? Who talks to whom? Where does the work go next?",
        lesson: rich([
          "A multi-agent architecture defines how agents are organised and how work moves between them.",
          "In a hierarchical architecture, one lead agent coordinates the rest. It assigns tasks, tracks progress, and combines results. This gives the system clear control and clear responsibility.",
          "In a sequential architecture, work moves from one agent to the next. Research passes to analysis. Analysis passes to writing. Writing passes to review. The flow is simple and ordered.",
          "In a peer-to-peer architecture, agents communicate directly. They can exchange information, challenge results, and ask one another for help. That gives the system more flexibility, but it also requires more coordination.",
          "A hybrid architecture mixes these patterns. A lead agent may control the overall task while specialist agents communicate directly when needed.",
          "The architecture should fit the work. A review pipeline may work well sequentially. A messy investigation may need peer-to-peer exchange. A production system often uses a hybrid pattern.",
        ]),
        keyIdeas: [
          "Architecture defines how agents are organised.",
          "Architecture also defines how work moves between agents.",
          "Hierarchical, sequential, peer-to-peer, and hybrid patterns fit different kinds of tasks.",
        ],
        microTask:
          "Pick hierarchical, sequential, peer-to-peer, or hybrid for a research-to-report task. Write one sentence explaining why that structure fits.",
        questions: [
          {
            id: "q1",
            prompt: "What does a multi-agent architecture define?",
            options: [
              "How agents are organised and how work moves between them",
              "Only the visual style of the agent interface",
              "The exact model every agent must use",
              "A replacement for communication and coordination",
            ],
            answerIndex: 0,
            explanation:
              "The lesson defines architecture as the structure of agent organisation and work movement.",
          },
          {
            id: "q2",
            prompt: "Which architecture has one lead agent assigning tasks and combining results?",
            options: [
              "Hierarchical",
              "Sequential",
              "Peer-to-peer",
              "No architecture",
            ],
            answerIndex: 0,
            explanation:
              "Hierarchical systems use a lead agent to coordinate the rest.",
          },
        ],
      },
      {
        id: "subagents-and-agent-teams",
        day: 3,
        title: "Subagents and Agent Teams",
        shortTitle: "Subagents vs teams",
        minutes: 8,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.subagentsTeams,
        assetAlt: "Slide comparing subagents with agent teams.",
        accentColor: "#8BE7F0",
        audioCue: "focus",
        hook:
          "Not every group of agents works the same way. Some agents are helpers. Others are team members.",
        lesson: rich([
          "A subagent handles a focused task for a main agent. The main agent delegates the work, the subagent completes it, and then the result returns to the main agent.",
          "In that setup, the main agent stays in control. The subagent supports the main agent rather than sharing full responsibility for the wider goal.",
          "An agent team is different. It contains agents with defined roles inside a shared system. Those agents can communicate directly, share progress, pass work between one another, and take responsibility for different parts of the goal.",
          "The difference is responsibility. With subagents, one main agent leads. With agent teams, responsibility is spread across the system.",
          "That does not make one option better in every situation. A narrow task may only need a subagent. A larger system may need a team with clearer role boundaries and coordination rules.",
        ]),
        keyIdeas: [
          "Subagents handle delegated tasks for a main agent.",
          "Agent teams coordinate within a shared system.",
          "The key difference is how responsibility is distributed.",
        ],
        microTask:
          "For a product-launch plan, write one subagent use case and one agent-team use case. Keep the distinction about responsibility clear.",
        questions: [
          {
            id: "q1",
            prompt: "What makes a subagent different from an agent team member in this lesson?",
            options: [
              "A subagent handles delegated work for a main agent that stays in control",
              "A subagent always communicates with every other agent directly",
              "A subagent is the only agent allowed to make decisions",
              "A subagent is another word for any tool",
            ],
            answerIndex: 0,
            explanation:
              "The main agent delegates to the subagent and remains in control of the wider task.",
          },
          {
            id: "q2",
            prompt: "In an agent team, what is spread across the system?",
            options: [
              "Responsibility for different parts of the goal",
              "Only the user interface colors",
              "One identical context copied into every agent",
              "A single task with no role boundaries",
            ],
            answerIndex: 0,
            explanation:
              "Agent teams have defined roles and shared responsibility across the system.",
          },
        ],
      },
      {
        id: "coordination-and-communication",
        day: 4,
        title: "Coordination and Communication",
        shortTitle: "Coordination",
        minutes: 10,
        points: 100,
        streakBoost: 1,
        assetUrl: assetUrls.coordination,
        assetAlt: "Slide explaining coordination, communication, and the A2A protocol.",
        accentColor: "#7AF1B8",
        audioCue: "spark",
        hook:
          "Multiple agents only help if they can work together. That requires communication and coordination.",
        lesson: rich([
          "Communication is the exchange of information: a task, a question, an update, or a result.",
          "Coordination is the organisation of the work. Who should act? What context do they need? When should the work move? How are results combined? When is the task complete?",
          "Good communication does not mean every agent sees everything. It means the right information reaches the right agent at the right time.",
          "When agents come from different systems, they also need a common way to interact. That is where standards such as Agent2Agent, often shortened to A2A, come in.",
          "A2A gives agents a shared way to describe capabilities, exchange tasks and messages, communicate progress, and return results. It makes cross-system collaboration easier.",
          "The standard enables communication. The system still needs to decide who acts, what is shared, how results are combined, and how the work is verified.",
        ]),
        keyIdeas: [
          "Communication exchanges information.",
          "Coordination turns exchanged information into organised work.",
          "A2A helps agents across different systems discover, communicate, and collaborate.",
        ],
        microTask:
          "Write a three-message handoff between a research agent and a review agent. Include the task, one progress update, and the returned result.",
        questions: [
          {
            id: "q1",
            prompt: "Which statement best separates communication from coordination?",
            options: [
              "Communication exchanges information; coordination organises the work",
              "Communication is always more important than coordination",
              "Coordination means every agent sees every detail",
              "Communication only happens after the task is complete",
            ],
            answerIndex: 0,
            explanation:
              "The lesson defines communication as exchange and coordination as organising who acts, what is shared, and how work moves.",
          },
          {
            id: "q2",
            prompt: "What does A2A enable in this lesson?",
            options: [
              "Agents across different systems can discover, communicate, and collaborate",
              "Every system automatically knows which agent should act",
              "Verification becomes unnecessary",
              "All agents must share the same memory and tools",
            ],
            answerIndex: 0,
            explanation:
              "A2A enables cross-system communication, but the system still needs coordination and verification decisions.",
          },
        ],
      },
      {
        id: "build-a-multi-agent-system",
        day: 5,
        title: "Build a Multi-Agent System",
        shortTitle: "Sandbox build",
        minutes: 15,
        points: 140,
        streakBoost: 1,
        assetUrl: assetUrls.cover,
        assetAlt: "Multi-Agent Systems title slide.",
        accentColor: "#FDE047",
        audioCue: "complete",
        hook:
          "Now design a small system where focused agents share one goal without all carrying the same context.",
        lesson: rich([
          "This sandbox turns the ideas from the path into a small design exercise.",
          "You will create a lead agent, define focused roles, add a routine task, choose a workflow, add memory records, and inspect a lightweight runtime.",
          "The goal is not to build a massive production agent fleet. The goal is to practise the shape of a multi-agent system: separated contexts, useful handoffs, and a clear completion point.",
        ]),
        keyIdeas: [
          "A good multi-agent design gives each agent a focused role.",
          "Scheduled tasks, workflows, memory, and a scoped runtime can support coordination.",
          "The runtime simulation should show what information moves forward and when the system is complete.",
        ],
        microTask:
          "Use the sandbox to configure a lead agent and a small coordinated team. Run the lightweight runtime before testing the agent in chat.",
        sandbox: {
          enabled: true,
          mode: "full",
          title: "Design a Multi-Agent System",
          brief:
            "<p>Configure a small multi-agent design for turning a research packet into a reviewed learner brief.</p>",
          intro: {
            enabled: true,
            eyebrow: "Multi-agent sandbox",
            title: "Split the work, keep the goal shared.",
            body:
              "You will design a small system with a lead agent, focused roles, a scheduled task, a workflow, memory, and a lightweight runtime. Keep the design simple enough to inspect.",
            expectations: [
              "Define a lead agent that coordinates the goal.",
              "Choose focused roles instead of giving every agent everything.",
              "Run the lightweight runtime with run team before finishing.",
            ],
            infoTitle: "What this sandbox simulates",
            infoBody:
              "The computer panel is intentionally lightweight. It acts like an isolated code workspace for learning rather than a full production pod.",
            startLabel: "Start the build",
          },
          completion: {
            title: "Multi-agent system designed",
            body:
              "You created a coordinated agent setup and tested the handoff shape in the sandbox.",
            primaryActionLabel: "Continue",
          },
          capabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tools",
            "tasks",
            "workflows",
            "memory",
            "computer",
            "chat",
            "logs",
            "credits",
          ],
          requiredCapabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tasks",
            "workflows",
            "memory",
            "computer",
            "chat",
          ],
          starterAgent: {
            name: "Learning Brief Coordinator",
            persona:
              "A careful lead agent that coordinates focused agents and combines their useful results.",
            systemPrompt:
              "You are the lead agent for a small multi-agent learning brief system. Your goal is to turn a research packet into a clear learner brief. Delegate mentally to focused roles: research, analysis, writing, and review. Keep each role's context focused. Ask only for information that is needed. Combine results into a concise answer and state what still needs verification.",
          },
          placeholders: {
            agentName: "Learning Brief Coordinator",
            systemPrompt:
              "Define the shared goal, focused roles, handoff rules, and how the final result should be verified.",
            skillInstructions:
              "Describe the focused responsibility this role should handle before returning a result.",
            chatInput:
              "Use the team to outline a learner brief about multi-agent systems. Show the handoffs.",
          },
          starterSkillIds: ["research-role", "review-role"],
          starterToolIds: ["course-material-reader"],
          starterTaskIds: ["weekly-brief-review"],
          skillTemplates: [
            {
              id: "research-role",
              name: "Research role",
              instructions:
                "Find the most relevant source details for the learner brief. Return only the evidence and the uncertainty that matters for the next agent.",
            },
            {
              id: "analysis-role",
              name: "Analysis role",
              instructions:
                "Compare the research notes, identify the core pattern, and decide which points should move forward.",
            },
            {
              id: "writing-role",
              name: "Writing role",
              instructions:
                "Turn the approved points into clear learner-facing prose. Keep terminology consistent with the lesson.",
            },
            {
              id: "review-role",
              name: "Review role",
              instructions:
                "Check whether the brief matches the source material, avoids unsupported claims, and explains the handoff clearly.",
            },
          ],
          toolTemplates: [
            {
              id: "course-material-reader",
              name: "Course material reader",
              description:
                "Simulated access to the uploaded lesson packet and slide notes.",
              connectorKind: "custom",
              simulated: true,
            },
            {
              id: "progress-log",
              name: "Progress log",
              description:
                "Simulated log where agents record task updates and returned results.",
              connectorKind: "custom",
              simulated: true,
            },
          ],
          taskTemplates: [
            {
              id: "weekly-brief-review",
              title: "Weekly learner brief review",
              schedule: "Every Friday at 09:00",
              description:
                "The lead agent asks the review role to check the newest learner brief before it is shared.",
            },
            {
              id: "daily-source-check",
              title: "Daily source packet check",
              schedule: "Every weekday at 08:30",
              description:
                "The research role checks whether new source material changes the brief.",
            },
          ],
          workflowTemplates: [
            {
              id: "sequential-brief-pipeline",
              name: "Sequential brief pipeline",
              trigger: "New research packet is added",
              description:
                "A simple ordered handoff from research to analysis to writing to review.",
              nodes: [
                "Research role extracts relevant source details",
                "Analysis role decides what should move forward",
                "Writing role drafts the learner brief",
                "Review role checks source fit and clarity",
              ],
              edges: [
                "Research result passes to analysis",
                "Analysis summary passes to writing",
                "Draft passes to review",
                "Review result returns to the lead agent",
              ],
            },
            {
              id: "hybrid-brief-pipeline",
              name: "Hybrid brief pipeline",
              trigger: "Lead agent receives a broad learner question",
              description:
                "The lead agent coordinates the system while specialist roles exchange focused updates when needed.",
              nodes: [
                "Lead agent scopes the request",
                "Research and analysis roles exchange focused notes",
                "Writing role drafts from approved points",
                "Review role returns pass or revise",
              ],
              edges: [
                "Lead delegates focused work",
                "Research and analysis exchange only relevant context",
                "Writing receives approved points",
                "Review returns the final status",
              ],
            },
          ],
          memoryTemplates: [
            {
              id: "shared-goal",
              type: "semantic",
              label: "Shared goal",
              content:
                "Create a learner brief that explains multi-agent systems using the course terminology.",
            },
            {
              id: "handoff-rule",
              type: "procedural",
              label: "Handoff rule",
              content:
                "Each role returns a short result, open question, and confidence note. Do not pass the entire working context forward.",
            },
            {
              id: "latest-review",
              type: "episodic",
              label: "Latest review note",
              content:
                "The review role should check that A2A is described as a communication standard, not as a complete coordination strategy.",
            },
          ],
          computerTemplate: {
            workspaceName: "multi-agent-brief-runtime",
            isolationMode:
              "Scoped command simulation for learning. No external network or production pod is started.",
            starterCommand: "run team",
            files: [
              {
                path: "team-plan.json",
                content:
                  '{\n  "architecture": "hybrid",\n  "leadAgent": "Learning Brief Coordinator",\n  "roles": ["research", "analysis", "writing", "review"],\n  "completion": "review result returned to lead agent"\n}',
              },
              {
                path: "runtime.js",
                content:
                  'console.log("Lead receives goal");\nconsole.log("Focused agents work in separate contexts");\nconsole.log("Useful results move forward");\nconsole.log("Review returns final status");',
              },
            ],
          },
          guideSteps: [
            {
              id: "name-lead-agent",
              target: "identity",
              title: "Name the lead agent",
              body:
                "Start with the agent that coordinates the shared goal. This is the place where the system keeps responsibility clear.",
              targetSelector: '[data-sandbox-target="agent-name"]',
              placement: "right",
            },
            {
              id: "shape-the-system-prompt",
              target: "system_prompt",
              title: "Define coordination rules",
              body:
                "The system prompt should describe the shared goal, focused roles, handoff rules, and how the final result is checked.",
              targetSelector: '[data-sandbox-target="system-prompt"]',
              placement: "right",
            },
            {
              id: "choose-focused-roles",
              target: "skills",
              title: "Choose focused roles",
              body:
                "Select the role briefs that should support the lead agent. The point is focused context, not giving every role every job.",
              targetSelector: '[data-sandbox-target="skills"]',
              placement: "right",
            },
            {
              id: "add-routine",
              target: "tasks",
              title: "Add a routine",
              body:
                "Scheduled tasks give the system a repeatable moment to act, such as checking a brief before it is shared.",
              targetSelector: '[data-sandbox-target="tasks"]',
              placement: "right",
            },
            {
              id: "choose-workflow",
              target: "workflows",
              title: "Choose the work movement",
              body:
                "Pick the architecture flow. Notice how the trigger, nodes, and edges define what happens next.",
              targetSelector: '[data-sandbox-target="workflows"]',
              placement: "right",
            },
            {
              id: "set-memory",
              target: "memory",
              title: "Set shared memory",
              body:
                "Memory should carry useful context across the system without making every agent carry every detail.",
              targetSelector: '[data-sandbox-target="memory"]',
              placement: "right",
            },
            {
              id: "run-lightweight-runtime",
              target: "computer",
              title: "Run the lightweight runtime",
              body:
                "Use run team to inspect how the system would move the task through focused contexts.",
              targetSelector: '[data-sandbox-target="computer-command"]',
              placement: "right",
            },
            {
              id: "test-handoff",
              target: "chat",
              title: "Test the handoff",
              body:
                "Ask the agent to show how the team would create a learner brief and what needs review.",
              targetSelector: '[data-sandbox-target="chat-input"]',
              placement: "top",
            },
          ],
          review: {
            enabled: true,
            required: false,
            targets: ["system_prompt", "skills"],
            minScore: 74,
            rubric:
              "Score clarity of the shared goal, role separation, handoff rules, memory use, and whether A2A is treated as communication support rather than a complete coordination strategy.",
            model: "gpt-4o-mini",
          },
          creditReward: 220,
          completionEventType: "agent_sandbox_completed",
        },
        questions: [],
      },
    ],
  };
}

function createCourseModuleFromSkillPack(skillPack) {
  return {
    title: skillPack.title,
    description:
      skillPack.learnerPromise ||
      "<p>Learn how focused agents coordinate inside a multi-agent system.</p>",
    lessons: skillPack.challenges.map((challenge) => ({
      title: challenge.title,
      duration: String(challenge.minutes || 5),
      description: challenge.lesson,
      assetUrl: challenge.assetUrl,
      assetAlt: challenge.assetAlt,
      isFree: challenge.day === 1,
    })),
  };
}

async function main() {
  assertConfigured();
  await mongoose.connect(uri);

  const course = await Course.findOne({ slug: targetCourseSlug });
  if (!course) {
    throw new Error(`Course not found: ${targetCourseSlug}`);
  }

  const assetUrls = {
    cover: await upsertMedia(assetFiles.cover),
    multipleAgents: await upsertMedia(assetFiles.multipleAgents),
    architecture: await upsertMedia(assetFiles.architecture),
    subagentsTeams: await upsertMedia(assetFiles.subagentsTeams),
    coordination: await upsertMedia(assetFiles.coordination),
  };

  const skillPack = createSkillPack(assetUrls);
  const skillPacks = Array.isArray(course.skillPacks) ? course.skillPacks : [];
  const nextSkillPacks = [
    ...skillPacks.filter((pack) => pack?.slug !== skillSlug),
    skillPack,
  ];
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const skillModule = createCourseModuleFromSkillPack(skillPack);
  const nextModules = [
    ...modules.filter((module) => module?.title !== skillModule.title),
    skillModule,
  ];

  await Course.updateOne(
    { _id: course._id },
    {
      $set: {
        skillPacks: nextSkillPacks,
        modules: nextModules,
        modulesCount: nextModules.length,
        lessonsCount: nextModules.reduce(
          (sum, module) => sum + (module.lessons?.length || 0),
          0
        ),
        updatedAt: new Date(),
      },
    }
  );

  console.log(
    `Seeded ${skillPack.title} under ${targetCourseSlug}: /skills/${skillSlug}`
  );
}

function assertConfigured() {
  const missing = [];
  if (useStaticAssets) {
    if (!staticBaseUrl) missing.push("COURSE_MEDIA_STATIC_BASE_URL or NEXT_PUBLIC_BASE_URL");
    if (missing.length) {
      throw new Error(`Missing required env vars: ${missing.join(", ")}`);
    }
    return;
  }
  if (!bucket) missing.push("COURSE_MEDIA_S3_BUCKET");
  if (!region) missing.push("COURSE_MEDIA_S3_REGION");
  if (!publicBaseUrl) missing.push("COURSE_MEDIA_CDN_URL or COURSE_MEDIA_PUBLIC_URL");
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
