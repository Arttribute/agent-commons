export const coursesData = [
  {
    title: "AI Quick Wins for Creative Leaders",
    slug: "ai-quick-wins-for-creative-leaders",
    tagline: "Practical AI workflows that save time, stretch your team further, and grow your offer.",
    description:
      "A short, hands-on course for creative leaders who want immediate results from AI — not theory. Connect your tools, automate the admin, and build workflows that free up your team to do the work that actually matters.",
    longDescription:
      "You don't need a developer. You don't need a six-month strategy. You need to connect Google Sheets to WhatsApp, stop copy-pasting between tools, and get your first AI workflow running before the week is out. This course is built for creative leaders who are watching their peers talk about AI while their own inboxes, briefing processes, and approval loops stay exactly as painful as they were last year. Four modules. Sixteen lessons. Every single one ends with something you can switch on immediately. We cover the tools creative leaders are already paying for but underusing — and show you exactly how to wire them together with AI to work leaner, stretch your team further, and grow your offer with capabilities you already have.",
    price: 49,
    isFree: false,
    courseType: "self-paced" as const,
    level: "beginner" as const,
    duration: "4 hours",
    lessonsCount: 16,
    modulesCount: 4,
    instructor: "Agent Commons",
    tags: [
      "AI Workflows",
      "Automation",
      "Creative Ops",
      "No-Code",
      "Quick Wins",
      "ROI",
    ],
    published: true,
    isMainFeatured: false,
    isFeatured: true,
    modules: [
      {
        title: "Your First AI Wins — This Week",
        description:
          "Skip the theory. Get three AI workflows running before the week is out using tools you already have access to.",
        lessons: [
          {
            title: "The 20-Minute AI Audit",
            duration: "15 min",
            isFree: true,
            description:
              "Before adding anything new, find out what you're already paying for that has AI built in. A fast audit of your existing stack — Google Workspace, Microsoft 365, Notion, Canva — and where the quick wins are hiding.",
          },
          {
            title: "Turn Your Inbox into an Assistant",
            duration: "18 min",
            isFree: true,
            description:
              "Use AI inside Gmail or Outlook to draft replies, summarise long threads, and triage briefs and requests. A practical setup walkthrough you can complete during the lesson.",
          },
          {
            title: "AI for Briefs — From Rough Notes to Ready-to-Share",
            duration: "20 min",
            isFree: false,
            description:
              "Turn a rough voice note, bullet list, or messy email chain into a clean, structured creative brief in under five minutes. ChatGPT and Claude prompts that actually work for creative contexts.",
          },
          {
            title: "Meeting Notes to Action List — Automatically",
            duration: "15 min",
            isFree: false,
            description:
              "Record a meeting, get a summary, extract action items, and push them to your project tool — without touching a keyboard. A full walkthrough using tools available at every budget level.",
          },
        ],
      },
      {
        title: "Connect Your Tools — No Developer Needed",
        description:
          "Wire together the tools your team already uses — Google Forms, Sheets, WhatsApp, email, Slack — with AI in the middle. The automations creative teams actually need.",
        lessons: [
          {
            title: "How Tool Connections Work — The Non-Technical Version",
            duration: "15 min",
            isFree: false,
            description:
              "Triggers, actions, and data — the three concepts behind every automation. A visual explanation of how tools talk to each other and where AI fits in the chain.",
          },
          {
            title: "Google Forms → Sheets → WhatsApp Notifications",
            duration: "25 min",
            isFree: false,
            description:
              "The exact workflow Uncle Charis needed. A step-by-step build: collect a form response, log it to Sheets, and fire a WhatsApp message to the form owner and the respondent — automatically. Built with n8n, no code required.",
          },
          {
            title: "Automated Client Intake and Brief Confirmation",
            duration: "22 min",
            isFree: false,
            description:
              "A client fills in a form, AI summarises their brief, sends them a confirmation with a cleaned-up version of what they submitted, and pings your team in Slack. The full flow, built live.",
          },
          {
            title: "Building Your Own Workflow — A Template to Steal",
            duration: "20 min",
            isFree: false,
            description:
              "A reusable n8n template for creative intake, approval routing, and delivery confirmation. How to adapt it to your specific tools, team size, and client process.",
          },
        ],
      },
      {
        title: "Work Leaner with AI",
        description:
          "Identify where your creative operation is carrying unnecessary weight — and use AI to stretch your team further without adding headcount or budget.",
        lessons: [
          {
            title: "Where Creative Teams Carry the Most Unnecessary Weight",
            duration: "18 min",
            isFree: false,
            description:
              "A clear-eyed look at the five heaviest activities in a typical creative operation — and which of them AI can lighten materially today, not in theory.",
          },
          {
            title: "AI for Content Production — Stretch Your Existing Team Further",
            duration: "22 min",
            isFree: false,
            description:
              "Repurpose one piece of content into ten using AI. Blog to LinkedIn to email to social captions to short video script — a practical workflow that multiplies your team's output without adding headcount.",
          },
          {
            title: "Maximise What You're Already Paying For",
            duration: "18 min",
            isFree: false,
            description:
              "An audit of common creative tool subscriptions — stock imagery, copywriting tools, transcription services — and the AI capabilities already included in tools you are paying for but likely underusing.",
          },
          {
            title: "Building a Simple Efficiency Dashboard",
            duration: "15 min",
            isFree: false,
            description:
              "Track the time your AI workflows are freeing up so you can make the case to leadership — and know where to keep investing. A simple Google Sheets template you can set up in 20 minutes.",
          },
        ],
      },
      {
        title: "Grow Your Offer with AI",
        description:
          "Turn the capabilities your team is building into new opportunities — new services, faster delivery, and offers you couldn't have made before.",
        lessons: [
          {
            title: "New Services You Can Offer Because of AI",
            duration: "20 min",
            isFree: false,
            description:
              "AI lowers the cost of production fast enough that services that were previously out of reach — rapid concept sprints, localisation, personalised creative at scale — are now viable. A practical scan of what to add to your offer.",
          },
          {
            title: "Productising Your Creative Process",
            duration: "22 min",
            isFree: false,
            description:
              "Turn a bespoke creative service into a structured product with a fixed scope, fixed price, and AI-assisted delivery. How to package it, price it, and pitch it to clients who want speed and certainty.",
          },
          {
            title: "Faster Delivery as a Competitive Advantage",
            duration: "18 min",
            isFree: false,
            description:
              "When your team can turn a brief around in 48 hours instead of two weeks, that is a genuine differentiator. How to position speed — and what it takes operationally to deliver on that promise consistently.",
          },
          {
            title: "Your 30-Day AI Growth Plan",
            duration: "20 min",
            isFree: false,
            description:
              "Capstone lesson: identify one new opportunity, build one workflow that enables it, and set a 30-day target for what it should unlock. A simple one-page plan you can act on immediately.",
          },
        ],
      },
    ],
  },
  {
    title: "AI for Creative Executives",
    slug: "ai-for-creative-executives",
    tagline: "From brief to agentic workflow — without writing a line of code.",
    description:
      "A practical course for CCOs, CMOs, and creative leaders who want to harness AI across the full creative pipeline: ideation, visual exploration, voice prototyping, governance, and scalable team workflows.",
    longDescription:
      "Creative executives face a widening gap. Consumer-grade AI tools are everywhere, yet most courses either stop at prompting tricks or plunge into engineering complexity that requires an IT partner. This course closes that gap. It is built specifically for senior creative leaders — CCOs, CMOs, VPs of Creative, brand directors, and agency principals — who need to make confident decisions about AI adoption, lead their teams through real workflow change, and understand enough about agentic systems to govern them responsibly. Across six modules you will move through the full stack of creative AI: multimodal assistants for brief-writing and decision support; specialist generators for image, video, and voice exploration; no-code orchestration that turns one-off experiments into repeatable organisational capability; and governance practices — provenance, rights, review gates — that let outputs actually ship. Every lesson is grounded in real tools, real trade-offs, and exercises you can run with your team the following Monday.",
    price: 149,
    isFree: false,
    courseType: "self-paced" as const,
    level: "beginner" as const,
    duration: "10 hours",
    lessonsCount: 24,
    modulesCount: 6,
    instructor: "Agent Commons",
    tags: [
      "Creative Leadership",
      "Generative AI",
      "AI Agents",
      "Brand Governance",
      "Creative Ops",
      "Prompting",
    ],
    published: true,
    isMainFeatured: false,
    isFeatured: true,
    modules: [
      {
        title: "The Creative Executive's AI Landscape",
        description:
          "Build the mental model you need to lead AI adoption in a creative organisation — not as a technologist, but as the creative decision-maker.",
        lessons: [
          {
            title: "Why AI Changes Creative Leadership",
            duration: "20 min",
            isFree: true,
            description:
              "This is not about automating creativity — it is about compressing the distance between insight and output. What shifts when your team has AI in the loop at every stage.",
          },
          {
            title: "The Three-Layer Creative AI Stack",
            duration: "18 min",
            isFree: true,
            description:
              "Creation tools, agentic orchestration, and governance/provenance. How the layers interact and why understanding all three matters for executives.",
          },
          {
            title: "Evaluating AI Tools as a Creative Leader",
            duration: "22 min",
            isFree: false,
            description:
              "The five criteria that matter for executive adoption: impact leverage, learning cost, workflow reality, governance controls, and provenance readiness. A practical evaluation rubric.",
          },
          {
            title: "AI Readiness — Where Does Your Organisation Stand?",
            duration: "15 min",
            isFree: false,
            description:
              "A structured self-assessment. Mapping your team's current AI literacy, tooling gaps, and the highest-leverage entry points for your context.",
          },
        ],
      },
      {
        title: "AI as Your Creative Director of Staff",
        description:
          "Learn to use multimodal AI assistants — ChatGPT, Claude, Gemini — as a creative chief of staff: ideating, synthesising, critiquing, and turning briefs into strategic options.",
        lessons: [
          {
            title: "From Brief to Options — The Core Creative Loop",
            duration: "25 min",
            isFree: false,
            description:
              "A repeatable prompting pattern: brief → strategic framing → concept options → decision checklist. Applied to a real campaign brief from first principles.",
          },
          {
            title: "Prompting for Creative Depth, Not Just Speed",
            duration: "22 min",
            isFree: false,
            description:
              "Why most executives get mediocre AI outputs: context starvation. System instructions, persona priming, and the five prompting moves that produce genuinely useful creative thinking.",
          },
          {
            title: "Building Brand Voice Consistency at Scale",
            duration: "28 min",
            isFree: false,
            description:
              "Using Claude Projects and custom GPTs to encode brand voice, tone guidelines, and approved vocabulary so every output starts from your standards, not a blank page.",
          },
          {
            title: "AI-Assisted Research and Competitive Synthesis",
            duration: "20 min",
            isFree: false,
            description:
              "Turning competitive scans, customer interview transcripts, and trend reports into actionable creative briefs. Perplexity, ChatGPT deep research, and critical-evaluation habits.",
          },
        ],
      },
      {
        title: "Visual, Video, and Voice Exploration",
        description:
          "Move from words to sensory artefacts. Use specialist generators to compress the distance from concept to prototype — mood boards, animatics, and voice casts in hours, not weeks.",
        lessons: [
          {
            title: "Image Generation for Brand-Safe Concept Boards",
            duration: "30 min",
            isFree: false,
            description:
              "Adobe Firefly vs Midjourney — when to use each. Generating 20 concept directions inside brand constraints. Content Credentials and what they mean for your assets.",
          },
          {
            title: "Building a Style Bible with AI",
            duration: "25 min",
            isFree: false,
            description:
              "A sprint exercise: generate mood boards across three visual directions, then translate the winning direction into human art direction notes your design team can execute.",
          },
          {
            title: "Video Prototyping for Pitches and Animatics",
            duration: "28 min",
            isFree: false,
            description:
              "Runway and Pika for short-form motion concepts. Storyboard to rough cut to pitch-ready animatic. What to review before a clip leaves creative for legal.",
          },
          {
            title: "Voice Casting and Audio Prototyping",
            duration: "22 min",
            isFree: false,
            description:
              "ElevenLabs for narration, character voices, and localisation exploration. The consent and disclosure workflow your organisation must have before any voice clone ships.",
          },
        ],
      },
      {
        title: "From Prompts to Workflows — Agentic Thinking for Executives",
        description:
          "Understand what AI agents actually are, see how agentic pipelines work in creative production, and build your first no-code automation — without writing a line of code.",
        lessons: [
          {
            title: "What Is an AI Agent? (The Non-Technical Explanation)",
            duration: "20 min",
            isFree: false,
            description:
              "Agents are not chatbots. They plan, call tools, get results, and loop — until a goal is reached. A visual walkthrough of the perceive-reason-act loop and why it changes creative ops.",
          },
          {
            title: "The Brief-to-Publish Agentic Pipeline",
            duration: "25 min",
            isFree: false,
            description:
              "A walkthrough of a real agentic creative pipeline: brief intake → LLM ideation → generator routing → asset assembly → human review gate → provenance attachment → publish. Where to start building.",
          },
          {
            title: "Building Your First Custom GPT for Creative Ops",
            duration: "35 min",
            isFree: false,
            description:
              "Plan, build, and test a custom GPT that automates a high-frequency creative task — brief intake, copy critique, or brand QA. Hands-on: from use-case definition to first working prototype.",
          },
          {
            title: "Visual Workflow Automation with n8n",
            duration: "30 min",
            isFree: false,
            description:
              "Turning a one-off AI experiment into a repeatable team workflow using n8n's visual builder. Brief forms → task creation → AI step → approval routing → archive. Self-hosting vs cloud, designing for failure states, and why n8n gives creative orgs more control than SaaS automation tools.",
          },
        ],
      },
      {
        title: "Governance, Rights, and Responsible AI",
        description:
          "The reason most AI pilots stall is not capability — it is trust. Build the review gates, provenance practices, and ethical frameworks that let AI-generated creative actually ship.",
        lessons: [
          {
            title: "Content Provenance and What It Means for Brands",
            duration: "22 min",
            isFree: false,
            description:
              "Content Credentials (C2PA) — what they are, which tools attach them, and why they matter for your clients and legal team. A practical provenance policy for campaigns.",
          },
          {
            title: "IP, Rights, and Licensing in AI-Generated Creative",
            duration: "28 min",
            isFree: false,
            description:
              "The current state of copyright in AI-generated work. Training data postures (Firefly vs Midjourney vs Stable Diffusion). Building a rights-review checklist your legal team will sign off on.",
          },
          {
            title: "Designing Human Review Gates That Scale",
            duration: "20 min",
            isFree: false,
            description:
              "Review gates are not bottlenecks — they are trust infrastructure. Where to insert human judgement, what to check at each gate, and how to use Filestage or similar tools for structured approval.",
          },
          {
            title: "Ethical Frameworks for AI in Creative Work",
            duration: "18 min",
            isFree: false,
            description:
              "Bias, representation, and disclosure — the decisions your organisation needs a policy on before the next campaign ships. A framework for writing your team's responsible AI principles.",
          },
        ],
      },
      {
        title: "Scaling Creative Operations with AI",
        description:
          "Pilot wins become organisational capability only when you build systems, not habits. Learn how to roll out AI across your creative function and measure what actually matters.",
        lessons: [
          {
            title: "Designing Your Creative AI Stack",
            duration: "25 min",
            isFree: false,
            description:
              "A tool-selection framework for creative organisations: primary multimodal assistant, specialist generators, automation layer, and governance tooling. How to evaluate, sequence, and budget.",
          },
          {
            title: "Change Management for Creative Teams",
            duration: "22 min",
            isFree: false,
            description:
              "Creative professionals have legitimate concerns about AI. How to address them honestly, involve your team in tool selection, and move from fear to agency. Real patterns from creative org rollouts.",
          },
          {
            title: "Measuring the Impact of AI on Creative Output",
            duration: "18 min",
            isFree: false,
            description:
              "Cycle time from brief to approved concept. Concepts explored per dollar. Revision rounds. The metrics that actually capture AI's impact on creative quality and throughput.",
          },
          {
            title: "Building Your 90-Day Creative AI Roadmap",
            duration: "30 min",
            isFree: false,
            description:
              "Capstone exercise: define your highest-leverage AI entry point, select your first three tools, design one agentic workflow, and write a one-page responsible AI policy for your team.",
          },
        ],
      },
    ],
  },
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
