"use client";

import { useParams } from "next/navigation";
import type { NextPage } from "next";
import { useEffect, useState } from "react";
import AppBar from "@/components/layout/AppBar";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import ToolsList from "@/components/tools/ToolsList";
import { DashboardBar } from "@/components/layout/DashboardBar";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase"; // Import Supabase client

const Profile: React.FC = () => (
  <div className="p-4">
    <h2 className="text-xl font-semibold">Profile</h2>
    <p>Here you can manage your user profile.</p>
  </div>
);

const Balances: React.FC = () => (
  <div className="p-4">
    <h2 className="text-xl font-semibold">Balances</h2>
    <p>Here you can view your balances or payment methods.</p>
  </div>
);

const ToolsArea: React.FC = () => {
  const [tools, setTools] = useState<any[]>([]);

  useEffect(() => {
    async function fetchTools() {
      try {
        const { data, error } = await supabase.from("tools").select("*");
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
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const [agents, setAgents] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const activeTab = tab || "agents";

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

  let mainContent;
  switch (activeTab) {
    case "tools":
      mainContent = <ToolsArea />;
      break;
    case "profile":
      mainContent = <Profile />;
      break;
    case "balances":
      mainContent = <Balances />;
      break;
    case "agents":
    default:
      mainContent = (
        <div className="p-4">
          <h2 className="text-xl font-semibold">My Agents</h2>
          <p className="text-gray-500 text-sm mb-2">Manage your agents</p>
          {loadingAgents ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <AgentsShowcase agents={agents} />
          )}
        </div>
      );
      break;
  }

  return (
    <div>
      {/* Top navbar */}
      <AppBar />

      {/* Main layout */}
      <div className="mt-16">
        <div className="grid grid-cols-12 px-4 gap-4">
          {/* Left Sidebar */}
          <div className="col-span-3">
            <div className="flex bg-white p-4 rounded-lg border h-[88vh]">
              <DashboardBar activeTab={activeTab} />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="col-span-9 relative h-[88vh]">{mainContent}</div>
        </div>

        {/* Pattern in the background (for styling, optional) */}
        <DotPattern
          className={cn(
            "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
          )}
        />
      </div>
    </div>
  );
};

export default StudioPage;
