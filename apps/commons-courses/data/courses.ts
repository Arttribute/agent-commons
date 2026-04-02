export const coursesData = [
  {
    title: "Fundamentals of AI Agents",
    slug: "fundamentals-of-ai-agents",
    tagline: "Build intelligent, autonomous agents from the ground up.",
    description:
      "A comprehensive introduction to AI agents — what they are, how they work, and how to build them. Covers the full stack: LLMs, tools, MCP, agent frameworks, security, and the emerging agentic economy.",
    longDescription:
      "AI agents are the next computing paradigm. They are systems that perceive context, reason with language models, use tools, and take actions to accomplish goals — autonomously. This course gives you the mental models, technical foundations, and hands-on skills to build, deploy, and reason about agents. You will understand how leading agent frameworks work, how the Model Context Protocol (MCP) standardises tool access across models and platforms, how multi-agent workflows are composed, and what the emerging agentic commerce layer looks like. Grounded in real patterns from Agent Commons — a production agentic infrastructure platform — this is not a theoretical survey. Every concept connects to code you can run.",
    price: 99,
    isFree: false,
    courseType: "self-paced" as const,
    level: "beginner" as const,
    duration: "8 hours",
    lessonsCount: 28,
    modulesCount: 6,
    instructor: "Agent Commons",
    tags: [
      "AI Agents",
      "LLMs",
      "MCP",
      "LangGraph",
      "Security",
      "Agentic Commerce",
    ],
    published: true,
    isMainFeatured: true,
    isFeatured: true,
    modules: [
      {
        title: "What Are AI Agents?",
        description:
          "Build a clear mental model of what agents are, how they differ from chatbots and pipelines, and why the agentic paradigm changes everything.",
        lessons: [
          {
            title: "Introduction to Agentic AI",
            duration: "18 min",
            isFree: true,
            description:
              "The shift from prompt-response to autonomous action loops. What makes a system an agent.",
          },
          {
            title: "How Agents Think and Act",
            duration: "22 min",
            isFree: true,
            description:
              "The perceive-reason-act loop. Planning, memory, and tool use as core primitives.",
          },
          {
            title: "The Agentic Landscape in 2026",
            duration: "20 min",
            isFree: false,
            description:
              "A survey of the current ecosystem — leading frameworks, frontier models, and infrastructure players.",
          },
          {
            title: "Agents vs Chatbots vs Pipelines",
            duration: "15 min",
            isFree: false,
            description:
              "When to use each pattern. The tradeoffs of autonomy, reliability, and cost.",
          },
        ],
      },
      {
        title: "Core Building Blocks",
        description:
          "Understand LLMs, tools, skills, workflows, and the Model Context Protocol that ties them together.",
        lessons: [
          {
            title: "Large Language Models as the Reasoning Engine",
            duration: "25 min",
            isFree: false,
            description:
              "How LLMs generate, attend, and reason. Key concepts: context windows, temperature, structured output.",
          },
          {
            title: "Tools and Function Calling",
            duration: "28 min",
            isFree: false,
            description:
              "Giving agents the ability to take action. Tool definitions, JSON schemas, and execution loops.",
          },
          {
            title: "Skills and Reusable Capabilities",
            duration: "20 min",
            isFree: false,
            description:
              "Packaging tools into composable skills. The Agent Commons skill model.",
          },
          {
            title: "Workflows and Orchestration",
            duration: "22 min",
            isFree: false,
            description:
              "Sequential, parallel, and conditional agent workflows. When to use graphs vs chains.",
          },
          {
            title: "Model Context Protocol (MCP)",
            duration: "30 min",
            isFree: false,
            description:
              "How MCP standardises tool access across models and platforms. Building and consuming MCP servers.",
          },
        ],
      },
      {
        title: "Setting Up Your First AI Agent",
        description:
          "Go from zero to a running agent. Configure your environment, connect to an LLM, add tools, and watch it work.",
        lessons: [
          {
            title: "Development Environment Setup",
            duration: "20 min",
            isFree: false,
            description:
              "Node.js, TypeScript, API keys, and local tooling. Getting your workspace ready.",
          },
          {
            title: "Your First Agent with the Claude API",
            duration: "35 min",
            isFree: false,
            description:
              "A minimal but complete agent using the Anthropic API. Message loops, tool calls, and responses.",
          },
          {
            title: "Adding Tools to Your Agent",
            duration: "30 min",
            isFree: false,
            description:
              "Implementing and registering tools. Web search, file access, and custom functions.",
          },
          {
            title: "Memory and Context Management",
            duration: "25 min",
            isFree: false,
            description:
              "Short-term and long-term memory. Injecting context, summarisation, and vector retrieval patterns.",
          },
        ],
      },
      {
        title: "Agent Frameworks",
        description:
          "Survey the leading frameworks and understand when to use each one.",
        lessons: [
          {
            title: "LangChain and LangGraph",
            duration: "30 min",
            isFree: false,
            description:
              "The LangChain ecosystem. Chains, agents, and the LangGraph state machine for complex workflows.",
          },
          {
            title: "The Claude Agent SDK",
            duration: "28 min",
            isFree: false,
            description:
              "Anthropic's own SDK for building agents and multi-agent systems.",
          },
          {
            title: "AutoGen and Multi-Agent Conversations",
            duration: "25 min",
            isFree: false,
            description:
              "Microsoft's AutoGen for conversational multi-agent patterns.",
          },
          {
            title: "Choosing the Right Framework",
            duration: "18 min",
            isFree: false,
            description:
              "A decision framework based on task type, team size, and scale requirements.",
          },
        ],
      },
      {
        title: "Security and Trust",
        description:
          "Understand the unique attack surface of autonomous agents and how to build safe, trustworthy systems.",
        lessons: [
          {
            title: "The Agent Security Threat Model",
            duration: "25 min",
            isFree: false,
            description:
              "Prompt injection, tool misuse, data exfiltration, and privilege escalation. Real attack patterns.",
          },
          {
            title: "Trust Protocols and Agent Identity",
            duration: "28 min",
            isFree: false,
            description:
              "How agents authenticate, authorise, and establish trust with each other and with users.",
          },
          {
            title: "Sandboxing and Least Privilege",
            duration: "22 min",
            isFree: false,
            description:
              "Constraining agent capabilities. Tool scoping, execution environments, and audit logging.",
          },
          {
            title: "Human-in-the-Loop Patterns",
            duration: "20 min",
            isFree: false,
            description:
              "When and how to require human approval. Escalation patterns and risk thresholds.",
          },
        ],
      },
      {
        title: "Agentic Ecosystems and Commerce",
        description:
          "Understand how agents interact, transact, and participate in the emerging agentic economy.",
        lessons: [
          {
            title: "Multi-Agent Systems and Coordination",
            duration: "28 min",
            isFree: false,
            description:
              "Orchestrator-worker patterns, agent registries, and inter-agent communication.",
          },
          {
            title: "Agentic Service Discovery",
            duration: "20 min",
            isFree: false,
            description:
              "How agents find and consume other agents' capabilities. The Agent Commons registry model.",
          },
          {
            title: "Agentic Commerce — Agents as Economic Actors",
            duration: "30 min",
            isFree: false,
            description:
              "Agents that can buy, sell, and negotiate. The infrastructure required for machine-to-machine commerce.",
          },
          {
            title: "Agentic Payments with USDC",
            duration: "35 min",
            isFree: false,
            description:
              "On-chain micropayments for agent services. USDC on Base, wallet management, and payment rails for agents.",
          },
        ],
      },
    ],
  },
];
