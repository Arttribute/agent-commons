import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is required. Run this from apps/commons-courses or set the env var.");
}

const CourseSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Course = mongoose.models.Course || mongoose.model("Course", CourseSchema);

const skillPack = {
  enabled: true,
  title: "0 to 1: Creating your first agent",
  subtitle: "Learn prompts, skills, tools, and then build a working beginner agent.",
  learnerPromise:
    "By the end, you will understand the core building blocks of an AI agent and create your first guided agent in the CommonLab sandbox.",
  challenges: [
    {
      id: "day-1-system-prompt-soul",
      day: 1,
      title: "The system prompt gives an agent direction",
      shortTitle: "System prompt",
      minutes: 6,
      points: 60,
      streakBoost: 1,
      accentColor: "#B8F56D",
      audioCue: "focus",
      hook: "If the LLM is the brain, the system prompt is the soul.",
      lesson: [
        "<p>So far, we have looked at the basic idea of AI agents.</p>",
        "<p>An LLM is the brain that powers today's AI agents. Now let's look at the system prompt.</p>",
        "<p>If the LLM is the brain, the system prompt is the soul. It gives the agent its identity. It tells the agent who it is, how it should behave, what it should care about, what rules it must follow, and what kind of work it is meant to do.</p>",
        "<p>The LLM provides intelligence, and the system prompt gives that intelligence direction.</p>",
        "<p>The same LLM can behave in many different ways depending on the system prompt. It can act like a learning coach, a legal information assistant, or a coding partner. The system prompt shapes how the agent behaves.</p>",
      ].join(""),
      keyIdeas: [
        "The LLM provides intelligence.",
        "The system prompt gives that intelligence direction.",
        "The same model can act very differently with a different system prompt.",
      ],
      questions: [
        {
          id: "q1",
          prompt: "What is the main job of a system prompt?",
          options: [
            "To give the agent identity, direction, and behavioral rules",
            "To replace the LLM entirely",
            "To store billing information",
            "To make the agent faster without changing behavior",
          ],
          answerIndex: 0,
          explanation: "A system prompt tells the agent who it is and how it should behave.",
        },
      ],
    },
    {
      id: "day-2-writing-good-system-prompts",
      day: 2,
      title: "A good system prompt defines the kind of agent",
      shortTitle: "Prompt quality",
      minutes: 7,
      points: 70,
      streakBoost: 1,
      accentColor: "#7DD3FC",
      audioCue: "spark",
      hook: "A good prompt defines role, tone, boundaries, and priorities.",
      lesson: [
        "<p>A good system prompt does not just tell the agent what to do. It tells the agent what kind of agent it is supposed to be.</p>",
        "<p>It can define the agent's tone, boundaries, priorities, and how careful, creative, direct, formal, or helpful it should be.</p>",
        "<p>A tutor might be told: “You are a friendly learning coach for beginners. Explain ideas simply. Use short examples. Ask questions to check understanding. Avoid jargon unless you explain it.”</p>",
        "<p>A legal information assistant might be told to explain concepts clearly, avoid presenting information as legal advice, ask for jurisdiction when it matters, and encourage users to consult a qualified lawyer.</p>",
        "<p>A coding agent might be told to help write, explain, and debug code, prefer simple working solutions, explain trade-offs, and ask for missing context when requirements are unclear.</p>",
        "<p>Each system prompt gives the agent a role, a way of working, and a clear standard to follow.</p>",
      ].join(""),
      keyIdeas: [
        "Good prompts define role and tone.",
        "Good prompts include boundaries.",
        "Good prompts tell the agent what standard to follow.",
      ],
      questions: [
        {
          id: "q1",
          prompt: "Which detail belongs in a strong system prompt?",
          options: [
            "The agent's role, boundaries, tone, and priorities",
            "Only the user's password",
            "Only the name of the model",
            "Only a list of colors for the interface",
          ],
          answerIndex: 0,
          explanation: "The prompt should shape the agent's identity and behavior.",
        },
      ],
    },
    {
      id: "day-3-skills",
      day: 3,
      title: "Skills help agents repeat good practice",
      shortTitle: "Skills",
      minutes: 7,
      points: 70,
      streakBoost: 1,
      accentColor: "#FBBF24",
      audioCue: "focus",
      hook: "If you repeat the same prompt often, it may need to become a skill.",
      lesson: [
        "<p>Now that we understand system prompts, the next concept is skills.</p>",
        "<p>A skill is a more specific set of instructions that tells the agent how to perform a particular kind of task.</p>",
        "<p>While a system prompt gives the agent its general role, a skill gives the agent task-specific guidance.</p>",
        "<p>A spreadsheet skill might tell the agent to inspect the file structure first, check for missing values, inconsistent columns, duplicate rows, and formula errors, and verify totals before presenting a summary.</p>",
        "<p>A presentation skill might tell the agent to identify the audience, purpose, and key message, then turn content into a focused slide structure with speaker notes where needed.</p>",
        "<p>Each skill gives the agent a proven way of working for a specific task.</p>",
      ].join(""),
      keyIdeas: [
        "System prompts define the general role.",
        "Skills define task-specific ways of working.",
        "Skills are useful for repetitive tasks.",
      ],
      questions: [
        {
          id: "q1",
          prompt: "When might a repeated prompt become a skill?",
          options: [
            "When it gives reusable guidance for a specific kind of task",
            "When it is only used once",
            "When it is unrelated to the agent's work",
            "When it should be hidden from the agent",
          ],
          answerIndex: 0,
          explanation: "Skills capture repeatable task guidance.",
        },
      ],
    },
    {
      id: "day-4-tools-connectors",
      day: 4,
      title: "Tools let agents carry out work",
      shortTitle: "Tools",
      minutes: 6,
      points: 70,
      streakBoost: 1,
      accentColor: "#5EEAD4",
      audioCue: "spark",
      hook: "Skills guide the work. Tools do the work.",
      lesson: [
        "<p>Skills tell the agent how to do a task. Tools let the agent carry it out.</p>",
        "<p>A tool is a capability the agent can use when it needs to do something beyond writing a response.</p>",
        "<p>It might search the web, read a file, analyze data in a spreadsheet, or run code.</p>",
        "<p>Some tools connect the agent to external apps and services. Google Calendar can help it check schedules. Gmail can help it find or draft emails. Google Drive can help it find and read files. GitHub can help it inspect code and issues.</p>",
        "<p>Connected tools let the agent work with the apps where your information already lives.</p>",
      ].join(""),
      keyIdeas: [
        "Tools extend what agents can do.",
        "Connectors link agents to external services.",
        "The agent still needs good instructions for when to use tools.",
      ],
      questions: [
        {
          id: "q1",
          prompt: "What is the difference between skills and tools?",
          options: [
            "Skills guide the work; tools let the agent carry it out",
            "Skills are only for billing; tools are only for colors",
            "Tools replace system prompts",
            "There is no difference",
          ],
          answerIndex: 0,
          explanation: "Skills are instructions. Tools are capabilities.",
        },
      ],
    },
    {
      id: "day-5-create-your-first-agent",
      day: 5,
      title: "Create your first agent in the sandbox",
      shortTitle: "Build agent",
      minutes: 15,
      points: 120,
      streakBoost: 1,
      accentColor: "#C4B5FD",
      audioCue: "complete",
      hook: "Now build the agent, connect a tool, run it, and inspect what happened.",
      lesson:
        "<p>Use the sandbox to create a beginner agent with a system prompt, one skill, one tool or connector, and a first task. The logs will show whether the setup succeeded, warned, or failed.</p>",
      keyIdeas: [
        "Agents need identity and direction.",
        "Skills make repeatable work more reliable.",
        "Tools and connectors let agents act in useful environments.",
      ],
      sandbox: {
        enabled: true,
        mode: "builder",
        title: "Build a calendar planning agent",
        brief:
          "Create a small planning agent with a system prompt, a planning skill, and a Google Calendar-style connector.",
        capabilities: [
          "identity",
          "system_prompt",
          "skills",
          "tools",
          "connectors",
          "tasks",
          "workflows",
          "chat",
          "logs",
          "credits",
        ],
        requiredCapabilities: ["identity", "system_prompt", "skills", "tools", "chat"],
        creditReward: 100,
        completionEventType: "agent_sandbox_completed",
        starterAgent: {
          name: "Calendar Coach",
          persona: "A practical planning assistant for beginners",
          systemPrompt:
            "You are a friendly planning assistant. Help the learner review their calendar, find one useful focus block, and explain next steps simply. Ask before taking actions.",
        },
        skillTemplates: [
          {
            id: "planning-skill",
            name: "Planning skill",
            instructions:
              "Identify the user's goal, constraints, and next deadline. Suggest one small next action before expanding the plan.",
          },
          {
            id: "learning-coach-skill",
            name: "Learning coach skill",
            instructions:
              "Explain ideas simply, ask one check-for-understanding question, and avoid jargon unless you explain it.",
          },
        ],
        toolTemplates: [
          {
            id: "google-calendar",
            name: "Google Calendar",
            description:
              "Use calendar context to inspect events and suggest better planning decisions.",
            connectorKind: "google_calendar",
            simulated: true,
          },
          {
            id: "gmail",
            name: "Gmail",
            description:
              "Use email context to find relevant commitments or draft a short follow-up.",
            connectorKind: "gmail",
            simulated: true,
          },
          {
            id: "google-drive",
            name: "Google Drive",
            description:
              "Use Drive files as context for summaries, planning, or retrieval tasks.",
            connectorKind: "google_drive",
            simulated: true,
          },
          {
            id: "google-sheets",
            name: "Google Sheets",
            description:
              "Use spreadsheet context for simple tables, tracking, and structured data checks.",
            connectorKind: "google_sheets",
            simulated: true,
          },
        ],
        guideSteps: [
          {
            id: "identity",
            target: "identity",
            title: "Name the agent",
            body: "Give your agent a clear identity. A good name makes the job obvious.",
          },
          {
            id: "prompt",
            target: "system_prompt",
            title: "Shape behavior",
            body: "Edit the system prompt so the agent has tone, boundaries, and priorities.",
          },
          {
            id: "skill",
            target: "skills",
            title: "Add one skill",
            body: "Choose a skill that gives your agent a repeatable way of working.",
          },
          {
            id: "tool",
            target: "tools",
            title: "Connect one tool",
            body: "Choose a connector so the agent can work with useful context.",
          },
          {
            id: "workflow",
            target: "workflows",
            title: "Inspect the flow",
            body: "Notice how prompt, tool use, and response connect in a simple workflow.",
          },
          {
            id: "run",
            target: "chat",
            title: "Run the first task",
            body: "Send the test task and read the logs to see what happened.",
          },
        ],
      },
      practicalSignal: {
        id: "first-agent-created",
        platform: "agent_commons",
        eventType: "agent_sandbox_completed",
        label: "Create first learner agent",
        description: "Create an agent from the CommonLab learner sandbox.",
        points: 120,
      },
      questions: [],
    },
  ],
};

const course = {
  title: "0 to 1: Creating your first agent",
  slug: "zero-to-one-creating-your-first-agent",
  tagline: "Build your first useful AI agent from prompts, skills, and tools.",
  description:
    "A beginner skill path for understanding system prompts, skills, tools, connectors, and creating a first agent.",
  longDescription:
    "<p>Start with the foundations of agent behavior, then finish by creating a guided learner agent in the CommonLab sandbox.</p>",
  price: 0,
  currency: "USD",
  isFree: true,
  courseType: "self-paced",
  level: "beginner",
  duration: "5 days",
  lessonsCount: 5,
  modulesCount: 1,
  instructor: "CommonLab",
  tags: ["agents", "system prompts", "skills", "tools", "beginner"],
  published: true,
  modules: [
    {
      title: "Create your first agent",
      description:
        "<p>Learn the building blocks of agents and build a first guided agent.</p>",
      lessons: skillPack.challenges.map((challenge) => ({
        title: challenge.title,
        duration: `${challenge.minutes} min`,
        description: challenge.lesson,
        isFree: true,
      })),
    },
  ],
  skillPack,
};

await mongoose.connect(uri);
await Course.updateOne(
  { slug: course.slug },
  {
    $set: course,
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true }
);
await mongoose.disconnect();

console.log(`Seeded ${course.title} (${course.slug})`);
