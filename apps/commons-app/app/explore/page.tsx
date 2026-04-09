"use client";

import { useEffect, useState } from "react";
import AppBar from "@/components/layout/app-bar";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";

interface Agent {
  agentId: string;
  name: string;
  profileImage?: string;
  persona?: string;
  description?: string;
  modelProvider?: string;
  modelId?: string;
}

interface Tool {
  toolId: string;
  name: string;
  description?: string;
  category?: string;
  visibility?: string;
}

export default function ExplorePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools]   = useState<Tool[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingTools, setLoadingTools]   = useState(true);
  const [agentSearch, setAgentSearch] = useState("");
  const [toolSearch, setToolSearch]   = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
  }, []);

  useEffect(() => {
    fetch("/api/tools?visibility=public")
      .then((r) => r.json())
      .then((d) => setTools(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingTools(false));
  }, []);

  const filteredAgents = agents.filter(
    (a) =>
      !agentSearch ||
      a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      (a.persona ?? "").toLowerCase().includes(agentSearch.toLowerCase()),
  );

  const filteredTools = tools.filter(
    (t) =>
      !toolSearch ||
      t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(toolSearch.toLowerCase()),
  );

  return (
    <div>
      <AppBar />
      <div className="min-h-screen mt-12 px-4 py-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Explore</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discover public agents and tools on Agent Commons
          </p>
        </div>

        <Tabs defaultValue="agents">
          <TabsList className="mb-6">
            <TabsTrigger value="agents">
              Agents {!loadingAgents && `(${agents.length})`}
            </TabsTrigger>
            <TabsTrigger value="tools">
              Tools {!loadingTools && `(${tools.length})`}
            </TabsTrigger>
          </TabsList>

          {/* ── Agents tab ── */}
          <TabsContent value="agents">
            <div className="relative mb-6 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search agents…"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
              />
            </div>

            {loadingAgents ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-24 text-sm text-muted-foreground">
                {agentSearch ? "No agents match your search." : "No public agents yet."}
              </div>
            ) : (
              <AgentsShowcase agents={filteredAgents} />
            )}
          </TabsContent>

          {/* ── Tools tab ── */}
          <TabsContent value="tools">
            <div className="relative mb-6 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search tools…"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
              />
            </div>

            {loadingTools ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="text-center py-24 text-sm text-muted-foreground">
                {toolSearch ? "No tools match your search." : "No public tools yet."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTools.map((tool) => (
                  <Link
                    key={tool.toolId}
                    href={`/tools/${tool.toolId}`}
                    className="rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{tool.name}</span>
                      {tool.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                          {tool.category}
                        </span>
                      )}
                    </div>
                    {tool.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {tool.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
