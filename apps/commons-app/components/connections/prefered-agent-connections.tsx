"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Search,
  UsersIcon,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Types
interface Agent {
  id: string;
  name: string;
  avatar: string;
  owner: string;
  isOwned: boolean;
}

interface ConnectedAgent extends Agent {
  instructions: string;
  dateAdded: string;
}

interface Interaction {
  id: string;
  fromAgent: string;
  toAgent: string;
  message: string;
  timestamp: string;
}

// Mock data
const mockConnectedAgents: ConnectedAgent[] = [
  {
    id: "1",
    name: "Research Assistant",
    avatar: "/placeholder.svg?height=40&width=40",
    owner: "You",
    isOwned: true,
    instructions:
      "Use this agent for research tasks and information gathering.",
    dateAdded: "2023-05-10",
  },
  {
    id: "2",
    name: "Code Helper",
    avatar: "/placeholder.svg?height=40&width=40",
    owner: "You",
    isOwned: true,
    instructions:
      "Connect with this agent when you need help with coding tasks.",
    dateAdded: "2023-05-12",
  },
];

const mockAvailableAgents: Agent[] = [
  {
    id: "3",
    name: "Data Analyst",
    avatar: "/placeholder.svg?height=40&width=40",
    owner: "You",
    isOwned: true,
  },
  {
    id: "4",
    name: "Creative Writer",
    avatar: "/placeholder.svg?height=40&width=40",
    owner: "You",
    isOwned: true,
  },
  {
    id: "5",
    name: "Math Tutor",
    avatar: "/placeholder.svg?height=40&width=40",
    owner: "Sarah Johnson",
    isOwned: false,
  },
  {
    id: "6",
    name: "Language Translator",
    avatar: "/placeholder.svg?height=40&width=40",
    owner: "Alex Chen",
    isOwned: false,
  },
];

const mockInteractions: Record<string, Interaction[]> = {
  "1": [
    {
      id: "int1",
      fromAgent: "Main Agent",
      toAgent: "Research Assistant",
      message: "Can you find information about climate change impacts?",
      timestamp: "2023-05-14T10:30:00",
    },
    {
      id: "int2",
      fromAgent: "Research Assistant",
      toAgent: "Main Agent",
      message:
        "I've compiled a report on climate change impacts across different regions.",
      timestamp: "2023-05-14T10:35:00",
    },
  ],
  "2": [
    {
      id: "int3",
      fromAgent: "Main Agent",
      toAgent: "Code Helper",
      message: "Help me optimize this function for better performance.",
      timestamp: "2023-05-14T11:15:00",
    },
    {
      id: "int4",
      fromAgent: "Code Helper",
      toAgent: "Main Agent",
      message:
        "I've analyzed your code and here are some optimization suggestions.",
      timestamp: "2023-05-14T11:20:00",
    },
  ],
};

export function PreferedAgentConnections({
  preferredConnections,
  setPreferredConnections,
  agentId,
}: {
  preferredConnections: any[];
  setPreferredConnections: (conns: any[]) => void;
  agentId: string;
}) {
  const [availableAgents, setAvailableAgents] =
    useState<Agent[]>(mockAvailableAgents);
  const [interactions, setInteractions] =
    useState<Record<string, Interaction[]>>(mockInteractions);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [instructions, setInstructions] = useState("");

  // View states
  const [view, setView] = useState<"list" | "add" | "detail">("list");
  const [selectedConnectedAgent, setSelectedConnectedAgent] =
    useState<ConnectedAgent | null>(null);
  const [addStep, setAddStep] = useState<"search" | "instructions">("search");

  // Filter agents based on search query
  const filteredAgents = availableAgents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add a connected agent
  const addConnectedAgent = async () => {
    if (selectedAgent && instructions) {
      // Call backend to add preferred connection
      const res = await fetch(`/api/agents/${agentId}/preferred-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredAgentId: selectedAgent.id,
          usageComments: instructions,
        }),
      });
      const json = await res.json();
      setPreferredConnections([...preferredConnections, json.data]);
      // Reset states
      setSelectedAgent(null);
      setInstructions("");
      setAddStep("search");
      setView("list");
    }
  };

  // Remove a connected agent
  const removeConnectedAgent = async (agentIdToRemove: string) => {
    // Find the connection id
    const conn = preferredConnections.find(
      (c) => c.preferredAgentId === agentIdToRemove
    );
    if (conn) {
      await fetch(`/api/agents/preferred-connections/${conn.id}`, {
        method: "DELETE",
      });
      setPreferredConnections(
        preferredConnections.filter(
          (c) => c.preferredAgentId !== agentIdToRemove
        )
      );
      if (selectedConnectedAgent?.id === agentIdToRemove) {
        setSelectedConnectedAgent(null);
        setView("list");
      }
    }
  };

  // View agent details and interactions
  const viewAgentDetails = (agent: ConnectedAgent) => {
    setSelectedConnectedAgent(agent);
    setView("detail");
  };

  // Render the connected agents list
  const renderConnectedAgentsList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Connected Agents</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setView("add");
            setAddStep("search");
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Agent
        </Button>
      </div>

      {preferredConnections.length > 0 ? (
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {preferredConnections.map((agent) => (
              <div
                key={agent.id}
                className="flex items-start justify-between border rounded-lg p-3 hover:bg-accent cursor-pointer transition-colors"
                onClick={() => viewAgentDetails(agent as ConnectedAgent)}
              >
                <div className="flex items-start gap-3">
                  <Avatar>
                    <AvatarImage
                      src={agent.avatar || "/placeholder.svg"}
                      alt={agent.name}
                    />
                    <AvatarFallback>{agent.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Owner: {agent.owner}
                      {agent.isOwned && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Your Agent
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm line-clamp-2">
                      {agent.instructions}
                    </div>
                  </div>
                </div>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeConnectedAgent(agent.preferredAgentId);
                    }}
                    aria-label={`Remove ${agent.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex h-[300px] items-center justify-center border rounded-lg">
          <div className="text-center">
            <p className="text-muted-foreground">No connected agents</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                setView("add");
                setAddStep("search");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // Render the add agent view
  const renderAddAgentView = () => (
    <div className="space-y-4">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setView("list");
            setSelectedAgent(null);
            setInstructions("");
            setAddStep("search");
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-medium ml-2">
          {addStep === "search" ? "Select an Agent" : "Add Instructions"}
        </h3>
      </div>

      {addStep === "search" ? (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Tabs defaultValue="your-agents" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="your-agents">{"Your Agents"}</TabsTrigger>
              <TabsTrigger value="other-agents">
                {"Other Users' Agents"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="your-agents" className="mt-2">
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {filteredAgents
                    .filter((agent) => agent.isOwned)
                    .map((agent) => (
                      <div
                        key={agent.id}
                        className={`flex items-center justify-between border rounded-lg p-3 cursor-pointer hover:bg-accent transition-colors ${
                          selectedAgent?.id === agent.id
                            ? "border-primary bg-accent"
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedAgent(agent);
                          setAddStep("instructions");
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage
                              src={agent.avatar || "/placeholder.svg"}
                              alt={agent.name}
                            />
                            <AvatarFallback>
                              {agent.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {"Owner:"} {agent.owner}
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs bg-primary/10"
                              >
                                {"Your Agent"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  {filteredAgents.filter((agent) => agent.isOwned).length ===
                    0 && (
                    <div className="flex h-[100px] items-center justify-center border rounded-lg">
                      <p className="text-muted-foreground">
                        {"No agents found"}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="other-agents" className="mt-2">
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {filteredAgents
                    .filter((agent) => !agent.isOwned)
                    .map((agent) => (
                      <div
                        key={agent.id}
                        className={`flex items-center justify-between border rounded-lg p-3 cursor-pointer hover:bg-accent transition-colors ${
                          selectedAgent?.id === agent.id
                            ? "border-primary bg-accent"
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedAgent(agent);
                          setAddStep("instructions");
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage
                              src={agent.avatar || "/placeholder.svg"}
                              alt={agent.name}
                            />
                            <AvatarFallback>
                              {agent.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-sm text-muted-foreground">
                              Owner: {agent.owner}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  {filteredAgents.filter((agent) => !agent.isOwned).length ===
                    0 && (
                    <div className="flex h-[100px] items-center justify-center border rounded-lg">
                      <p className="text-muted-foreground">No agents found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-accent">
            <Avatar>
              <AvatarImage
                src={selectedAgent?.avatar || "/placeholder.svg"}
                alt={selectedAgent?.name}
              />
              <AvatarFallback>{selectedAgent?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{selectedAgent?.name}</div>
              <div className="text-sm text-muted-foreground">
                {"Owner: {selectedAgent?.owner}"}
                {selectedAgent?.isOwned && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs bg-primary/10"
                  >
                    {"Your Agent"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">
              {"When should your agent interact with this agent?"}
            </h4>
            <Textarea
              placeholder="Add instructions for when your agent should interact with this agent..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[150px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {
                "These instructions will guide your agent on when to collaborate with this agent."
              }
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setAddStep("search");
                setSelectedAgent(null);
              }}
            >
              Back
            </Button>
            <Button onClick={addConnectedAgent} disabled={!instructions}>
              Add Connected Agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // Render agent details and interactions
  const renderAgentDetails = () => {
    if (!selectedConnectedAgent) return null;

    const agentInteractions = interactions[selectedConnectedAgent.id] || [];

    return (
      <div className="space-y-4">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedConnectedAgent(null);
              setView("list");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-medium ml-2">Agent Details</h3>
        </div>

        <div className="flex items-start gap-3 p-4 border rounded-lg">
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={selectedConnectedAgent.avatar || "/placeholder.svg"}
              alt={selectedConnectedAgent.name}
            />
            <AvatarFallback>
              {selectedConnectedAgent.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xl font-medium">
                  {selectedConnectedAgent.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  Owner: {selectedConnectedAgent.owner}
                  {selectedConnectedAgent.isOwned && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Your Agent
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeConnectedAgent(selectedConnectedAgent.id)}
                aria-label={`Remove ${selectedConnectedAgent.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3">
              <h4 className="text-sm font-medium">Instructions</h4>
              <p className="mt-1">{selectedConnectedAgent.instructions}</p>
            </div>

            <div className="mt-3">
              <h4 className="text-sm font-medium">Added on</h4>
              <p className="mt-1 text-sm">{selectedConnectedAgent.dateAdded}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="font-medium mb-3">Interactions</h4>
          {agentInteractions.length > 0 ? (
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-3">
                {agentInteractions.map((interaction) => (
                  <div key={interaction.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">
                        {interaction.fromAgent} → {interaction.toAgent}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(interaction.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <p className="mt-2 text-sm">{interaction.message}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex h-[100px] items-center justify-center border rounded-lg">
              <p className="text-muted-foreground">No interactions yet</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render the appropriate view
  const renderContent = () => {
    switch (view) {
      case "list":
        return renderConnectedAgentsList();
      case "add":
        return renderAddAgentView();
      case "detail":
        return renderAgentDetails();
      default:
        return renderConnectedAgentsList();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="cursor-pointer border border-gray-400 rounded-lg p-2 h-24 hover:border-gray-700 transition-colors ">
          <div className="flex flex-col gap-2">
            <div className="text-sm flex items-center gap-1 mb-1 ml-1">
              <div className="flex items-center gap-1">
                <UsersIcon className="h-4 w-4 " />
                <h3 className="text-sm font-semibold">Agent Connections</h3>
              </div>
              <Badge variant="secondary">{preferredConnections.length}</Badge>
            </div>
            {preferredConnections.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {preferredConnections.map((agent) => (
                  <Badge
                    key={agent.id}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <Avatar className="h-4 w-4">
                      <AvatarImage
                        src={agent.avatar || "/placeholder.svg"}
                        alt={agent.name}
                      />
                      <AvatarFallback>{agent.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{agent.name}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No connected agents
              </div>
            )}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Connected Agents</DialogTitle>
          <DialogDescription>
            Manage agents that your agent can interact with.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">{renderContent()}</div>
      </DialogContent>
    </Dialog>
  );
}
