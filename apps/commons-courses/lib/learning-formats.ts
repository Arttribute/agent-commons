import { Award, BookOpen, Rocket } from "lucide-react";

export const learningFormats = [
  {
    id: "courses",
    title: "Courses",
    href: "/courses",
    icon: BookOpen,
    description:
      "Structured learning paths for lessons, cohorts, projects, assignments, and deeper teaching.",
    educatorAction:
      "Create a course when learners need a full journey with modules, lessons, assignments, and payment or access settings.",
  },
  {
    id: "skills",
    title: "Skills",
    href: "/skills",
    icon: Award,
    description:
      "Atomic daily challenges learners can complete on their own, earn as badges, and repeat into a streak.",
    educatorAction:
      "Attach skill challenges to a course when a concept should be practiced in one focused daily achievement.",
  },
  {
    id: "builders",
    title: "Builders",
    href: "/builders",
    icon: Rocket,
    description:
      "Quest-style build programmes for prototypes, hackathons, build nights, demos, residencies, and startup pathways.",
    educatorAction:
      "Use builder quests when learners should ship something visible with community momentum and demo outcomes.",
  },
] as const;

export type LearningFormatId = (typeof learningFormats)[number]["id"];
