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

const sourceDir = "/Users/bashybaranaba/Downloads/Copy of Commons-Education (2)";
const skillSlug = "make-your-agent-powerful";
const targetCourseSlug = "ai-fluency-starter";

const assetFiles = {
  cover: "13.png",
  scheduledTasks: "14.png",
  workflowAutomation: "15.png",
  workflowComponents: "16.png",
  memory: "17.png",
  computer: "18.png",
};

function rich(paragraphs) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

async function upsertMedia(filename) {
  const filePath = path.join(sourceDir, filename);
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
      roleSessionName: "commonlab-course-media-seed",
    }),
  });
}

function createSkillPack(assetUrls) {
  return {
    slug: skillSlug,
    enabled: true,
    title: "Make Your Agent Powerful",
    subtitle:
      "Learn the systems that help agents do more useful work.",
    coverUrl: assetUrls.cover,
    learnerPromise:
      "By the end, you will know how scheduled tasks, workflow automation, memory, and agent computers make agents more useful.",
    challenges: [
      {
        id: "powerful-agent-map",
        day: 1,
        title: "Scheduled and Routine Tasks",
        shortTitle: "Scheduled tasks",
        minutes: 9,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.scheduledTasks,
        assetAlt: "Scheduled and Routine Tasks slide explaining cron jobs.",
        accentColor: "#8BE7F0",
        audioCue: "focus",
        hook:
          "A scheduled task gives the agent a routine.",
        lesson: rich([
          "So far, you have looked at how to create an agent. You looked at the system prompt, tools, and skills.",
          "Those pieces give the agent an identity, capabilities, and a way of working.",
          "A useful next step is giving the agent a routine. A scheduled task tells the agent when to do something.",
          "It might check a report every morning. It might send a reminder every Friday. It might summarize new updates at the end of each day.",
          "In technical terms, this can be done with tasks and cron jobs. A cron job is a scheduled instruction that runs at a specific time or interval.",
          "Instead of waiting for a new prompt every time, the agent can keep up with the routine.",
        ]),
        keyIdeas: [
          "A scheduled task tells the agent when to do something.",
          "A cron job runs at a specific time or interval.",
          "Routines help the agent keep up without a fresh prompt every time.",
        ],
        microTask:
          "Write one scheduled instruction for the learning-report agent. Include when it should run and what it should do.",
        questions: [
          {
            id: "q1",
            prompt: "What is a cron job in this lesson?",
            options: [
              "A scheduled instruction that runs a task at a set time or interval",
              "A task with no set time or interval",
              "A timer with no instruction attached",
              "A new name for any agent response",
            ],
            answerIndex: 0,
            explanation:
              "The slide defines cron jobs as scheduled instructions for set times or intervals.",
          },
          {
            id: "q2",
            prompt: "Which task is the strongest fit for scheduling?",
            options: [
              "Prepare a weekly progress summary every Friday",
              "Answer one unexpected question with no routine pattern",
              "Change the agent's name at a random time",
              "Run a vague task without saying what should happen",
            ],
            answerIndex: 0,
            explanation:
              "A weekly progress summary is routine work with a clear interval.",
          },
        ],
      },
      {
        id: "workflow-automation",
        day: 2,
        title: "Workflow Automation",
        shortTitle: "Workflow automation",
        minutes: 8,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.workflowAutomation,
        assetAlt: "Workflow Automation slide explaining automated workflows.",
        accentColor: "#7DBCEA",
        audioCue: "spark",
        hook:
          "Workflow automation gives the agent a structured process to follow.",
        lesson: rich([
          "An agent becomes more capable when it can move through a process instead of handling each step as a separate request.",
          "That is where workflow automation comes in. An automated workflow is a self-running pipeline of connected steps, data, decisions, and actions.",
          "For example, the agent might collect information, check what is missing, use a tool, update a file, and send a summary.",
          "The workflow connects those steps together. It helps the agent move from start to result without treating every step as a new task.",
        ]),
        keyIdeas: [
          "An automated workflow is a self-running pipeline.",
          "Workflows connect steps, data, decisions, and actions.",
          "A workflow helps the agent move through a process.",
        ],
        microTask:
          "Sketch a four-step workflow for the learning-report agent using short step names.",
        questions: [
          {
            id: "q1",
            prompt: "What does an automated workflow connect?",
            options: [
              "Steps, data, decisions, and actions",
              "Only one isolated response",
              "Only a task name with no steps",
              "Only a timer with no result",
            ],
            answerIndex: 0,
            explanation:
              "The slide defines the workflow as connected steps, data, decisions, and actions.",
          },
          {
            id: "q2",
            prompt: "Why is workflow visibility useful?",
            options: [
              "You can inspect where work started, what ran, and what came out",
              "It guarantees no step can ever fail",
              "It removes the need for a clear trigger",
              "It turns every task into a one-step task",
            ],
            answerIndex: 0,
            explanation:
              "Visible steps make workflow behavior easier to test and improve.",
          },
        ],
      },
      {
        id: "workflow-components",
        day: 3,
        title: "Workflow Components",
        shortTitle: "Workflow components",
        minutes: 8,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.workflowComponents,
        assetAlt: "Workflow Components slide explaining trigger, node, and edge.",
        accentColor: "#86EFAC",
        audioCue: "focus",
        hook:
          "A workflow has parts that define how work starts, what happens, and where it goes next.",
        lesson: rich([
          "A trigger initiates the workflow. It can be a scheduled time, a new message, a file upload, or a manual action.",
          "A node is a step within the workflow. A node may check information, use a tool, make a decision, or request approval.",
          "An edge defines the connection between nodes. It guides the workflow on what should happen next.",
          "The path between nodes can be straightforward: do this action, then that action. It can also be conditional.",
          "If the information is complete, the workflow proceeds. If something is missing, it asks for clarification. If approval is required, it pauses for human input.",
          "A workflow is more than a list of tasks. It is a connected process that helps the agent move from start to finish.",
        ]),
        keyIdeas: [
          "Trigger starts the workflow.",
          "Node is a step in the workflow.",
          "Edge is the path that connects steps.",
        ],
        microTask:
          "Label one trigger, three nodes, and two edges for the learning-report workflow.",
        questions: [
          {
            id: "q1",
            prompt: "Which component starts the workflow?",
            options: ["Trigger", "Node", "Edge", "Report"],
            answerIndex: 0,
            explanation: "The trigger starts the workflow.",
          },
          {
            id: "q2",
            prompt: "In a workflow, what is an edge?",
            options: [
              "The path that connects steps",
              "The step that does the work",
              "The event that starts the workflow",
              "The final report produced by the workflow",
            ],
            answerIndex: 0,
            explanation: "The slide defines an edge as the path that connects steps.",
          },
        ],
      },
      {
        id: "organizing-agent-memory",
        day: 4,
        title: "Organizing Agent Memory",
        shortTitle: "Agent memory",
        minutes: 9,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.memory,
        assetAlt: "Organizing Agent Memory slide with working, semantic, episodic, and procedural memory.",
        accentColor: "#86EFAC",
        audioCue: "focus",
        hook:
          "Memory helps the agent work with continuity instead of starting from scratch.",
        lesson: rich([
          "Without memory, the agent starts from scratch each time. It may forget what you prefer, what already happened, or how a task should be done.",
          "A good memory system organizes different kinds of context.",
          "Working memory is current session context. It is what the agent is using right now.",
          "Semantic memory stores facts and knowledge.",
          "Episodic memory stores events and experiences.",
          "Procedural memory stores behaviors and methods.",
          "Memory is not just saving old conversations. It is organizing useful context so the agent can work with more continuity.",
        ]),
        keyIdeas: [
          "Working memory is current session context.",
          "Semantic memory is facts and knowledge.",
          "Episodic memory is events and experiences.",
          "Procedural memory is behaviors and methods.",
        ],
        microTask:
          "Sort one example detail into working, semantic, episodic, or procedural memory.",
        questions: [
          {
            id: "q1",
            prompt: "Which memory type stores current session context?",
            options: [
              "Working memory",
              "Semantic memory",
              "Episodic memory",
              "Procedural memory",
            ],
            answerIndex: 0,
            explanation: "Working memory is the current session context.",
          },
          {
            id: "q2",
            prompt: "Which memory type best stores behaviors and methods?",
            options: [
              "Procedural memory",
              "Working memory",
              "Semantic memory",
              "Episodic memory",
            ],
            answerIndex: 0,
            explanation:
              "Procedural memory stores behaviors and methods the agent can reuse.",
          },
        ],
      },
      {
        id: "give-agent-computer",
        day: 5,
        title: "Give Your Agent a Computer",
        shortTitle: "Agent computer",
        minutes: 8,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.computer,
        assetAlt:
          "Give Your Agent A Computer slide explaining persistent workspace and meaningful isolation.",
        accentColor: "#6EE7D8",
        audioCue: "focus",
        hook:
          "An agent computer gives the agent its own environment for real work.",
        lesson: rich([
          "Giving an agent a computer does not just mean giving it more tools. It means giving it a real environment where it can work.",
          "This matters because real work often takes more than one message. The agent may need to return to the same project, inspect files again, or continue from where it stopped.",
          "A persistent workspace gives the agent a dedicated place for long-running tasks and projects. It can keep track of files, browser work, and task state over time.",
          "The workspace also needs meaningful isolation. The agent should not take over your own computer or your own accounts.",
          "It should work inside a separate, scoped environment. That gives the agent room to work, with clear limits around what it can access or change.",
          "In this learning sandbox, the computer is lightweight. It works more like a safe online code editor than a full production machine.",
        ]),
        keyIdeas: [
          "An agent computer gives the agent an environment where it can work.",
          "A persistent workspace helps the agent continue long-running tasks.",
          "Meaningful isolation keeps that work separate and scoped.",
        ],
        microTask:
          "Name two files a learning-report agent should keep in its scoped workspace.",
        questions: [
          {
            id: "q1",
            prompt: "What is a persistent workspace?",
            options: [
              "A dedicated workspace for long-running tasks and projects",
              "A one-time chat message that disappears after a response",
              "A workflow edge that connects two steps",
              "A memory type for current session context only",
            ],
            answerIndex: 0,
            explanation:
              "The slide defines persistent workspace as a dedicated workspace for long-running tasks and projects.",
          },
          {
            id: "q2",
            prompt: "What does meaningful isolation provide?",
            options: [
              "A separate, scoped environment where the agent can work safely",
              "Unlimited access to every system and file",
              "A replacement for scheduled tasks",
              "A way to skip workflow design",
            ],
            answerIndex: 0,
            explanation:
              "Meaningful isolation keeps the agent's workspace separate and scoped.",
          },
        ],
      },
      {
        id: "power-up-agent-sandbox",
        day: 6,
        title: "Power Up an Agent in the Sandbox",
        shortTitle: "Power sandbox",
        minutes: 16,
        points: 130,
        streakBoost: 2,
        assetUrl: assetUrls.computer,
        assetAlt: "Give Your Agent A Computer slide explaining persistent workspace and meaningful isolation.",
        accentColor: "#6EE7D8",
        audioCue: "complete",
        hook:
          "Now practice the pieces together in one agent design.",
        lesson: rich([
          "You have studied each power-up separately. The final step is to combine them without losing track of what each one does.",
          "In this sandbox, you will design a learning-report agent. Add the scheduled task first. Then inspect the workflow, organize memory, and use the lightweight computer workspace.",
          "Create the agent when the configuration makes sense. Then run one chat test and inspect the logs. The goal is not the biggest possible agent. The goal is a more capable agent whose behavior you can still explain.",
        ]),
        keyIdeas: [
          "Add one capability at a time.",
          "Check what each capability is responsible for.",
          "Powerful agents should still be inspectable.",
        ],
        microTask:
          "Configure the power-up surfaces, create the agent, run a test, and read the logs.",
        practicalSignal: {
          id: "powerful-agent-sandbox-completed",
          platform: "agent_commons",
          eventType: "agent_sandbox_completed",
          label: "Power up an agent",
          description:
            "Complete the guided sandbox by configuring scheduled tasks, workflow components, memory, and a lightweight computer workspace.",
        },
        sandbox: {
          enabled: true,
          mode: "builder",
          title: "Make your agent powerful",
          brief:
            "<p>Upgrade a learning-report agent one capability at a time. Start with the schedule, then inspect the workflow, memory, and workspace.</p>",
          intro: {
            enabled: true,
            eyebrow: "Power lab",
            title: "Give your agent more than chat",
            body:
              "You will configure one part at a time: a routine schedule, a workflow, organized memory, and a lightweight isolated workspace.",
            expectations: [
              "Keep the agent's identity and system prompt clear.",
              "Select a scheduled routine task.",
              "Inspect and run the workflow simulation.",
              "Organize memory records into the right memory types.",
              "Run a simple command in the scoped computer workspace.",
              "Create the agent, test it in chat, and inspect the logs.",
            ],
            infoTitle: "About the computer runtime",
            infoBody:
              "This lesson uses a lightweight simulated computer workspace so learners can practice safely without provisioning a full production environment.",
            startLabel: "Proceed to sandbox",
          },
          completion: {
            title: "Your agent has power-ups",
            body:
              "You configured and tested an agent with scheduled work, workflow structure, memory, and a scoped computer workspace.",
            primaryActionLabel: "Continue learning",
          },
          capabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tools",
            "connectors",
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
            "logs",
          ],
          placeholders: {
            agentName: "Learning Report Agent",
            systemPrompt:
              "You are a learning-report agent. Help the learner review weekly progress, identify what changed, and prepare clear next steps. Keep scheduled work scoped, explain important assumptions, and ask before using connected tools.",
            skillInstructions:
              "Prepare a concise weekly learning report. Check the learner's goal, summarize progress, name one blocker, and suggest three next actions. Use memory carefully: current context first, then relevant facts, events, and methods.",
            chatInput:
              "Prepare a short learning report using the sandbox setup.",
          },
          starterAgent: {
            name: "Learning Report Agent",
            persona: "A practical progress-review assistant for learners",
            systemPrompt:
              "You are a learning-report agent. Help the learner review weekly progress, identify what changed, and prepare clear next steps. Keep scheduled work scoped, explain important assumptions, and ask before using connected tools.",
          },
          starterSkillIds: ["weekly-report-method"],
          starterToolIds: [],
          starterTaskIds: ["friday-learning-report"],
          skillTemplates: [
            {
              id: "weekly-report-method",
              name: "Weekly report method",
              instructions:
                "Start with the learner's current goal. Summarize visible progress, identify one blocker or uncertainty, and propose three next actions. Keep the report short and separate facts from suggestions.",
            },
            {
              id: "memory-check-method",
              name: "Memory check method",
              instructions:
                "Before preparing a report, check working memory for current context, semantic memory for stable facts, episodic memory for recent events, and procedural memory for the reporting method.",
            },
          ],
          toolTemplates: [
            {
              id: "google-drive",
              name: "Google Drive",
              connectorKind: "google_drive",
              description:
                "Use learner-approved notes or documents as context for progress summaries.",
              simulated: false,
            },
            {
              id: "google-sheets",
              name: "Google Sheets",
              connectorKind: "google_sheets",
              description:
                "Read an approved progress tracker when the learner grants access.",
              simulated: false,
            },
          ],
          taskTemplates: [
            {
              id: "friday-learning-report",
              title: "Friday learning report",
              schedule: "Every Friday at 16:00",
              description:
                "Review the week's learning context and prepare a short progress report with three next actions.",
            },
            {
              id: "monday-plan-check",
              title: "Monday plan check",
              schedule: "Every Monday at 09:00",
              description:
                "Check whether the learner has a realistic plan for the week and flag missing context.",
            },
          ],
          workflowTemplates: [
            {
              id: "weekly-report-workflow",
              name: "Weekly learning report workflow",
              trigger: "Friday learning report scheduled task",
              description:
                "A visible self-running pipeline for the weekly learning report.",
              nodes: [
                "Collect current learning context",
                "Check organized memory",
                "Summarize progress and blockers",
                "Draft three next actions",
              ],
              edges: [
                "Collect context -> Check organized memory",
                "Check organized memory -> Summarize progress and blockers",
                "Summarize progress and blockers -> Draft three next actions",
              ],
            },
          ],
          memoryTemplates: [
            {
              id: "current-goal",
              type: "working",
              label: "Current goal",
              content: "The learner is practicing agent workflows this week.",
            },
            {
              id: "course-fact",
              type: "semantic",
              label: "Course fact",
              content: "Workflow components include trigger, node, and edge.",
            },
            {
              id: "recent-event",
              type: "episodic",
              label: "Recent event",
              content: "The learner completed the first-agent sandbox earlier.",
            },
            {
              id: "report-method",
              type: "procedural",
              label: "Report method",
              content:
                "Use a short structure: progress, blocker, next actions.",
            },
          ],
          computerTemplate: {
            workspaceName: "learning-report-workspace",
            isolationMode:
              "Scoped learning sandbox with sample files and no external side effects.",
            starterCommand: "ls",
            files: [
              {
                path: "weekly-notes.md",
                content:
                  "# Weekly notes\n- Built first agent\n- Learned scheduled tasks\n- Need more practice with workflow components\n",
              },
              {
                path: "report-template.md",
                content:
                  "Progress:\nBlocker:\nNext actions:\n1.\n2.\n3.\n",
              },
            ],
          },
          guideSteps: [
            {
              id: "identity",
              target: "identity",
              title: "Confirm identity",
              body:
                "Keep the agent role specific: it prepares learning reports, not every possible kind of report.",
              targetSelector: '[data-sandbox-target="agent-name"]',
              placement: "right",
            },
            {
              id: "skill",
              target: "skills",
              title: "Review the method",
              body:
                "The skill gives the agent a repeatable way to prepare reports.",
              targetSelector: '[data-sandbox-target="skills"]',
              placement: "right",
            },
            {
              id: "task",
              target: "tasks",
              title: "Choose the schedule",
              body:
                "Select a routine task so the agent has a clear time and instruction.",
              targetSelector: '[data-sandbox-target="tasks"]',
              placement: "right",
            },
            {
              id: "workflow",
              target: "workflows",
              title: "Run the workflow simulation",
              body:
                "Inspect the trigger, nodes, and edges. Then run the simulation to see the pipeline.",
              targetSelector: '[data-sandbox-target="workflow-run"]',
              placement: "right",
            },
            {
              id: "memory",
              target: "memory",
              title: "Organize memory",
              body:
                "Check how working, semantic, episodic, and procedural memory each store a different kind of context.",
              targetSelector: '[data-sandbox-target="memory"]',
              placement: "right",
            },
            {
              id: "computer",
              target: "computer",
              title: "Use the scoped computer",
              body:
                "Run ls or cat weekly-notes.md to inspect the lightweight workspace.",
              targetSelector: '[data-sandbox-target="computer-command"]',
              placement: "right",
            },
            {
              id: "create",
              target: "publish",
              title: "Create the powered-up agent",
              body:
                "Create the real Agent Commons agent after the power-up design is coherent.",
              targetSelector: '[data-sandbox-target="create-agent"]',
              placement: "top",
            },
            {
              id: "test",
              target: "chat",
              title: "Test and inspect",
              body:
                "Send the test message and read the logs to confirm what happened.",
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
              "Score clarity, scope, scheduled-task safety, workflow visibility, memory organization, and whether the computer workspace is treated as a scoped environment.",
            model: "gpt-4o-mini",
          },
          creditReward: 180,
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
      "<p>Learn how scheduled tasks, workflows, memory, and scoped workspaces make agents more capable.</p>",
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
    scheduledTasks: await upsertMedia(assetFiles.scheduledTasks),
    workflowAutomation: await upsertMedia(assetFiles.workflowAutomation),
    workflowComponents: await upsertMedia(assetFiles.workflowComponents),
    memory: await upsertMedia(assetFiles.memory),
    computer: await upsertMedia(assetFiles.computer),
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
