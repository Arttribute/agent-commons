// app/studio/[tab]/page.tsx
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
import { CommonAgent } from "@/types/agent";
import { Loader2 } from "lucide-react";

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

const ToolsArea: React.FC = () => (
  <div className="p-4">
    <h2 className="text-xl font-semibold">Tools</h2>
    <p className="text-gray-500 text-sm mb-2">
      Here you can view and manage tools.
    </p>
    <ToolsList
      tools={[
        {
          name: "Agent",
          description: "Manage your agents",
          calls: 0,
        },
        {
          name: "Tool",
          description: "Manage your tools",
          calls: 0,
        },
        {
          name: "Knowledge Base",
          description: "Manage knowledge entries",
          calls: 0,
        },
        {
          name: "Marketplace",
          description: "Buy/sell agents and tools",
          calls: 0,
        },
        {
          name: "Settings",
          description: "Manage account settings",
          calls: 0,
        },
      ]}
    />
  </div>
);

// Our main dynamic page component
const StudioPage: NextPage = () => {
  const { tab } = useParams() as { tab: string };
  const [loafingAgents, setLoafingAgents] = useState(true);

  const [agents, setAgents] = useState<CommonAgent[]>([]);
  const activeTab = tab || "agents";

  // If user is in the "agents" tab, fetch from Nest
  useEffect(() => {
    async function fetchAgents() {
      setLoafingAgents(true);
      if (activeTab === "agents") {
        try {
          // Could also call /api/agents if you made that GET route
          // We'll call the Nest server directly for demonstration:
          const res = await fetch(
            "/api/agents",
            { cache: "no-store" } // or "no-cache"
          );
          const data = await res.json();
          setAgents(data.data);
        } catch (err) {
          console.error("Error fetching agents:", err);
        }
      }
      setLoafingAgents(false);
    }
    fetchAgents();
  }, [activeTab]);

  // Decide which component(s) to show based on activeTab
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
          <p className="text-gray-500 text-sm mb-2">Manage your agents.</p>
          {/* Pass the fetched agent data to AgentsShowcase */}
          {loafingAgents ? (
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
