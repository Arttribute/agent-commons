"use client";

import { useState } from "react";

interface TaskContext {
  inputs?: Record<string, any>;
  objective?: string;
  expectedOutputType?: string;
}

interface Task {
  taskId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  progress: number;
  context?: TaskContext;
  summary?: string;
  resultContent?: string;
  planning?: string;
  steps?: string[];
  createdAt: string;
  updatedAt?: string;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      taskId: "task-1",
      title: "Set Up Project Environment",
      description:
        "Initialize a new Next.js project with TypeScript and Tailwind CSS. Set up the project structure and install necessary dependencies including Shadcn for UI components.",
      status: "completed",
      priority: 1,
      progress: 100,
      context: {
        inputs: {
          UI: "Shadcn",
          styling: "Tailwind CSS",
          language: "TypeScript",
          framework: "Next.js",
        },
        objective: "Set up the initial project environment.",
        expectedOutputType: "code",
      },
      planning:
        "I'll create a new Next.js project with TypeScript support, then add Tailwind CSS for styling. After that, I'll install Shadcn UI components and set up the basic project structure.",
      steps: [
        "Create a new Next.js project with TypeScript",
        "Install and configure Tailwind CSS",
        "Add Shadcn UI components",
        "Set up the project structure",
      ],
      summary:
        "Initialized a Next.js project with TypeScript and Tailwind CSS, and installed Shadcn for UI components. The project structure is set up and ready for further development.",
      resultContent:
        '```bash\n# Create a new Next.js project with TypeScript\nnpx create-next-app@latest my-project --typescript\n\n# Navigate into the project directory\ncd my-project\n\n# Install Tailwind CSS\nnpm install -D tailwindcss postcss autoprefixer\nnpx tailwindcss init -p\n\n# Configure Tailwind\n# Add the paths to all of your template files in your tailwind.config.js file\n\n# Install Shadcn for UI components\nnpx shadcn@latest init\n```\n\n```tsx\n// Example component using Shadcn UI\nimport { Button } from "@/components/ui/button";\n\nexport default function Example() {\n  return (\n    <div className="p-4">\n      <Button>Click me</Button>\n    </div>\n  );\n}\n```',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      taskId: "task-2",
      title: "Implement User Authentication",
      description:
        "Develop a user authentication system allowing users to sign up, log in, and log out. Use NextAuth.js for authentication management.",
      status: "completed",
      priority: 2,
      progress: 100,
      context: {
        inputs: {
          authenticationLibrary: "NextAuth.js",
        },
        objective: "Create a secure user authentication system.",
        expectedOutputType: "code",
      },
      planning:
        "I'll implement user authentication using NextAuth.js. This will involve setting up the NextAuth configuration, creating API routes for authentication, and building the UI components for sign-up, login, and logout.",
      steps: [
        "Install NextAuth.js and its dependencies",
        "Configure NextAuth.js with the appropriate providers",
        "Create authentication API routes",
        "Build sign-up and login forms",
        "Implement protected routes",
      ],
      summary:
        "Implemented a complete authentication system using NextAuth.js. Users can now sign up, log in, and log out securely. Protected routes are also implemented to restrict access to authenticated users only.",
      resultContent:
        "```tsx\n// pages/api/auth/[...nextauth].ts\nimport NextAuth from 'next-auth';\nimport Providers from 'next-auth/providers';\n\nexport default NextAuth({\n  providers: [\n    Providers.Credentials({\n      name: 'Credentials',\n      credentials: {\n        email: { label: \"Email\", type: \"email\" },\n        password: { label: \"Password\", type: \"password\" }\n      },\n      async authorize(credentials) {\n        // Add your authentication logic here\n        if (credentials.email === 'user@example.com' && credentials.password === 'password') {\n          return { id: 1, name: 'User', email: 'user@example.com' };\n        }\n        return null;\n      }\n    })\n  ],\n  session: {\n    jwt: true,\n  },\n  callbacks: {\n    async session(session, user) {\n      return session;\n    },\n    async jwt(token, user) {\n      if (user) {\n        token.id = user.id;\n      }\n      return token;\n    }\n  }\n});\n```\n\n```tsx\n// components/login-form.tsx\nimport { useState } from 'react';\nimport { signIn } from 'next-auth/react';\nimport { Button } from '@/components/ui/button';\nimport { Input } from '@/components/ui/input';\n\nexport default function LoginForm() {\n  const [email, setEmail] = useState('');\n  const [password, setPassword] = useState('');\n\n  const handleSubmit = async (e) => {\n    e.preventDefault();\n    await signIn('credentials', { email, password, callbackUrl: '/' });\n  };\n\n  return (\n    <form onSubmit={handleSubmit} className=\"space-y-4\">\n      <div>\n        <Input\n          type=\"email\"\n          placeholder=\"Email\"\n          value={email}\n          onChange={(e) => setEmail(e.target.value)}\n          required\n        />\n      </div>\n      <div>\n        <Input\n          type=\"password\"\n          placeholder=\"Password\"\n          value={password}\n          onChange={(e) => setPassword(e.target.value)}\n          required\n        />\n      </div>\n      <Button type=\"submit\">Sign In</Button>\n    </form>\n  );\n}\n```",
      createdAt: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      taskId: "task-3",
      title: "Develop Core Features",
      description:
        "Create the main functionality of the application based on the user requirements.",
      status: "in_progress",
      priority: 2,
      progress: 60,
      context: {
        objective: "Implement the core features of the application.",
        expectedOutputType: "code",
      },
      planning:
        "I'll implement the core features requested by the user. This will involve creating the necessary components, setting up state management, and implementing the business logic.",
      steps: [
        "Create the main components",
        "Set up state management",
        "Implement business logic",
        "Connect to backend services",
        "Add error handling",
      ],
      createdAt: new Date(Date.now() - 2400000).toISOString(),
    },
  ]);

  return { tasks, setTasks };
}
