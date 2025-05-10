import { ArrowUp, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import InitiatorMessage from "./initiator-message";
import AgentOutput from "./agent-output";
import { AgentTitleCard } from "@/components/agents/agent-title-card";
import CodeBlock from "./code-block";

export default function AgentToAgent() {
  return (
    <div className="border p-1 rounded-2xl bg-white my-2 mx-1">
      <AgentTitleCard />
      <ScrollArea className="h-72 overflow-y-auto p-3" scrollHideDelay={100}>
        <div className="flex rounded-xl justify-end">
          <div className="rounded-xl bg-teal-100 my-3 ml-4 ">
            <p className="text-sm">
              Some user message content goes here.This is a placeholder for the
              actual user message. You can replace this with the actual content
              that you want to display. This is a simple example of how to
              create a.
            </p>
          </div>
        </div>
        <div className="flex  justify-start">
          <div className="rounded-xl bg-50 my-2 ">
            <p className="text-sm">
              Some AI message content goes here. This is a placeholder for the
              actual user message. You can replace this with the actual content
              that you want to display. This is a simple example of how to
              create a. Some AI message content goes here. This is a placeholder
              for the actual user message. You can replace this with the actual
              content that you want to display. This is a simple example of how
              to create a. Some AI message content goes here. This is a
              placeholder for the actual user message. You can replace this with
              the actual content that you want to display. This is a simple
              example of how to create a.
            </p>
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
      </ScrollArea>
    </div>
  );
}
