"use client";

import { useParams } from "next/navigation";
import type { NextPage } from "next";
import { useEffect, useMemo, useState } from "react";
import AppBar from "@/components/layout/app-bar";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import ToolsList from "@/components/tools/ToolsList";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase"; // Import Supabase client
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// Removed legacy Profile/Balances sections per new layout

const ToolsArea: React.FC = () => {
  const [tools, setTools] = useState<any[]>([]);
  const { authState } = useAuth();
  const { walletAddress } = authState;

  const userAddress = walletAddress?.toLowerCase();

  useEffect(() => {
    async function fetchTools() {
      try {
        const { data, error } = await supabase
          .from("tool")
          .select("*")
          .eq("owner", userAddress);
        if (error) throw error;
        setTools(data || []);
      } catch (err) {
        console.error("Error fetching tools:", err);
      }
    }
    fetchTools();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold">Tools</h2>
      <p className="text-gray-500 text-sm mb-2">
        Here you can view and manage tools.
      </p>
      <ToolsList tools={tools} />
    </div>
  );
};

const StudioPage: NextPage = () => {
  const { tab } = useParams() as { tab: string };
  const router = useRouter();
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const [agents, setAgents] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const activeTab = (tab as string) || "agents";

  const userAddress = walletAddress?.toLowerCase();

  useEffect(() => {
    async function fetchAgents() {
      if (!userAddress) {
        setAgents([]);
        return;
      }
      setLoadingAgents(true);

      if (activeTab === "agents") {
        try {
          console.log("Fetching agents for user:", userAddress);
          const { data, error } = await supabase
            .from("agent") // Table name is "agent"
            .select("agent_id, name, owner, persona, avatar, instructions")
            .eq("owner", userAddress);

          if (error) throw error;
          console.log("Fetched agents:", data);
          //setting agentId to agent_id for compatibility with the frontend - could be potentially be slower than doing it in the query
          setAgents(
            data.map((agent) => ({ ...agent, agentId: agent.agent_id }))
          );
        } catch (err) {
          console.error("Error fetching agents:", err);
        }
      }
      setLoadingAgents(false);
    }

    fetchAgents();
  }, [activeTab, userAddress]);

  const mainContent = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return <ToolsArea />;
      case "tasks":
        return (
          <div className="p-4">
            <h2 className="text-xl font-semibold">Tasks</h2>
            <p className="text-gray-500 text-sm mb-2">Manage your tasks</p>
            <div className="text-sm text-muted-foreground">Coming soon.</div>
          </div>
        );
      case "workflows":
        return (
          <div className="p-4">
            <h2 className="text-xl font-semibold">Workflows</h2>
            <p className="text-gray-500 text-sm mb-2">Manage your workflows</p>
            <div className="text-sm text-muted-foreground">Coming soon.</div>
          </div>
        );
      case "agents":
      default:
        return (
          <div className="p-4">
            <h2 className="text-xl font-semibold">My Agents</h2>
            <p className="text-gray-500 text-sm mb-2">Manage your agents</p>
            <div className="h-[64vh]">
              {loadingAgents ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <AgentsShowcase agents={agents} />
              )}
            </div>
          </div>
        );
    }
  }, [activeTab, loadingAgents, agents]);

  const createRoute = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return { href: "/tools/create", label: "Create Tool" };
      case "tasks":
        return { href: "/tasks/create", label: "Create Task" };
      case "workflows":
        return { href: "/workflows/create", label: "Create Workflow" };
      case "agents":
      default:
        return { href: "/agents/create", label: "Create Agent" };
    }
  }, [activeTab]);

  return (
    <div>
      {/* Top navbar */}
      <AppBar />

      {/* Main layout */}
      <div className="mt-12">
        <div className="flex bg-slate-50">
          <DashboardSideBar username={userAddress || ""} />

          <div className="w-full relative h-[88vh] p-3">
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="">
                <div className="bg-teal-200 w-20 h-8 -mb-8 rounded-lg"></div>
                <h2 className="text-2xl font-semibold"> Studio</h2>
              </div>

              <Tabs
                value={activeTab || "agents"}
                onValueChange={(v) => router.push(`/studio/${v}`)}
                className="border border-gray-400 rounded-md bg-gray-200"
              >
                <TabsList>
                  <TabsTrigger value="agents">Agents</TabsTrigger>
                  <TabsTrigger value="tools">Tools</TabsTrigger>
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="workflows">Workflows</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                size="sm"
                variant="outline"
                className="border border-gray-800 font-semibold px-6"
                onClick={() => router.push(createRoute.href)}
              >
                {createRoute.label}
              </Button>
            </div>

            <div className="mt-2">{mainContent}</div>
          </div>
        </div>

        {/* Pattern in the background (for styling, optional) */}
      </div>
    </div>
  );
};

export default StudioPage;
