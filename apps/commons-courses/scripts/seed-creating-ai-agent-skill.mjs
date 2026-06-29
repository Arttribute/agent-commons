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
  const key = `course-media/${targetCourseSlug}/${skillSlug}/${filename}`;
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
    title: "Creating an AI Agent",
    subtitle: "Learn system prompts, tools, skills, and then build a beginner agent.",
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
            prompt: "What does a system prompt mainly establish for an agent?",
            options: [
              "Identity, behavior, priorities, and rules",
              "The model's pre-training data and base intelligence",
              "The external apps the agent can access",
              "The conversation history from every previous user",
            ],
            answerIndex: 0,
            explanation:
              "A system prompt tells the agent who it is, how to behave, and what standards to follow.",
          },
          {
            id: "q2",
            prompt: "Why can the same LLM act like a learning coach in one setup and a coding partner in another?",
            options: [
              "Different system prompts can shape different roles and behaviors",
              "Each agent must use a different kind of language model",
              "The user interface automatically changes the model's training",
              "Connected tools decide the agent's personality before it responds",
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
            prompt: "Which set best matches the slide's structure for a good system prompt?",
            options: [
              "Persona, goal, and boundaries",
              "Model, temperature, and token limit",
              "Memory, data source, and output format",
              "Name, greeting, and closing sentence",
            ],
            answerIndex: 0,
            explanation:
              "Persona, goal, and boundaries help the agent know who it is, what to do, and what limits to respect.",
          },
          {
            id: "q2",
            prompt: "Which instruction is a useful boundary for a legal information assistant?",
            options: [
              "Do not present information as legal advice",
              "Answer confidently even when the jurisdiction is unclear",
              "Prioritize speed over clarifying important context",
              "Avoid mentioning limits because it may reduce trust",
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
        hook: "Tools connect agents to apps, files, data, and services.",
        lesson: rich([
          "A tool is a capability an agent can use when it needs to do something beyond writing a response.",
          "Tools connect agents to the places where work happens: apps, files, data, services, and code environments. A tool might search the web, read a file, analyze a spreadsheet, run code, or call a connected service.",
          "Configuration matters because a useful agent should not have unlimited access by default. Scoped permissions define what the agent is allowed to reach, and limits define how it should use that access.",
          "For example, a calendar-connected agent might check approved availability before suggesting study times. The tool gives access; the configuration keeps that access clear, purposeful, and safe.",
        ]),
        keyIdeas: [
          "Tools connect agents to apps, files, data, and services.",
          "Tools let agents act outside the chat response.",
          "Scoped permissions and limits keep tool use clear and safe.",
        ],
        microTask:
          "Choose one tool your first agent should use and write why it needs that tool.",
        questions: [
          {
            id: "q1",
            prompt: "What is the role of a tool in an agent setup?",
            options: [
              "To let an agent carry out actions beyond writing a response",
              "To define the agent's persona, goal, and boundaries",
              "To guarantee the agent will always choose the right action",
              "To replace the need for scoped permissions and limits",
            ],
            answerIndex: 0,
            explanation:
              "Tools let agents search, read, analyze, connect, or act through approved capabilities.",
          },
          {
            id: "q2",
            prompt: "Why should tool configuration include scoped permissions?",
            options: [
              "So the agent only gets the access it needs",
              "So the system prompt no longer has to define boundaries",
              "So the agent can decide later which private data to access",
              "So every connected service can be treated as equally low risk",
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
          "While a system prompt gives the agent its general role, a skill gives the agent task-specific guidance. Skills are especially useful for tasks that should be handled with a consistent process.",
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
              "A skill decides who the agent is; a system prompt only stores examples",
              "A skill gives access to apps; a system prompt runs the connected service",
              "A skill is only useful when the agent has no repeated tasks",
            ],
            answerIndex: 0,
            explanation:
              "Skills are focused instructions for a repeatable kind of work.",
          },
          {
            id: "q2",
            prompt: "When is a repeated prompt a strong candidate to become a skill?",
            options: [
              "When you keep asking the agent to follow the same process",
              "When the task is too vague to describe as a process",
              "When you want the agent to ignore its general role",
              "When tool permissions are broad enough to cover every case",
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
          "In this practice lab, create a simple study planning agent from a blank canvas. Give it a clear name, write a system prompt with a goal and boundaries, add a planning skill, choose a useful connector, and run a short test conversation.",
          "The sandbox can review your system prompt and skill instructions when you want feedback, but the important milestone is creating and testing the live agent.",
        ]),
        keyIdeas: [
          "Build the agent in small steps.",
          "Use AI review feedback when it helps you refine the agent.",
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
            "Complete the guided sandbox by creating an agent, writing a system prompt and skill, choosing a connector, and testing the agent.",
        },
        sandbox: {
          enabled: true,
          mode: "builder",
          title: "Build your first agent",
          brief:
            "<p>Create a study planning agent. The sandbox will guide you through identity, system prompt, skills, connectors, testing, and logs.</p>",
          intro: {
            enabled: true,
            eyebrow: "Practice lab",
            title: "Build your first real agent",
            body:
              "You are about to enter a guided Agent Commons sandbox. You will build a study-planning agent from empty fields, using short examples as placeholders while you decide what the agent should do.",
            expectations: [
              "Give the agent a name and system prompt in your own words.",
              "Add or edit one skill that gives the agent a repeatable planning process.",
              "Optionally run AI review to get feedback before creating the agent.",
              "Create the agent, send a test message, and inspect the logs for success, warnings, or failures.",
            ],
            infoTitle: "What is the sandbox?",
            infoBody:
              "It is a controlled learning workspace that creates real Agent Commons agents on your account while keeping the lesson focused and guided.",
            startLabel: "Proceed to sandbox",
          },
          completion: {
            title: "Your first agent is live",
            body:
              "You created and tested a real Agent Commons agent. The agent remains available in your Agent Commons dashboard.",
            primaryActionLabel: "Continue learning",
          },
          capabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tools",
            "connectors",
            "chat",
            "logs",
            "credits",
          ],
          requiredCapabilities: [
            "identity",
            "system_prompt",
            "skills",
            "tools",
            "chat",
            "logs",
          ],
          placeholders: {
            agentName: "Study Sprint Coach",
            systemPrompt:
              "You are a study planning agent. Help the learner turn one learning goal into a realistic weekly plan. Ask clarifying questions when details are missing. Be concise, encouraging, and careful with connected tools.",
            skillInstructions:
              "Ask for the learner's goal, deadline, available time, and confidence level. Break the work into small study sessions. Include one review session and one checkpoint.",
            chatInput:
              "Help me plan three focused study sessions for this week.",
          },
          starterSkillIds: [],
          starterToolIds: [],
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
                "Start with a short, memorable name. The placeholder is only an example; write the agent you want to test.",
              targetSelector: '[data-sandbox-target="agent-name"]',
              placement: "right",
            },
            {
              id: "prompt",
              target: "system_prompt",
              title: "Write the system prompt",
              body:
                "Describe the agent's job, tone, boundaries, and tool-use safety. You can review it with AI after writing, but review is optional.",
              targetSelector: '[data-sandbox-target="system-prompt"]',
              placement: "right",
            },
            {
              id: "prompt-review",
              target: "system_prompt",
              title: "Optional feedback",
              body:
                "Use AI review when you want a quick quality check. It can help you improve clarity, but it will not block agent creation in this lab.",
              targetSelector: '[data-sandbox-target="review-box"]',
              placement: "right",
            },
            {
              id: "skills",
              target: "skills",
              title: "Add a skill",
              body:
                "Choose or write a repeatable process the agent can follow for study planning.",
              targetSelector: '[data-sandbox-target="skill-instructions"]',
              placement: "right",
            },
            {
              id: "tools",
              target: "tools",
              title: "Choose connectors",
              body:
                "Select a Google connector the agent would need. Keep permissions scoped to the learning task.",
              targetSelector: '[data-sandbox-target="tool-google-calendar"]',
              placement: "right",
            },
            {
              id: "create",
              target: "publish",
              title: "Create the agent",
              body:
                "Once the name and system prompt are filled in, create the real Agent Commons agent from your configuration.",
              targetSelector: '[data-sandbox-target="create-agent"]',
              placement: "top",
            },
            {
              id: "test",
              target: "chat",
              title: "Test the agent",
              body:
                "Ask the agent to help plan a study week and check the logs for success, warning, or failure.",
              targetSelector: '[data-sandbox-target="chat-input"]',
              placement: "top",
            },
          ],
          review: {
            enabled: true,
            required: false,
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

function createCourseModuleFromSkillPack(skillPack) {
  return {
    title: skillPack.title,
    description:
      skillPack.learnerPromise ||
      "<p>Learn the pieces of an AI agent and finish by creating one in the guided sandbox.</p>",
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
