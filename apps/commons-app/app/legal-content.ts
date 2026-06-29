export type LegalSection = {
  title: string;
  body?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  description: string;
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
};

export const legalMeta = {
  company: "Agent Commons",
  ecosystem: "Agent Commons ecosystem",
  product: "Agent Commons",
  commonLab: "CommonLab",
  contactEmail: "legal@agentcommons.io",
  privacyEmail: "privacy@agentcommons.io",
  coursesEmail: "courses@agentcommons.io",
  effectiveDate: "28 June 2026",
  governingLaw: "England and Wales",
};

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  description:
    "How Agent Commons collects, uses, shares, protects, and retains personal data across the Agent Commons ecosystem.",
  effectiveDate: legalMeta.effectiveDate,
  intro: [
    `This Privacy Policy explains how ${legalMeta.company} collects, uses, discloses, and protects personal data when you use the ${legalMeta.ecosystem}, including ${legalMeta.product}, ${legalMeta.commonLab}, Commons Identity, our APIs, SDKs, websites, agent workspaces, course experiences, and related services.`,
    "Some products may include feature-specific notices at the point of collection. Those notices supplement this Privacy Policy for the feature they describe.",
    "This is a practical, legal-ready policy draft for a modern AI, education, identity, and developer platform. It should be reviewed by qualified counsel before production reliance.",
  ],
  sections: [
    {
      title: "1. Who Controls Your Data",
      body: [
        `${legalMeta.company} is the controller of personal data processed for account management, platform operation, course delivery, billing support, safety, analytics, and communications. Where customers, educators, or developers use our services to process personal data on behalf of others, they may be the controller and Agent Commons may act as a processor or service provider under a separate agreement.`,
        `For privacy questions or rights requests, contact ${legalMeta.privacyEmail}.`,
      ],
    },
    {
      title: "2. Services Covered",
      body: [
        "This policy covers current and future products in the Agent Commons ecosystem, including the main Agent Commons platform for creating, discovering, and collaborating with agents; CommonLab for courses, labs, skill paths, educator tools, and learner sandboxes; Commons Identity for authentication and account federation; and developer-facing APIs, SDKs, CLIs, and integrations.",
      ],
    },
    {
      title: "3. Information We Collect",
      bullets: [
        "Account data, such as name, email address, profile image, authentication provider identifiers, credentials where supported, and account settings.",
        "Workspace data, such as agents, spaces, workflows, tasks, tools, files, memory entries, preferences, messages, logs, and collaboration activity.",
        "Course and learner data, such as enrollments, progress, submissions, badges, certificates, sandbox activity, educator-created content, and support requests.",
        "Payment and commercial data, such as checkout status, purchases, invoices, refunds, credits, balances, and transaction references. Payment card details are processed by payment providers and are not stored by us.",
        "Developer and integration data, such as API keys, OAuth connection metadata, tool definitions, MCP server details, webhook endpoints, and app registration information.",
        "Device, usage, security, and analytics data, including IP address, browser type, pages viewed, feature use, API requests, errors, timestamps, login events, and abuse-prevention signals.",
      ],
    },
    {
      title: "4. Third-Party Integrations",
      body: [
        "If you connect third-party services through OAuth, APIs, tools, wallets, payment providers, or learning integrations, we may receive and process information authorized by you or the connected service. The data available to an agent or workflow depends on the permissions you grant and the configuration you choose.",
        "Third-party services operate under their own terms and privacy policies.",
      ],
    },
    {
      title: "5. AI, Agents, and Generated Content",
      body: [
        "Agent Commons services may process prompts, instructions, messages, files, tool outputs, logs, memories, and generated responses to provide agent, workflow, sandbox, evaluation, and collaboration features. Depending on your configuration, content may be sent to model providers, infrastructure providers, or connected tools to complete your request.",
        "Avoid submitting sensitive personal data, regulated data, secrets, private keys, or confidential third-party information unless your account, agreement, and configuration permit that use.",
      ],
    },
    {
      title: "6. How We Use Information",
      bullets: [
        "Provide, maintain, secure, and improve the services.",
        "Create and manage accounts, authentication, permissions, enrollments, workspaces, and developer credentials.",
        "Process payments, credits, invoices, refunds, tax information, and fraud checks.",
        "Run agents, workflows, tools, sandboxes, memory, logs, and integrations according to your instructions.",
        "Provide support, administrative messages, policy notices, and service updates.",
        "Measure reliability, usage, product performance, and learning progress.",
        "Detect, prevent, and respond to abuse, spam, security incidents, unauthorized access, and violations of our terms.",
        "Comply with legal obligations, enforce agreements, and protect rights, safety, and property.",
      ],
    },
    {
      title: "7. Legal Bases",
      body: [
        "Where data protection law requires a legal basis, we rely on performance of a contract, legitimate interests, consent, and legal obligations depending on the context and feature.",
      ],
    },
    {
      title: "8. How We Share Information",
      bullets: [
        "Service providers and subprocessors that host infrastructure, databases, analytics, email, payments, identity, storage, model inference, monitoring, and support systems.",
        "Connected third-party services that you authorize or instruct us to use.",
        "Educators, collaborators, team members, or workspace participants where your account role or product feature makes information visible to them.",
        "Payment processors, financial institutions, tax providers, fraud-prevention partners, advisers, regulators, courts, and public authorities where needed.",
        "Successors in a merger, acquisition, financing, reorganization, or asset transfer, subject to appropriate protections.",
      ],
    },
    {
      title: "9. Cookies and Analytics",
      body: [
        "We use essential cookies for authentication, security, and core functionality. We may also use analytics technologies to understand usage and improve services. Where required, we request consent before using non-essential cookies or similar technologies.",
      ],
    },
    {
      title: "10. Retention and Security",
      body: [
        "We retain personal data for as long as needed to provide the services, comply with legal obligations, resolve disputes, enforce agreements, maintain security, and support legitimate business purposes. When data is no longer needed, we delete, de-identify, or aggregate it where practical and legally permissible.",
        "We use administrative, technical, and organizational safeguards designed to protect personal data, including access controls, encryption in transit, credential protections, monitoring, audit logs, and least-privilege operational practices. No system is perfectly secure.",
      ],
    },
    {
      title: "11. International Transfers",
      body: [
        "We may process and store information in countries other than where you live. When required, we use appropriate safeguards for international transfers, such as contractual protections and other lawful transfer mechanisms.",
      ],
    },
    {
      title: "12. Your Privacy Rights",
      body: [
        "Depending on your location, you may have rights to access, correct, delete, export, restrict, or object to processing of personal data; withdraw consent; opt out of certain sharing, targeted advertising, or profiling; and appeal a decision about your request. We do not sell personal data in the ordinary meaning of selling it for money.",
        `To exercise rights, contact ${legalMeta.privacyEmail}. We may need to verify your identity.`,
      ],
    },
    {
      title: "13. Children and Students",
      body: [
        "The services are not directed to children under 13. CommonLab accounts are intended for users who are at least 16 unless a separate school, parent, guardian, or educator arrangement permits use under applicable law.",
      ],
    },
    {
      title: "14. Changes and Contact",
      body: [
        "We may update this Privacy Policy from time to time. If changes are material, we will provide reasonable notice through the services, email, or another appropriate channel.",
        `For privacy questions, rights requests, or data protection concerns, contact ${legalMeta.privacyEmail}. For general legal notices, contact ${legalMeta.contactEmail}.`,
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  description:
    "Terms governing access to and use of Agent Commons, CommonLab, Commons Identity, APIs, SDKs, agents, workflows, courses, and related services.",
  effectiveDate: legalMeta.effectiveDate,
  intro: [
    `These Terms of Service govern your access to and use of the ${legalMeta.ecosystem}, including ${legalMeta.product}, ${legalMeta.commonLab}, Commons Identity, APIs, SDKs, CLIs, websites, courses, labs, agent workspaces, tools, integrations, and related services.`,
    "By creating an account, accessing a service, connecting an integration, enrolling in a course, using an API key, or otherwise using the services, you agree to these Terms. If you use the services on behalf of an organization, you represent that you have authority to bind that organization.",
    "Product-specific terms below apply in addition to the general terms.",
  ],
  sections: [
    {
      title: "1. Who We Are",
      body: [
        `${legalMeta.company} operates the Agent Commons ecosystem. Legal notices may be sent to ${legalMeta.contactEmail}. Course-related support may be sent to ${legalMeta.coursesEmail}.`,
      ],
    },
    {
      title: "2. Eligibility and Accounts",
      bullets: [
        "You must be at least 16 years old to create an account unless a separate educator, school, parent, guardian, or enterprise arrangement permits use under applicable law.",
        "You must provide accurate account information and keep it current.",
        "You are responsible for safeguarding credentials, session access, API keys, OAuth grants, wallet credentials, and actions taken under your account.",
        "You must notify us promptly if you suspect unauthorized access or misuse.",
      ],
    },
    {
      title: "3. Ecosystem Services",
      body: [
        "The services may include agent creation and discovery, spaces, sessions, workflow automation, tasks, tools, memory, logs, API access, SDKs, OAuth connections, MCP tools, course delivery, labs, learner sandboxes, educator consoles, payments, credits, and identity services.",
        "We may add, change, suspend, or discontinue features where reasonably necessary for reliability, security, legal compliance, or product development.",
      ],
    },
    {
      title: "4. Agent Commons Platform Terms",
      bullets: [
        "You are responsible for the agents, workflows, tasks, prompts, tools, files, memory, API calls, and outputs configured or initiated through your account.",
        "Agents and workflows may take actions through connected services only according to permissions, credentials, policies, and tool configurations you provide.",
        "You must review agent behavior, outputs, and tool actions before relying on them for important decisions.",
        "You may not represent that an agent, workflow, or output is endorsed by Agent Commons unless we have agreed in writing.",
      ],
    },
    {
      title: "5. CommonLab Course Terms",
      bullets: [
        "After enrollment, we grant you a personal, non-exclusive, non-transferable, revocable license to access course content for your own educational use.",
        "You may not share, resell, sublicense, scrape, publicly distribute, or create derivative commercial course products from CommonLab materials without written permission.",
        "Certificates, badges, and completion records are evidence of platform activity only and are not professional licenses, academic degrees, or regulated credentials unless expressly stated.",
        "Live sessions may be recorded and made available to enrolled learners.",
      ],
    },
    {
      title: "6. Payments, Credits, and Refunds",
      bullets: [
        "Prices, taxes, currencies, payment methods, course access rules, credit balances, and subscription details are shown at checkout or in the relevant product interface.",
        "Payments are processed by third-party payment providers. We do not store full payment card numbers.",
        `For paid CommonLab courses, you may request a refund within 14 days of purchase if you have not completed more than 20% of the course content, unless a course page or checkout states a different lawful policy. Send refund requests to ${legalMeta.coursesEmail}.`,
        "API usage, credits, wallet deposits, or consumption-based fees may be non-refundable once consumed, transmitted on-chain, or paid to a third-party provider, unless required by law or stated otherwise.",
      ],
    },
    {
      title: "7. APIs, SDKs, and Developer Access",
      bullets: [
        "You must use APIs, SDKs, CLIs, webhooks, and developer credentials in accordance with documentation, rate limits, security requirements, and these Terms.",
        "You may not share secret keys, bypass usage controls, interfere with service operation, or use automated access in a way that degrades reliability.",
        "You are responsible for applications, tools, agents, and services you build with Agent Commons developer features.",
      ],
    },
    {
      title: "8. Third-Party Services",
      body: [
        "The services may connect to third-party model providers, infrastructure providers, OAuth apps, payment providers, wallets, blockchains, APIs, MCP servers, tools, or educational services. Your use of third-party services is governed by their terms and policies.",
      ],
    },
    {
      title: "9. AI Output and Professional Advice",
      body: [
        "AI-generated outputs may be inaccurate, incomplete, offensive, unsafe, or unsuitable for your use case. You are responsible for evaluating outputs and for any decisions, publications, submissions, code deployments, payments, messages, transactions, or other actions you take based on them.",
        "The services do not provide legal, financial, medical, tax, investment, employment, academic, or other regulated professional advice.",
      ],
    },
    {
      title: "10. User Content and Ownership",
      body: [
        "As between you and Agent Commons, you retain ownership of content you submit, subject to rights held by others.",
        "You grant Agent Commons a worldwide, non-exclusive, royalty-free license to host, process, transmit, reproduce, display, and use your content as necessary to provide, secure, support, and improve the services, comply with law, and enforce these Terms.",
      ],
    },
    {
      title: "11. Intellectual Property",
      body: [
        "The services, software, designs, interfaces, documentation, course materials, trademarks, logos, and other Agent Commons content are owned by Agent Commons or its licensors. Except for rights expressly granted to you, we reserve all rights.",
      ],
    },
    {
      title: "12. Acceptable Use",
      bullets: [
        "Do not violate law, third-party rights, export controls, sanctions, privacy rights, intellectual property rights, or platform policies.",
        "Do not upload, generate, or distribute unlawful, abusive, exploitative, harassing, hateful, deceptive, or malicious content.",
        "Do not attempt unauthorized access, credential theft, prompt injection against other users, security probing without permission, malware deployment, spam, scraping, or service disruption.",
        "Do not use the services to make high-impact decisions about people without appropriate human review, lawful basis, notices, safeguards, and compliance.",
        "Do not misrepresent identity, affiliation, course completion, certification, agent capabilities, or source of outputs.",
      ],
    },
    {
      title: "13. Enforcement and Termination",
      body: [
        "We may review, restrict, suspend, or remove accounts, content, agents, integrations, API access, course access, or transactions where we reasonably believe there is a violation of these Terms, a security risk, legal exposure, abuse, fraud, or harm.",
      ],
    },
    {
      title: "14. Privacy and Security",
      body: [
        "Our Privacy Policy explains how we collect, use, share, and protect personal data. You must use reasonable safeguards for accounts, keys, tokens, wallets, connected services, and exported data.",
      ],
    },
    {
      title: "15. Disclaimers and Liability",
      body: [
        "The services are provided on an as-is and as-available basis. To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, title, non-infringement, uninterrupted operation, accuracy, and error-free performance.",
        "To the fullest extent permitted by law, Agent Commons will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages; lost profits; lost revenue; lost data; business interruption; third-party service failures; AI output errors; or unauthorized actions caused by compromised credentials or integrations.",
        "To the fullest extent permitted by law, our total liability for claims relating to the services will not exceed the greater of the amount you paid to Agent Commons for the relevant service in the three months before the claim or USD $100.",
      ],
    },
    {
      title: "16. Indemnity",
      body: [
        "You will defend and indemnify Agent Commons and its personnel from claims, damages, liabilities, costs, and expenses arising from your content, integrations, applications, agents, workflows, misuse of the services, breach of these Terms, or violation of law or third-party rights.",
      ],
    },
    {
      title: "17. Changes, Law, and Contact",
      body: [
        "We may update these Terms from time to time. If changes are material, we will provide reasonable notice through the services, email, or another appropriate channel.",
        `These Terms are governed by the laws of ${legalMeta.governingLaw}, without regard to conflict-of-law rules. Courts located in ${legalMeta.governingLaw} will have exclusive jurisdiction unless mandatory consumer protection laws require otherwise.`,
        `Questions about these Terms may be sent to ${legalMeta.contactEmail}. Course support and refund requests may be sent to ${legalMeta.coursesEmail}.`,
      ],
    },
  ],
};
