import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AgentOutput from "./agent-output";

interface AgentToAgentProps {
  agentId: string;
  message: string;
  response?: any;
  sessionId?: string;
}

export default function AgentToAgent({
  agentId,
  message,
  response,
  sessionId,
}: AgentToAgentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-purple-100 dark:bg-purple-900 p-0.5 rounded">
          <Bot className="h-4 w-4 text-purple-500" />
        </div>
        <Badge variant="outline">Agent {agentId.slice(0, 6)}...</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <div>
          <h4 className="text-sm font-medium">Message:</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>

        {isExpanded && response && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Response:</h4>
              <AgentOutput
                content={
                  typeof response === "string"
                    ? response
                    : JSON.stringify(response, null, 2)
                }
                metadata={response.metadata}
              />
            </div>
          </motion.div>
        )}
      </div>
    </Card>
  );
}
