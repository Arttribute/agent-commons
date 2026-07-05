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
      "Add scheduled tasks, workflows, memory, and a scoped computer workspace to your agent design.",
    coverUrl: assetUrls.cover,
    learnerPromise:
      "By the end, you will know how stronger agents move from one-off chat into scheduled, connected, remembered, and safely isolated work.",
    challenges: [
      {
        id: "powerful-agent-map",
        day: 1,
        title: "What Makes an Agent Powerful",
        shortTitle: "Power map",
        minutes: 6,
        points: 70,
        streakBoost: 1,
        assetUrl: assetUrls.cover,
        assetAlt: "Title slide: Make your AI Agent Powerful.",
        accentColor: "#8BE7F0",
        audioCue: "spark",
        hook:
          "A useful first agent can answer and act. A powerful agent can also keep time, follow a process, remember useful context, and work in a scoped environment.",
        lesson: rich([
          "In the previous path, you created your first agent by shaping its identity, system prompt, skills, and tools. This path builds on that foundation.",
          "The next question is not just what the agent can say. It is how the agent can keep working reliably. That is where scheduled tasks, workflows, memory, and agent computers come in.",
          "We will use one example throughout: a learning-report agent. It can check progress on a routine schedule, follow a workflow, keep useful memory organized, and use a scoped computer workspace for files and lightweight commands.",
          "The goal is to make the agent more capable without making its behavior mysterious. Each added capability should have a clear job and a clear limit.",
        ]),
        keyIdeas: [
          "Powerful agents keep time, follow process, remember context, and work safely.",
          "Extra capability should come with clear scope.",
          "The same learning-report example will carry through the path.",
        ],
        microTask:
          "Name one routine your agent should handle without waiting for a fresh prompt every time.",
        questions: [
          {
            id: "q1",
            prompt: "Which set best matches this path's focus?",
            options: [
              "Scheduled tasks, workflows, memory, and agent computers",
              "Only naming the agent and choosing a profile picture",
              "Replacing the system prompt with a longer greeting",
              "Removing tools so the agent only writes responses",
            ],
            answerIndex: 0,
            explanation:
              "This path adds capability around time, process, memory, and a safe workspace.",
          },
          {
            id: "q2",
            prompt: "Why should each added capability have a clear scope?",
            options: [
              "So the agent knows what the capability is for and what its limits are",
              "So the agent can ignore its system prompt",
              "So every task becomes fully automatic without review",
              "So learners never need to inspect logs or outputs",
            ],
            answerIndex: 0,
            explanation:
              "Scope keeps powerful behavior understandable and easier to test.",
          },
        ],
      },
      {
        id: "scheduled-routine-tasks",
        day: 2,
        title: "Scheduled and Routine Tasks",
        shortTitle: "Scheduled tasks",
        minutes: 7,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.scheduledTasks,
        assetAlt: "Scheduled and Routine Tasks slide explaining cron jobs.",
        accentColor: "#8BE7F0",
        audioCue: "focus",
        hook:
          "Scheduled tasks let an agent run useful instructions at a set time or interval.",
        lesson: rich([
          "A cron job is a scheduled instruction. It tells a system to run a task at a set time or interval. For agents, that means some work can start without the user opening a new chat first.",
          "Our learning-report agent might run every Friday afternoon. The scheduled instruction could say: review this week's learning notes, summarize progress, and prepare three next steps.",
          "The important detail is that the schedule and the instruction work together. A schedule without a clear task is just a timer. A task without a schedule still needs someone to start it.",
          "Scheduled tasks are best for routines: reminders, check-ins, recurring summaries, monitoring, and repeated preparation.",
        ]),
        keyIdeas: [
          "A cron job is a scheduled instruction.",
          "Scheduled tasks run at a set time or interval.",
          "Routine work needs both timing and a clear instruction.",
        ],
        microTask:
          "Write one scheduled instruction for the learning-report agent. Include when it should run and what it should do.",
        questions: [
          {
            id: "q1",
            prompt: "What is a cron job in this lesson?",
            options: [
              "A scheduled instruction that runs a task at a set time or interval",
              "A memory type for storing personal facts",
              "The path that connects workflow steps",
              "A computer workspace for long-running projects",
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
              "Change the agent's name one random time",
              "Ask the user to rewrite the system prompt every minute",
              "Delete memory whenever the agent learns something",
            ],
            answerIndex: 0,
            explanation:
              "A weekly progress summary is routine work with a clear interval.",
          },
        ],
      },
      {
        id: "workflow-automation",
        day: 3,
        title: "Workflow Automation",
        shortTitle: "Workflows",
        minutes: 8,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.workflowAutomation,
        assetAlt: "Workflow Automation slide explaining automated workflows.",
        accentColor: "#7DBCEA",
        audioCue: "spark",
        hook:
          "An automated workflow turns separate steps into a self-running pipeline.",
        lesson: rich([
          "An automated workflow is a self-running pipeline of connected steps, data, decisions, and actions.",
          "That definition matters because a workflow is not just a checklist. Data moves through it. Decisions can change what happens next. Actions complete useful work.",
          "For the learning-report agent, a workflow could start when the weekly schedule fires. It gathers learning notes, summarizes progress, decides whether anything is missing, and prepares a report.",
          "A good workflow makes the path of work visible. You can inspect where the task started, which steps ran, what data moved, and what action came out.",
        ]),
        keyIdeas: [
          "An automated workflow is a self-running pipeline.",
          "Workflows connect steps, data, decisions, and actions.",
          "A visible workflow is easier to test and improve.",
        ],
        microTask:
          "Sketch a four-step workflow for the learning-report agent using short step names.",
        questions: [
          {
            id: "q1",
            prompt: "What does an automated workflow connect?",
            options: [
              "Steps, data, decisions, and actions",
              "Only the agent's name and avatar",
              "Only unrelated memories",
              "Only one response with no follow-up action",
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
              "It makes memory unnecessary",
            ],
            answerIndex: 0,
            explanation:
              "Visible steps make workflow behavior easier to test and improve.",
          },
        ],
      },
      {
        id: "workflow-components",
        day: 4,
        title: "Workflow Components",
        shortTitle: "Components",
        minutes: 8,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.workflowComponents,
        assetAlt: "Workflow Components slide explaining trigger, node, and edge.",
        accentColor: "#86EFAC",
        audioCue: "focus",
        hook:
          "A workflow becomes easier to reason about when you can name the trigger, node, and edge.",
        lesson: rich([
          "A trigger starts the workflow. It might be a schedule, a form submission, a file upload, or another event.",
          "A node is a step in the workflow. In our learning-report example, one node might collect notes, another might summarize progress, and another might draft next steps.",
          "An edge is the path that connects steps. Edges show how the workflow moves from one node to another.",
          "Trigger, node, and edge are simple terms, but they make workflow design sharper. You can ask: what starts this, what steps must happen, and how are those steps connected?",
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
            options: ["Trigger", "Node", "Edge", "Semantic memory"],
            answerIndex: 0,
            explanation: "The trigger starts the workflow.",
          },
          {
            id: "q2",
            prompt: "In a workflow, what is an edge?",
            options: [
              "The path that connects steps",
              "The current session context",
              "A dedicated computer workspace",
              "A fact the agent knows",
            ],
            answerIndex: 0,
            explanation: "The slide defines an edge as the path that connects steps.",
          },
        ],
      },
      {
        id: "organizing-agent-memory",
        day: 5,
        title: "Organizing Agent Memory",
        shortTitle: "Memory",
        minutes: 9,
        points: 90,
        streakBoost: 1,
        assetUrl: assetUrls.memory,
        assetAlt: "Organizing Agent Memory slide with working, semantic, episodic, and procedural memory.",
        accentColor: "#86EFAC",
        audioCue: "focus",
        hook:
          "Agent memory is easier to trust when different kinds of memory are kept in the right place.",
        lesson: rich([
          "Working memory is current session context. It helps the agent keep track of what is happening right now in the conversation or task.",
          "Semantic memory stores facts and knowledge. For the learning-report agent, this might include the learner's course name or the meaning of a rubric term.",
          "Episodic memory stores events and experiences. It can capture that the learner struggled with workflow components last week or completed a practice lab yesterday.",
          "Procedural memory stores behaviors and methods. It tells the agent how to do a kind of work, such as how to prepare a concise weekly report.",
          "When memory is organized, the agent does not treat every remembered detail the same way. Current context, facts, events, and methods each have a different job.",
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
        id: "power-up-agent-sandbox",
        day: 6,
        title: "Power Up an Agent in the Sandbox",
        shortTitle: "Power lab",
        minutes: 16,
        points: 130,
        streakBoost: 2,
        assetUrl: assetUrls.computer,
        assetAlt: "Give Your Agent A Computer slide explaining persistent workspace and meaningful isolation.",
        accentColor: "#6EE7D8",
        audioCue: "complete",
        hook:
          "Now combine scheduled tasks, workflow automation, organized memory, and a scoped computer workspace.",
        lesson: rich([
          "A persistent workspace is a dedicated workspace for long-running tasks and projects. Meaningful isolation is a separate, scoped environment where the agent can work safely.",
          "In this sandbox, you will design a learning-report agent with a scheduled task, workflow, memory records, and a lightweight computer workspace. The computer is intentionally small and simulated for learning, similar to a safe online code editor rather than a full production machine.",
          "Create the agent when the configuration makes sense, run one chat test, and inspect the logs. The goal is not to make the biggest possible agent. The goal is to make a more capable agent whose behavior you can still explain.",
        ]),
        keyIdeas: [
          "Persistent workspace supports long-running tasks and projects.",
          "Meaningful isolation gives the agent a scoped place to work safely.",
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
            "<p>Upgrade a learning-report agent with scheduled work, a visible workflow, organized memory, and a scoped computer workspace.</p>",
          intro: {
            enabled: true,
            eyebrow: "Power lab",
            title: "Give your agent more than chat",
            body:
              "You will configure a learning-report agent that can run on a routine schedule, follow a workflow, keep memory organized, and use a lightweight isolated workspace.",
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
