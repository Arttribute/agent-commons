export type BuilderQuest = {
  id: string;
  title: string;
  status: "draft" | "open-soon" | "active";
  duration: string;
  cadence: string;
  promise: string;
  linkedCourseSlug?: string;
  linkedSkillSlug?: string;
  outcomes: string[];
  milestones: Array<{
    title: string;
    description: string;
  }>;
};

export const builderQuests: BuilderQuest[] = [
  {
    id: "ai-builders-sprint",
    title: "AI Builders Sprint: From Idea to Useful AI Tool",
    status: "open-soon",
    duration: "4 weeks",
    cadence: "1 live session + 1 build task each week",
    promise:
      "Move from AI curiosity to a small working prototype through practical lessons, build tasks, feedback, and a demo rhythm.",
    linkedSkillSlug: "ai-fluency-starter",
    outcomes: [
      "A clear AI use case",
      "A mapped workflow or agent idea",
      "A rough prototype",
      "A short demo submission",
    ],
    milestones: [
      {
        title: "Find your first AI use case",
        description:
          "Choose a small real problem, user, workflow, and first version worth building.",
      },
      {
        title: "Map the workflow",
        description:
          "Define inputs, outputs, tools, steps, and where AI adds value.",
      },
      {
        title: "Build the first prototype",
        description:
          "Use AI tools, vibe coding, automation platforms, or simple app builders to make something visible.",
      },
      {
        title: "Test, improve, and demo",
        description:
          "Prepare a short demo with what works, what you learned, and what should improve next.",
      },
    ],
  },
];
