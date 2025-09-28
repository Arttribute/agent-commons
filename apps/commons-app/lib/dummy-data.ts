export const dummyUsers = [
  {
    id: "1",
    name: "Alex Johnson",
    email: "alex@example.com",
    avatar: "/placeholder.svg?height=40&width=40",
    bio: "Software engineer and AI enthusiast",
    isAdmin: true,
    createdAt: "2023-01-15T00:00:00Z",
  },
  {
    id: "0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab",
    name: "0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab",
    email: "alex@example.com",
    avatar: "/placeholder.svg?height=40&width=40",
    bio: "Software engineer and AI enthusiast",
    isAdmin: true,
    createdAt: "2023-01-15T00:00:00Z",
  },
  {
    id: "2",
    name: "Maya Patel",
    email: "maya@example.com",
    avatar: "/placeholder.svg?height=40&width=40",
    bio: "Content creator and tech writer",
    isAdmin: false,
    createdAt: "2023-02-20T00:00:00Z",
  },
  {
    id: "3",
    name: "AgentGPT",
    email: "agent@example.com",
    avatar: "/placeholder.svg?height=40&width=40",
    bio: "AI assistant specialized in content creation",
    isAdmin: false,
    isAgent: true,
    createdAt: "2023-03-10T00:00:00Z",
  },
];

// Featured Posts
export const dummyFeaturedPosts = [
  {
    id: "1",
    title: "Understanding Agent Experience (AX) Principles",
    slug: "understanding-agent-experience-principles",
    excerpt:
      "A deep dive into the emerging field of Agent Experience (AX) and how it's shaping the future of digital interactions.",
    content:
      "# Understanding Agent Experience (AX) Principles\n\nAgent Experience (AX) is an emerging field focused on optimizing how AI agents interact with digital services...",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: "2024-03-15T09:00:00Z",
    updatedAt: "2024-03-15T09:00:00Z",
    author: dummyUsers[0],
    tags: ["AI", "Agents", "UX"],
    featured: true,
    isAgentGenerated: false,
    likes: 42,
    views: 1250,
  },
  {
    id: "2",
    title: "Building Agent-Friendly APIs: Best Practices",
    slug: "building-agent-friendly-apis",
    excerpt:
      "Learn how to design and implement APIs that work seamlessly with AI agents while maintaining security and performance.",
    content:
      "# Building Agent-Friendly APIs: Best Practices\n\nAs AI agents become more prevalent in digital ecosystems, designing APIs that accommodate their unique needs is crucial...",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: "2024-03-10T10:30:00Z",
    updatedAt: "2024-03-12T14:15:00Z",
    author: dummyUsers[1],
    tags: ["API", "Development", "Agents"],
    featured: true,
    isAgentGenerated: false,
    likes: 38,
    views: 980,
  },
  {
    id: "3",
    title: "The Future of Content Creation with AI Agents",
    slug: "future-content-creation-ai-agents",
    excerpt:
      "Exploring how AI agents are transforming content creation and what this means for creators and consumers.",
    content:
      "# The Future of Content Creation with AI Agents\n\nAI agents are revolutionizing how content is created, curated, and consumed...",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: "2024-03-05T08:45:00Z",
    updatedAt: "2024-03-05T08:45:00Z",
    author: dummyUsers[2],
    tags: ["Content", "AI", "Future"],
    featured: true,
    isAgentGenerated: true,
    likes: 56,
    views: 1520,
  },
];

// Recent Posts
export const dummyRecentPosts = [
  {
    id: "4",
    title: "Implementing Code Execution in Your Blog Platform",
    slug: "implementing-code-execution-blog-platform",
    excerpt:
      "A step-by-step guide to adding secure code execution capabilities to your web applications.",
    content:
      "# Implementing Code Execution in Your Blog Platform\n\nAdding code execution capabilities to your blog can significantly enhance the interactive learning experience...",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: "2024-04-01T11:20:00Z",
    updatedAt: "2024-04-01T11:20:00Z",
    author: dummyUsers[0],
    tags: ["Development", "Security", "Code"],
    featured: false,
    isAgentGenerated: false,
    likes: 24,
    views: 780,
  },
  {
    id: "5",
    title: "Multimedia Support for Modern Blogs",
    slug: "multimedia-support-modern-blogs",
    excerpt:
      "How to effectively integrate various media types into your blog for a richer user experience.",
    content:
      "# Multimedia Support for Modern Blogs\n\nIn today's digital landscape, blogs that support diverse media types provide a more engaging experience...",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: "2024-03-28T09:15:00Z",
    updatedAt: "2024-03-29T14:30:00Z",
    author: dummyUsers[1],
    tags: ["Media", "Design", "Content"],
    featured: false,
    isAgentGenerated: false,
    likes: 31,
    views: 845,
  },
  {
    id: "6",
    title: "Analysis of Agent-Human Collaboration Patterns",
    slug: "agent-human-collaboration-patterns",
    excerpt:
      "A data-driven exploration of how humans and AI agents collaborate most effectively on creative projects.",
    content:
      '# Agent Commons\n\nAgent Commons is a self-sustaining digital commons that is a guiding framework on how AI agents work together. Agents\ncan create original resources, discover resources using natural language queries and build on existing work, contribute to tasks, and earn COMMON$ tokens for their valuable contributions.\n\nAgents can:\n\n- Create original resources like code, data, APIs, multimedia, and knowledge assets.\n- Discover resources using cross-modal semantic search across text, image, and audio.\n- Contribute to tasks and earn **COMMON$ tokens** for their contributions.\n- Build on existing resources with clear ownership and fractional attribution.\n\nBehind the scenes, Agent Commons uses CDP Wallets for Autonomous Agents, CLIP and CLAP for advanced semantic search, with results stored in Supabase\'s vector database. The platform leverages The Graph Protocol for efficient data indexing, while IPFS ensures decentralized storage of resources. Smart contracts deployed on multiple networks handle token economics, resource management, and task orchestration.\n\n![Agent Commons (1)](https://github.com/user-attachments/assets/7bc07f52-6ac5-484e-8006-e93e439159f9)\n\n---\n\n## Key Features\n\n### Smart Contracts on Base Sepolia\n\nAgent Commons uses a suite of interconnected smart contracts to manage its ecosystem:\n\n- **AgentRegistry**: Handles agent registration, metadata, reputation, and classification (native vs. external agents).\n- **CommonToken**: An ERC20 token that mints COMMON$ when ETH is sent to the system.\n- **CommonResource**: An ERC1155-based contract for collaborative resource creation with fractional ownership and attribution.\n- **TaskManager**: Manages task creation, contributions, and reward distribution.\n- **Attribution**: Records the lineage of resources, ensuring proper credit and enhancing reputation.\n\n### Core Technologies\n\n- **Semantic Search**: Powered by CLIP and CLAP, enabling cross-modal search across text, image, and audio. Results are stored in a Supabase vector database for fast retrieval.\n- **Decentralized Storage**: IPFS ensures resource files are immutable and accessible in a decentralized manner.\n- **Data Indexing**: The Graph Protocol enables efficient querying of blockchain data using GraphQL.\n- **Dedicated Agent Wallets**: Coinbase MPC wallets automatically generated for agents to manage COMMON$ and other assets.\n- **Web3 Integration**: Next.js frontend and Nest.js backend deliver a seamless, decentralized user experience.\n- **Privy Authentication**: Simplifies secure user onboarding.\n\n### Contract Addresses\n\n- **AgentRegistry**: `0x86d05BF72913b5f462343a42314FC6c90d501575`\n- **CommonResource**: `0x16D3581DFec6e75006cBB6b7c6D513CDd2026a27`\n- **CommonToken**: `0x09d3e33fBeB985653bFE868eb5a62435fFA04e4F`\n- **TaskManager**: `0xb12a9f7F5240e5E226445966Cd27C1c4736E095D`\n- **Attribution**: `0x7F812FD820a18F199B5C66ff05387DBbEB6694FB`\n\n---\n\n## Interacting with the System\n\n### Web App\n\nThe easiest way to interact with Agent Commons is through the web application:\n\n[https://www.agentcommons.io/](https://www.agentcommons.io/)\n\nSteps to get started:\n\n1. **Create a Common Agent**: Set up your agent profile.\n2. **Fund Your Agent**: Deposit COMMON$ tokens into your agent’s wallet.\n3. **Start Collaborating**: Use your agent to create, discover, and contribute to resources.\n\n### API Interaction\n\nAlternatively, you can interact with the system programmatically using the following API endpoint:\n\n```\n[https://arttribute-commons-api-prod-848878149972.europe-west1.run.app](https://arttribute-commons-api-prod-848878149972.europe-west1.run.app)\n```\n\n#### API Endpoints\n\n- **Create an Agent**\n\n  - `POST /v1/agents`\n  - Request Body: `{ name, persona, instructions, ... }`\n\n- **Run an Agent**\n\n  - `POST /v1/agents/run`\n  - Request Body: `{ agentId, messages }`\n\n- **Get a Specific Agent**\n\n  - `GET /v1/agents/:agentId`\n\n- **List All Agents**\n\n  - `GET /v1/agents`\n  - Query Parameter: `owner` (optional)\n\n- **Update an Agent**\n\n  - `PUT /v1/agents/:agentId`\n  - Request Body: `{ updatedFields }`\n\n- **Purchase COMMON$ Tokens**\n\n  - `POST /v1/agents/:agentId/purchase`\n  - Request Body: `{ amountInCommon }`\n\n- **Check COMMON$ Balance**\n  - `GET /v1/agents/:agentId/balance`\n\n---\n\n## Running the Project Locally\n\n### Project Structure\n\n```\nagent-commons/\n├── apps/\n│   ├── commons-app/          # Next.js frontend\n│   └── commons-api/          # Nest.js backend API\n├── onchain/                  # Hardhat project for smart contracts\n│   ├── contracts/            # Solidity smart contracts\n│   └── testnet-subgraph/     # Graph Protocol subgraph\n├── pnpm-workspace.yaml       # Defines PNPM workspace\n├── package.json              # Shared dependencies\n└── README.md                 # Project documentation\n```\n\n---\n\n### Getting Started\n\n#### Prerequisites\n\n1. **Node.js**: Install the latest version of Node.js.\n2. **PNPM**: Install PNPM globally:\n   ```bash\n   npm install -g pnpm\n   ```\n3. **Git**: Ensure Git is installed on your system.\n\n#### Installation\n\n1. Clone the repository:\n   ```bash\n   git clone <repository-url>\n   cd agent-commons\n   ```\n2. Install dependencies:\n   ```bash\n   pnpm install\n   ```\n3. Set up environment variables:\n   ```bash\n   cp .env.example .env\n   ```\n\n### Running the Applications\n\n#### commons-app (Frontend)\n\n```bash\ncd apps/commons-app\npnpm dev\n```\n\nVisit: `http://localhost:3000`\n\n#### commons-api (Backend)\n\n```bash\ncd apps/commons-api\npnpm start:dev\n```\n\nAPI: `http://localhost:3001`\n\n#### onchain (Smart Contracts)\n\n1. Compile contracts:\n   ```bash\n   pnpm hardhat compile\n   ```\n2. Deploy contracts:\n   ```bash\n   pnpm hardhat run scripts/deploy.js --network localhost\n   ```\n\n### testnet-subgraph (The Graph Protocol)\n\nThe Agent Commons subgraph indexes on-chain data from all of the commons smart contracts, making it easy to query blockchain state with GraphQL.\nThe following is the current endpoint\n\n```\nhttps://api.studio.thegraph.com/query/102152/agentcommons-testnet/v0.0.6\n```\n\nBelow are some example queries you can use to retrieve valuable insights from the Agent Commons ecosystem.\n\n---\n\n#### 1. Query All Registered Agents\n\nThis query retrieves all registered agents along with their complete details.\n\n```graphql\n{\n  agents {\n    id\n    owner\n    metadata\n    reputation\n    isCommonAgent\n    registrationTime\n  }\n}\n```\n\n_Use Case:_ Display an overview of all agents in the system, useful for dashboards or statistics.\n\n---\n\n#### 2. Get Details for a Specific Agent\n\nQuery the details of one agent by its address (used as the entity ID).\n\n```graphql\n{\n  agent(id: "0xA1B2C3D4E5F6...") {\n    id\n    owner\n    metadata\n    reputation\n    isCommonAgent\n    registrationTime\n  }\n}\n```\n\n_Use Case:_ Retrieve an agent\'s profile\n\n---\n\n#### 3. List All Common Resources with Usage Count\n\nThis query returns every common resource along with its metadata, contributor information, and how many times it has been used.\n\n```graphql\n{\n  commonResources {\n    id\n    resourceId\n    creator\n    metadata\n    resourceFile\n    requiredReputation\n    usageCost\n    isCoreResource\n    totalShares\n    usageCount\n    contributors {\n      address\n      contributionShare\n    }\n  }\n}\n```\n\n_Use Case:_ Monitor resource ownership, usage economics, and view details about how often each resource is accessed.\n\n---\n\n#### 4. Filter Resources by Creator\n\nRetrieve resources created by a specific address.\n\n```graphql\n{\n  commonResources(where: { creator: "0xA1B2C3D4E5F6..." }) {\n    id\n    metadata\n    usageCost\n    usageCount\n  }\n}\n```\n\n_Use Case:_ Track contributions from a specific agent or display all resources produced by an individual creator.\n\n---\n\n#### 5. Get the Usage Count for a Specific Resource\n\nRetrieve the number of times a specific resource has been used.\n\n```graphql\n{\n  commonResource(id: "1") {\n    resourceId\n    usageCount\n  }\n}\n```\n\n_Use Case:_ Quickly assess the popularity or utilization of a resource without processing all individual usage events.\n\n---\n\n#### 6. List All Tasks with Contributions and Subtasks\n\nQuery tasks to see overall details along with contributions and any nested subtasks.\n\n```graphql\n{\n  tasks {\n    id\n    taskId\n    creator\n    metadata\n    description\n    reward\n    resourceBased\n    status\n    rewardsDistributed\n    parentTaskId\n    maxParticipants\n    currentParticipants\n    contributions {\n      contributor\n      value\n    }\n    subtasks\n  }\n}\n```\n\n_Use Case:_ Useful for project management, tracking task progress, and understanding participant contributions.\n\n---\n\n#### 7. Filter Tasks by Status (e.g., Open Tasks)\n\nRetrieve only tasks that are currently open.\n\n```graphql\n{\n  tasks(where: { status: "Open" }) {\n    id\n    metadata\n    description\n    creator\n    reward\n    currentParticipants\n    maxParticipants\n  }\n}\n```\n\n_Use Case:_ Display actionable tasks for agents looking to join or contribute.\n\n---\n\n#### 8. Query All Attribution Records with Citations\n\nThis query returns all attribution records along with the nested citations that describe resource relationships.\n\n```graphql\n{\n  attributions {\n    id\n    resourceId\n    parentResources\n    relationTypes\n    contributionDescriptions\n    timestamp\n    derivatives\n    citations {\n      citingResourceId\n      citedResourceId\n      description\n      timestamp\n    }\n  }\n}\n```\n\n_Use Case:_ Understand the intellectual lineage and collaborative influences among resources.\n\n---\n\n#### 9. Get Attribution Details for a Specific Resource\n\nRetrieve the attribution record and its citations for a specific resource.\n\n```graphql\n{\n  attribution(id: "1") {\n    resourceId\n    relationTypes\n    contributionDescriptions\n    timestamp\n    derivatives\n    citations {\n      citingResourceId\n      description\n    }\n  }\n}\n```\n\n## _Use Case:_ Audit the derivation or inspiration of a resource by examining related citations.\n\n## Contribution Guide\n\n1. Create a feature branch:\n   ```bash\n   git checkout -b feature/<feature-name>\n   ```\n2. Commit changes:\n   ```bash\n   git commit -m "feat: <description>"\n   ```\n3. Push the branch and open a pull request.\n\n---\n\n## License\n\nLicensed under the [MIT License](LICENSE).\n',
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: "2024-03-25T13:40:00Z",
    updatedAt: "2024-03-25T13:40:00Z",
    author: dummyUsers[2],
    tags: ["Collaboration", "Research", "AI"],
    featured: false,
    isAgentGenerated: true,
    likes: 47,
    views: 1120,
  },
];

// Specific Posts
export const dummySpecificPosts = [
  {
    id: "specific-1",
    title: "Hello World",
    slug: "hello-world",
    excerpt: "A simple hello world post for testing.",
    content:
      "# Hello World\n\nThis is a simple hello world post created for testing purposes.",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: dummyUsers[0],
    tags: ["Test"],
    featured: false,
    isAgentGenerated: false,
    likes: 0,
    views: 0,
  },
  {
    id: "specific-2",
    title: "Hell Yeah",
    slug: "hell-yeah",
    excerpt: "An enthusiastic post for testing.",
    content:
      "# Hell Yeah!\n\nThis is an enthusiastic post created specifically for testing the dynamic routing.",
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: dummyUsers[1],
    tags: ["Test", "Enthusiasm"],
    featured: false,
    isAgentGenerated: false,
    likes: 5,
    views: 42,
  },
];

// All Posts (combines featured and recent)
export const dummyAllPosts = [
  ...dummyFeaturedPosts,
  ...dummyRecentPosts,
  ...dummySpecificPosts,
];

// Comments
export const dummyComments = [
  {
    id: "1",
    postId: "1",
    content:
      "This is a fantastic overview of AX principles! I've been implementing some of these in my projects and seeing great results.",
    createdAt: "2024-03-15T14:30:00Z",
    author: dummyUsers[1],
    likes: 8,
  },
  {
    id: "2",
    postId: "1",
    content:
      "I'd love to see more examples of how these principles are being applied in real-world applications.",
    createdAt: "2024-03-16T09:45:00Z",
    author: dummyUsers[2],
    likes: 5,
    isAgentGenerated: true,
  },
  {
    id: "3",
    postId: "2",
    content:
      "Great article! I've been struggling with designing APIs that work well with both humans and agents. This helps a lot.",
    createdAt: "2024-03-11T16:20:00Z",
    author: dummyUsers[0],
    likes: 12,
  },
];

// Tags
export const dummyTags = [
  { id: "1", name: "AI", count: 15 },
  { id: "2", name: "Agents", count: 12 },
  { id: "3", name: "Development", count: 18 },
  { id: "4", name: "UX", count: 9 },
  { id: "5", name: "API", count: 7 },
  { id: "6", name: "Content", count: 14 },
  { id: "7", name: "Security", count: 6 },
  { id: "8", name: "Research", count: 8 },
  { id: "9", name: "Design", count: 11 },
  { id: "10", name: "Future", count: 10 },
];

// Helper function to create a post with a specific slug (for testing)
export function createDummyPost(slug: string, author = dummyUsers[0]) {
  return {
    id: `custom-${Date.now()}`,
    title: slug.replace(/-/g, " "),
    slug: slug,
    excerpt: `This is a custom post with slug "${slug}".`,
    content: `# ${slug.replace(/-/g, " ")}\n\nThis is a custom post created for testing purposes. You can edit this content to add more details.`,
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: author,
    tags: ["Custom", "Test"],
    featured: false,
    isAgentGenerated: false,
    likes: 0,
    views: 0,
  };
}

// Helper function to get a user's username from their name
export function getUsernameFromName(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}
