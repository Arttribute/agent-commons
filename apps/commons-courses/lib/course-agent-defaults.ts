import type { CourseAgentConfig } from "@/types/course-agent";

export const defaultCourseAgents: CourseAgentConfig[] = [
  {
    id: "learner-guide",
    name: "Learner guide",
    audience: "learners",
    enabled: true,
    dataScope: "course_content_and_progress",
    learningMode: "guided",
    actions: ["suggest", "navigate"],
    instructions:
      "Help learners understand the current course material, find relevant lessons, plan practice, and unblock setup. Do not complete assignments for them or reveal solutions that bypass learning.",
  },
  {
    id: "educator-copilot",
    name: "Educator copilot",
    audience: "educators",
    enabled: true,
    dataScope: "educator_operations",
    learningMode: "direct_support",
    actions: ["suggest", "draft", "fill_view", "navigate"],
    instructions:
      "Help educators run the course, interpret course activity, draft course material, manage students, review assignments, and understand payments. Keep learner-private data scoped to the educator-owned course.",
  },
];

export function getDefaultCourseAgents(): CourseAgentConfig[] {
  return defaultCourseAgents.map((agent) => ({
    ...agent,
    actions: [...agent.actions],
  }));
}

export function normalizeCourseAgents(input: unknown): CourseAgentConfig[] {
  const agents =
    Array.isArray(input) && input.length > 0 ? input : getDefaultCourseAgents();

  return agents
    .map((agent, index) => {
      const item = agent as Partial<CourseAgentConfig>;
      return {
        id: item.id || `course-agent-${index + 1}`,
        name: item.name || `Course agent ${index + 1}`,
        agentCommonsAgentId: item.agentCommonsAgentId || "",
        audience: item.audience || "both",
        enabled: item.enabled ?? true,
        dataScope: item.dataScope || "course_overview",
        learningMode: item.learningMode || "guided",
        actions: Array.isArray(item.actions) ? item.actions : ["suggest"],
        instructions: item.instructions || "",
      } satisfies CourseAgentConfig;
    })
    .filter((agent) => agent.name.trim().length > 0);
}

export function agentSupportsRole(
  agent: CourseAgentConfig,
  role: "learner" | "educator"
) {
  return agent.audience === "both" || agent.audience === `${role}s`;
}
