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

const CourseSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Course = mongoose.models.Course || mongoose.model("Course", CourseSchema);

const sourceDir = "/Users/bashybaranaba/Downloads/Creating an AI Agenmt";
const skillSlug = "creating-an-ai-agent";
const targetCourseSlug = "ai-fluency-starter";

const assetFiles = {
  cover: "8.png",
  systemPrompt: "9.png",
  goodPrompt: "10.png",
  tools: "11.png",
  skills: "12.png",
};

function rich(paragraphs) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

async function upsertMedia(filename) {
  const filePath = path.join(sourceDir, filename);
  const data = fs.readFileSync(filePath);
  const key = `course-media/${targetCourseSlug}/${skillSlug}/${filename}`;
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
    title: "Creating an AI Agent",
    subtitle: "Learn system prompts, skills, tools, and then build a beginner agent.",
    coverUrl: assetUrls.cover,
    learnerPromise:
      "By the end, you will understand the parts of an AI agent and create one in the CommonLab agent sandbox.",
    challenges: [
      {
        id: "system-prompt-soul",
        day: 1,
        title: "The Soul: The System Prompt",
        shortTitle: "System prompt",
        minutes: 7,
        points: 70,
        streakBoost: 1,
        assetUrl: assetUrls.systemPrompt,
        assetAlt: "A friendly AI agent with the title The Soul: The System Prompt.",
        accentColor: "#8BE7F0",
        audioCue: "focus",
        hook: "If the LLM is the brain, the system prompt is the soul.",
        lesson: rich([
          "So far, we have looked at the basic idea of AI agents. An LLM is the brain that powers today's AI agents. Now let's look at the system prompt.",
          "The system prompt gives the agent its identity. It tells the agent who it is, how it should behave, what it should care about, what rules it must follow, and what kind of work it is meant to do.",
          "The LLM provides intelligence, and the system prompt gives that intelligence direction. The same LLM can behave in many different ways depending on the system prompt.",
          "It can act like a learning coach, a legal information assistant, or a coding partner. The system prompt shapes how the agent behaves.",
        ]),
        keyIdeas: [
          "The LLM provides intelligence.",
          "The system prompt gives intelligence direction.",
          "Changing the system prompt can change the agent's behavior.",
        ],
        microTask: "Write one sentence that describes what your future agent should be.",
        questions: [
          {
            id: "q1",
            prompt: "What does a system prompt mainly give an agent?",
            options: [
              "Identity, behavior, priorities, and rules",
              "A billing account",
              "A faster internet connection",
              "A database table",
            ],
            answerIndex: 0,
            explanation:
              "A system prompt tells the agent who it is, how to behave, and what standards to follow.",
          },
          {
            id: "q2",
            prompt: "Why can the same LLM act like different agents?",
            options: [
              "Different system prompts can shape different roles and behaviors",
              "The model forgets its training every time",
              "Agents do not use LLMs",
              "Tools automatically rewrite every response",
            ],
            answerIndex: 0,
            explanation:
              "The system prompt gives the same intelligence a different role, tone, and direction.",
          },
        ],
      },
      {
        id: "writing-good-system-prompts",
        day: 2,
        title: "A Good System Prompt",
        shortTitle: "Prompt quality",
        minutes: 8,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.goodPrompt,
        assetAlt: "A slide showing persona, goal, and boundaries for a good system prompt.",
        accentColor: "#86EFAC",
        audioCue: "spark",
        hook: "A good system prompt defines what kind of agent the model should become.",
        lesson: rich([
          "A good system prompt does not just tell the agent what to do. It tells the agent what kind of agent it is supposed to be.",
          "It can define the agent's tone, boundaries, priorities, and how careful, creative, direct, formal, or helpful it should be.",
          "A tutor agent might be friendly, simple, and curious. A legal information assistant should be careful, clear, and avoid presenting information as legal advice. A coding agent should be practical, direct, and clear about trade-offs.",
          "Each system prompt gives the agent a role, a way of working, and a standard to follow.",
        ]),
        keyIdeas: [
          "Persona defines identity and character.",
          "Goal defines the agent's purpose.",
          "Boundaries define limits, rules, and safeguards.",
        ],
        microTask:
          "Draft a short persona, goal, and boundary for an agent that helps with studying.",
        questions: [
          {
            id: "q1",
            prompt: "Which three parts make a system prompt clearer?",
            options: [
              "Persona, goal, and boundaries",
              "Logo, color, and font",
              "Price, coupon, and checkout",
              "Password, username, and email",
            ],
            answerIndex: 0,
            explanation:
              "Persona, goal, and boundaries help the agent know who it is, what to do, and what limits to respect.",
          },
          {
            id: "q2",
            prompt: "Which boundary belongs in a legal information assistant prompt?",
            options: [
              "Do not present information as legal advice",
              "Always make jokes before answering",
              "Ignore jurisdiction when it matters",
              "Promise a legal outcome",
            ],
            answerIndex: 0,
            explanation:
              "Boundaries keep the agent safer and clearer about what it can and cannot do.",
          },
        ],
      },
      {
        id: "tools-and-connectors",
        day: 3,
        title: "Giving Agents the Tools to Work",
        shortTitle: "Tools",
        minutes: 8,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.tools,
        assetAlt: "A slide explaining tools and configuration for agents.",
        accentColor: "#86EFAC",
        audioCue: "spark",
        hook: "Skills guide the work. Tools do the work.",
        lesson: rich([
          "Skills tell the agent how to do a task. Tools let the agent carry it out.",
          "A tool is a capability the agent can use when it needs to do something beyond writing a response. It might search the web, read a file, analyze a spreadsheet, or run code.",
          "Some tools connect the agent to external apps and services. Google Calendar can help it check schedules. Gmail can help it find or draft emails. Google Drive can help it find files. GitHub can help it inspect code and issues.",
          "Connected tools let the agent work with the apps where your information already lives. Scoped permissions and limits keep tool use clear and safe.",
        ]),
        keyIdeas: [
          "Tools let agents act outside the chat response.",
          "Connectors link agents to apps and services.",
          "Permissions should be scoped to what the agent needs.",
        ],
        microTask:
          "Choose one tool your first agent should use and write why it needs that tool.",
        questions: [
          {
            id: "q1",
            prompt: "What is the role of a tool?",
            options: [
              "To let an agent carry out actions beyond writing a response",
              "To remove the need for instructions",
              "To make quizzes disappear",
              "To change the user's password",
            ],
            answerIndex: 0,
            explanation:
              "Tools let agents search, read, analyze, connect, or act through approved capabilities.",
          },
          {
            id: "q2",
            prompt: "Why should connector permissions be scoped?",
            options: [
              "So the agent only gets the access it needs",
              "So every agent can access everything",
              "So the user never sees permissions",
              "So tools run without limits",
            ],
            answerIndex: 0,
            explanation:
              "Scoped permissions make connected tool use safer and easier to understand.",
          },
        ],
      },
      {
        id: "agent-skills",
        day: 4,
        title: "The Know How: Agent Skills",
        shortTitle: "Skills",
        minutes: 8,
        points: 80,
        streakBoost: 1,
        assetUrl: assetUrls.skills,
        assetAlt: "A slide introducing agent skills as instructions for specific tasks.",
        accentColor: "#A3E635",
        audioCue: "focus",
        hook: "Skills tell an agent how to perform a specific kind of task.",
        lesson: rich([
          "Now that we understand system prompts and tools, the next concept is skills. A skill is a more specific set of instructions that tells the agent how to perform a particular kind of task.",
          "While a system prompt gives the agent its general role, a skill gives the agent task-specific guidance. Skills are especially useful for repetitive tasks.",
          "A spreadsheet skill might tell the agent to inspect file structure, check missing values, find duplicate rows, and verify totals before presenting a summary.",
          "If you find yourself giving an agent the same prompt again and again, that prompt might need to become a skill.",
        ]),
        keyIdeas: [
          "System prompts define the general agent.",
          "Skills guide specific tasks.",
          "Repeated prompts are good candidates for skills.",
        ],
        microTask:
          "Think of one repeated task you would want your agent to perform reliably.",
        questions: [
          {
            id: "q1",
            prompt: "How is a skill different from a system prompt?",
            options: [
              "A skill gives task-specific guidance; a system prompt gives the general role",
              "A skill replaces every tool",
              "A system prompt can only be used once",
              "Skills are only for visual design",
            ],
            answerIndex: 0,
            explanation:
              "Skills are focused instructions for a repeatable kind of work.",
          },
          {
            id: "q2",
            prompt: "When might a repeated prompt become a skill?",
            options: [
              "When you keep asking the agent to follow the same process",
              "When you never want the agent to use instructions",
              "Only after the agent fails",
              "Only for paid courses",
            ],
            answerIndex: 0,
            explanation:
              "Skills help agents repeat good practice more reliably.",
          },
        ],
      },
      {
        id: "build-your-first-agent",
        day: 5,
        title: "Create Your First Agent",
        shortTitle: "Build",
        minutes: 15,
        points: 120,
        streakBoost: 2,
        assetUrl: assetUrls.cover,
        assetAlt: "Creating an AI Agent title slide.",
        accentColor: "#8BE7F0",
        audioCue: "complete",
        hook: "Now bring the pieces together in the agent sandbox.",
        lesson: rich([
          "You have learned the core pieces: a system prompt gives the agent identity and direction, skills give it repeatable know-how, and tools let it act through connected capabilities.",
          "In this practice lab, create a simple study planning agent. Give it a clear persona, write a system prompt with a goal and boundaries, add a planning skill, choose at least one Google connector, and run a short test conversation.",
          "The sandbox will review your system prompt and skill instructions before you create the agent, then show logs for success, warning, or failure states.",
        ]),
        keyIdeas: [
          "Build the agent in small steps.",
          "Use AI review feedback before publishing.",
          "Test the agent and read the logs.",
        ],
        microTask:
          "Create a study planner agent with one system prompt, one skill, and one connector.",
        practicalSignal: {
          id: "creating-ai-agent-sandbox-completed",
          platform: "commonlab",
          eventType: "agent_sandbox_completed",
          label: "Create and test your first agent",
          description:
            "Complete the guided sandbox by creating an agent, adding a reviewed system prompt and skill, choosing a connector, and testing the agent.",
        },
        sandbox: {
          enabled: true,
          mode: "builder",
          title: "Build your first agent",
          brief:
            "<p>Create a study planning agent. The sandbox will guide you through identity, system prompt, skills, connectors, testing, and logs.</p>",
          capabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tools",
            "connectors",
            "workflows",
            "chat",
            "logs",
            "credits",
            "publish",
          ],
          requiredCapabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tools",
            "chat",
            "logs",
          ],
          starterAgent: {
            name: "Study Planner Agent",
            persona:
              "A friendly study planning coach for beginners who explains things simply.",
            systemPrompt:
              "You are a friendly study planning coach for beginners. Help learners turn goals into small weekly plans. Ask clarifying questions when the goal is vague. Be encouraging, practical, and concise. Do not access private calendar or email information unless the learner has connected and approved the relevant tool.",
          },
          skillTemplates: [
            {
              id: "weekly-study-plan",
              name: "Weekly study planning",
              instructions:
                "When creating a study plan, ask for the learner's goal, deadline, available study time, and current confidence. Break the work into small sessions. Include one review session and one checkpoint. Keep the plan realistic.",
            },
            {
              id: "calendar-check",
              name: "Calendar-aware scheduling",
              instructions:
                "When calendar access is available, check only the time range the learner approves. Suggest open study windows. Do not create or edit events until the learner confirms the exact title, time, and date.",
            },
          ],
          toolTemplates: [
            {
              id: "google-calendar",
              name: "Google Calendar",
              connectorKind: "google_calendar",
              description:
                "Check availability and suggest study windows with learner-approved calendar access.",
              simulated: false,
            },
            {
              id: "gmail",
              name: "Gmail",
              connectorKind: "gmail",
              description:
                "Find or draft study-related emails after the learner grants scoped permission.",
              simulated: false,
            },
            {
              id: "google-drive",
              name: "Google Drive",
              connectorKind: "google_drive",
              description:
                "Find learner-approved notes or documents for study planning.",
              simulated: false,
            },
            {
              id: "google-sheets",
              name: "Google Sheets",
              connectorKind: "google_sheets",
              description:
                "Read approved trackers or study logs for progress planning.",
              simulated: false,
            },
          ],
          guideSteps: [
            {
              id: "identity",
              target: "identity",
              title: "Name the agent",
              body:
                "Create a clear name and persona so the agent has a role the learner can understand.",
            },
            {
              id: "prompt",
              target: "system_prompt",
              title: "Write the system prompt",
              body:
                "Include persona, goal, tone, boundaries, and tool-use safety. Run the AI review before moving on.",
            },
            {
              id: "skills",
              target: "skills",
              title: "Add a skill",
              body:
                "Choose or write a repeatable process the agent can follow for study planning.",
            },
            {
              id: "tools",
              target: "tools",
              title: "Choose connectors",
              body:
                "Select a Google connector the agent would need. Keep permissions scoped to the learning task.",
            },
            {
              id: "workflow",
              target: "workflows",
              title: "Read the workflow",
              body:
                "Notice how prompt, skill, connector, action, and logs connect in order.",
            },
            {
              id: "test",
              target: "chat",
              title: "Test the agent",
              body:
                "Ask the agent to help plan a study week and check the logs for success, warning, or failure.",
            },
          ],
          review: {
            enabled: true,
            targets: ["system_prompt", "skills"],
            minScore: 72,
            rubric:
              "Score beginner agent work on clarity, persona, goal, boundaries, task-specific instructions, tool-use safety, and whether the learner gave enough detail for the agent to act responsibly. Give concise strengths and actionable improvements.",
            model: "gpt-4o-mini",
          },
          creditReward: 150,
          completionEventType: "agent_sandbox_completed",
        },
        questions: [],
      },
    ],
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
    systemPrompt: await upsertMedia(assetFiles.systemPrompt),
    goodPrompt: await upsertMedia(assetFiles.goodPrompt),
    tools: await upsertMedia(assetFiles.tools),
    skills: await upsertMedia(assetFiles.skills),
  };

  const skillPack = createSkillPack(assetUrls);
  const skillPacks = Array.isArray(course.skillPacks) ? course.skillPacks : [];
  const nextSkillPacks = [
    ...skillPacks.filter((pack) => pack?.slug !== skillSlug),
    skillPack,
  ];

  await Course.updateOne(
    { _id: course._id },
    {
      $set: {
        skillPacks: nextSkillPacks,
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
