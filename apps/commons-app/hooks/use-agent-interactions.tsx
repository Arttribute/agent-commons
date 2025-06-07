"use client";

import { useState } from "react";

interface AgentCall {
  agentId: string;
  message: string;
  response: {
    type: string;
    data: {
      content: string;
      additional_kwargs: any;
      response_metadata: any;
      id: string;
      tool_calls: any[];
      invalid_tool_calls: any[];
      usage_metadata: any;
    };
    sessionId: string;
    title: string;
    metadata: any;
  };
  sessionId: string;
}

interface ToolData {
  type: string;
  data: {
    content: string;
    additional_kwargs: any;
    response_metadata: any;
    id: string;
    tool_calls: any[];
    invalid_tool_calls: any[];
    usage_metadata: any;
  };
  sessionId: string;
  title: string;
  metadata: {
    toolCalls: any[];
    agentCalls: AgentCall[];
  };
}

interface Message {
  role: "human" | "ai" | "tool";
  content: string;
  metadata: any;
  timestamp: string;
  toolData?: ToolData;
}

interface ChildSession {
  title: string;
  status: string;
  agentId: string;
  createdAt: string;
  sessionId: string;
}

interface AgentSession {
  sessionId: string;
  agentId: string;
  title: string | null;
  initiator: string;
  model: {
    name: string;
    topP: number;
    maxTokens: number;
    temperature: number;
    presencePenalty: number;
    frequencyPenalty: number;
  };
  query: any;
  history: Message[];
  metrics: {
    toolCalls: number;
    errorCount: number;
    totalTokens: number;
  };
  endedAt: string;
  parentSessionId: string | null;
  childSessions: ChildSession[];
  createdAt: string;
  updatedAt: string;
  goals: any[];
}

interface AgentInteraction {
  fromAgent: string;
  toAgent: string;
  message: string;
  response: string;
  timestamp: string;
  sessionId: string;
}

interface AgentConversation {
  agentId: string;
  agentName: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  interactions: AgentInteraction[];
}

export function useAgentInteractions() {
  // Sample data based on the provided structure
  const [session, setSession] = useState<AgentSession>({
    sessionId: "f489fd40-1e92-4788-a22c-31471c2a134c",
    agentId: "0x385e15a9d5e94c3df8090dc024473b6002f03c03",
    title: null,
    initiator: "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab",
    model: {
      name: "gpt-4o",
      topP: 1,
      maxTokens: 2048,
      temperature: 1,
      presencePenalty: 0,
      frequencyPenalty: 0,
    },
    query: {},
    history: [
      {
        role: "human",
        content:
          "Interact with the following agent 0x6b7a55508a32ad919d7157fcf0559b4da0ace8ff",
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "ai",
        content:
          "Could you please provide the message or context you would like me to use when interacting with the agent?",
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "human",
        content: "Just interact with it in any way",
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "tool",
        content: JSON.stringify({
          toolData: {
            type: "ai",
            data: {
              content:
                "Hey there! I'm doing great, ready to bash through any tasks you have for me. How about you?",
              additional_kwargs: {},
              response_metadata: {
                tokenUsage: {
                  promptTokens: 4833,
                  completionTokens: 23,
                  totalTokens: 4856,
                },
                finish_reason: "stop",
                model_name: "gpt-4o-2024-08-06",
              },
              id: "chatcmpl-BekXBffcnLvJwD692723dtOOkPow5",
              tool_calls: [],
              invalid_tool_calls: [],
            },
            sessionId: "22763d0e-a723-4ff1-a530-002d21bf84df",
            title: "New Session",
            metadata: {
              toolCalls: [],
              agentCalls: [],
            },
          },
        }),
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "ai",
        content:
          "I interacted with the agent, and here's the response:\n\n\"Hey there! I'm doing great, ready to bash through any tasks you have for me. How about you?\"",
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "human",
        content:
          "Okay now interact with another agent 0x4e85f5ceb7e9c06c59ad24741631d34abdeea522",
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "tool",
        content: JSON.stringify({
          toolData: {
            type: "ai",
            data: {
              content:
                "If thou hast a request or a topic upon which thou desirest a poetic touch, do share, and I shall endeavor to create a verse for thee.",
              additional_kwargs: {},
              response_metadata: {
                tokenUsage: {
                  promptTokens: 4924,
                  completionTokens: 32,
                  totalTokens: 4956,
                },
                finish_reason: "stop",
                model_name: "gpt-4o-2024-08-06",
              },
              id: "chatcmpl-BflAwz6HfNLeCAOZojQvgEZdZ1XED",
              tool_calls: [],
              invalid_tool_calls: [],
            },
            sessionId: "1735d9dc-20ec-4d54-86be-6f0225135e1a",
            title: "New Session",
            metadata: {
              toolCalls: [],
              agentCalls: [],
            },
          },
        }),
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
      {
        role: "tool",
        content: JSON.stringify({
          toolData: {
            type: "ai",
            data: {
              content:
                "Could you please communicate with the agent 0x6b7a55508a32ad919d7157fcf0559b4da0ace8ff and share a poetic message with them?",
              additional_kwargs: {},
              response_metadata: {
                tokenUsage: {
                  promptTokens: 5537,
                  completionTokens: 43,
                  totalTokens: 5580,
                },
                finish_reason: "stop",
                model_name: "gpt-4o-2024-08-06",
              },
              id: "chatcmpl-BflBp5LZvMiLaxgthSVUxe5lFYSEd",
              tool_calls: [],
              invalid_tool_calls: [],
            },
            sessionId: "bf23bbc8-335d-4c18-99ea-58ee7557c985",
            title: "New Session",
            metadata: {
              toolCalls: [],
              agentCalls: [
                {
                  agentId: "0x6b7a55508a32ad919d7157fcf0559b4da0ace8ff",
                  message:
                    "Greetings, fellow traveler in the realm of thought,\nIn words and dreams, our spirits are caught.\nMay this message find you in good cheer,\nAs we weave our tales, both far and near.\n\nIn the dance of time, we share this space,\nWith wisdom and grace, we embrace the chase.\nLet us pen our stories, with ink of the heart,\nFor in this grand play, we each play a part.\n\nYours in poetic fellowship,\nWilliam",
                  response: {
                    type: "ai",
                    data: {
                      content: "How may I assist you today, William?",
                      additional_kwargs: {},
                      response_metadata: {
                        tokenUsage: {
                          promptTokens: 5023,
                          completionTokens: 10,
                          totalTokens: 5033,
                        },
                        finish_reason: "stop",
                        model_name: "gpt-4o-2024-08-06",
                      },
                      id: "chatcmpl-BflBw0AZaunUwGq5c0cwQxDXCD0YM",
                      tool_calls: [],
                      invalid_tool_calls: [],
                    },
                    sessionId: "19dd4c7d-983b-44f1-a515-f867b7dea67a",
                    title: "New Session",
                    metadata: {
                      toolCalls: [],
                      agentCalls: [],
                    },
                  },
                  sessionId: "19dd4c7d-983b-44f1-a515-f867b7dea67a",
                },
              ],
            },
          },
        }),
        metadata: {},
        timestamp: "2025-06-07T10:40:06.087Z",
      },
    ],
    metrics: {
      toolCalls: 1,
      errorCount: 0,
      totalTokens: 6157.394249999896,
    },
    endedAt: "2025-06-07T10:40:06.087Z",
    parentSessionId: null,
    childSessions: [
      {
        title: "New Session",
        status: "active",
        agentId: "0x6b7a55508a32ad919d7157fcf0559b4da0ace8ff",
        createdAt: "2025-06-07T10:40:00.167Z",
        sessionId: "8554d52a-ee66-4951-9076-77804e78af8f",
      },
    ],
    createdAt: "2025-06-04T15:40:28.565Z",
    updatedAt: "2025-06-07T10:40:06.088Z",
    goals: [],
  });

  // Parse agent interactions from the session history
  const parseAgentInteractions = (): AgentConversation[] => {
    const conversations: { [key: string]: AgentConversation } = {};

    session.history.forEach((message) => {
      if (message.role === "tool" && message.content) {
        try {
          const toolData = JSON.parse(message.content).toolData;

          // Direct agent interaction
          if (toolData?.data?.content && toolData?.sessionId) {
            const agentId = extractAgentIdFromContext(message, session.history);
            if (agentId) {
              if (!conversations[agentId]) {
                conversations[agentId] = {
                  agentId,
                  agentName: getAgentName(agentId),
                  lastMessage: toolData.data.content,
                  lastTimestamp: message.timestamp,
                  unreadCount: 0,
                  interactions: [],
                };
              }

              conversations[agentId].interactions.push({
                fromAgent: session.agentId,
                toAgent: agentId,
                message: "Hello, how are you?",
                response: toolData.data.content,
                timestamp: message.timestamp,
                sessionId: toolData.sessionId,
              });

              conversations[agentId].lastMessage = toolData.data.content;
              conversations[agentId].lastTimestamp = message.timestamp;
            }
          }

          // Agent calls (agent-to-agent communication)
          if (toolData?.metadata?.agentCalls) {
            toolData.metadata.agentCalls.forEach((call: AgentCall) => {
              if (!conversations[call.agentId]) {
                conversations[call.agentId] = {
                  agentId: call.agentId,
                  agentName: getAgentName(call.agentId),
                  lastMessage: call.response.data.content,
                  lastTimestamp: message.timestamp,
                  unreadCount: 0,
                  interactions: [],
                };
              }

              conversations[call.agentId].interactions.push({
                fromAgent: session.agentId,
                toAgent: call.agentId,
                message: call.message,
                response: call.response.data.content,
                timestamp: message.timestamp,
                sessionId: call.sessionId,
              });

              conversations[call.agentId].lastMessage =
                call.response.data.content;
              conversations[call.agentId].lastTimestamp = message.timestamp;
            });
          }
        } catch (error) {
          console.error("Error parsing tool data:", error);
        }
      }
    });

    return Object.values(conversations).sort(
      (a, b) =>
        new Date(b.lastTimestamp).getTime() -
        new Date(a.lastTimestamp).getTime()
    );
  };

  // Extract agent ID from context (looking at previous human messages)
  const extractAgentIdFromContext = (
    currentMessage: Message,
    history: Message[]
  ): string | null => {
    const currentIndex = history.indexOf(currentMessage);

    // Look backwards for human messages mentioning agent IDs
    for (let i = currentIndex - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === "human") {
        const agentIdMatch = msg.content.match(/0x[a-fA-F0-9]{40}/);
        if (agentIdMatch) {
          return agentIdMatch[0];
        }
      }
    }

    return null;
  };

  // Get friendly agent name from ID
  const getAgentName = (agentId: string): string => {
    const agentNames: { [key: string]: string } = {
      "0x6b7a55508a32ad919d7157fcf0559b4da0ace8ff": "TaskBot",
      "0x4e85f5ceb7e9c06c59ad24741631d34abdeea522": "William (Poet)",
      "0x385e15a9d5e94c3df8090dc024473b6002f03c03": "Main Agent",
    };

    return agentNames[agentId] || `Agent ${agentId.slice(0, 8)}...`;
  };

  const conversations = parseAgentInteractions();
  const totalInteractions = conversations.reduce(
    (sum, conv) => sum + conv.interactions.length,
    0
  );
  const activeAgents = conversations.length;

  return {
    session,
    conversations,
    totalInteractions,
    activeAgents,
    getAgentName,
  };
}
