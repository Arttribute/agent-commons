import { ArrowUp, Code, Loader2 } from "lucide-react";
import AgentToAgent from "./agent-to-agent";
import { Agent } from "http";
import CodeBlock from "./code-block";
export default function AgentOutput() {
  return (
    <div className="flex  justify-start">
      <div className="rounded-xl my-2 ">
        <p className="text-sm">
          Some AI message content goes here. This is a placeholder for the
          actual user message. You can replace this with the actual content that
          you want to display. This is a simple example of how to create a.
        </p>
        <AgentToAgent />
        <div className="m-1">
          <CodeBlock
            code={`const agent = new Agent({
  name: "Agent",
  description: "This is a test agent",
  tools: [
    {
      name: "Tool",
      description: "This is a test tool",
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "The input to the tool",
          },
        },
        required: ["input"],
      },
    },
  ],
  memory: {
    type: "memory",
    memoryKey: "memory",  
    memoryDescription: "This is a test memory",
    memoryParameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "The input to the memory",
        },
      },
      required: ["input"],
    },
  },`}
          />
        </div>
      </div>
    </div>
  );
}
