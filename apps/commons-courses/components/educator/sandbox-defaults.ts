import type { AgentSandboxConfig } from "@/types/skills";

export function createSandboxConfig(): AgentSandboxConfig {
  return {
    enabled: true,
    mode: "builder",
    title: "Create your first agent",
    brief:
      "Build a small agent with a system prompt, a reusable skill, and one meaningful connected tool.",
    intro: {
      enabled: true,
      eyebrow: "Practice lab",
      title: "Create and test an Agent Commons agent",
      body:
        "You will configure the agent, create it on Agent Commons, connect a useful tool, and test the live agent in chat.",
      expectations: [
        "Give the agent a clear name, role, and system prompt.",
        "Add at least one reusable skill.",
        "Choose a connector that matches the task.",
        "Run the agent and inspect success, warning, or failure logs.",
      ],
      infoTitle: "What is the sandbox?",
      infoBody:
        "A controlled Agent Commons workspace for learning. The agents you create here are real platform agents on your account.",
      startLabel: "Proceed to sandbox",
    },
    completion: {
      title: "Your agent is ready",
      body:
        "You created and tested a real Agent Commons agent. You can continue to the next learning step.",
      primaryActionLabel: "Continue",
    },
    capabilities: [
      "identity",
      "system_prompt",
      "skills",
      "tools",
      "connectors",
      "tasks",
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
          "Start by identifying the user's goal, constraints, and next deadline. Suggest one small next action before expanding the plan.",
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
    ],
    guideSteps: [
      {
        id: "identity",
        target: "identity",
        title: "Name the agent",
        body:
          "Give the agent a clear identity so you know what kind of helper you are building.",
        targetSelector: '[data-sandbox-target="agent-name"]',
        placement: "right",
      },
      {
        id: "prompt",
        target: "system_prompt",
        title: "Shape behavior",
        body:
          "Edit the system prompt so the agent has boundaries, tone, and a specific job.",
        targetSelector: '[data-sandbox-target="system-prompt"]',
        placement: "right",
      },
      {
        id: "skills",
        target: "skills",
        title: "Add a skill",
        body:
          "Choose a reusable instruction set that helps the agent repeat good practice.",
        targetSelector: '[data-sandbox-target="skill-instructions"]',
        placement: "right",
      },
      {
        id: "tools",
        target: "tools",
        title: "Connect a tool",
        body:
          "Select a tool or connector so the agent can do more than write a response.",
        targetSelector: '[data-sandbox-target="tools"]',
        placement: "right",
      },
      {
        id: "run",
        target: "chat",
        title: "Run it",
        body:
          "Send the first task and inspect the logs for success, warnings, or failure.",
        targetSelector: '[data-sandbox-target="chat-input"]',
        placement: "top",
      },
    ],
  };
}
