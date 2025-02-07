"use client";
import { useParams } from "next/navigation";
import type { NextPage } from "next";
import { useMemo } from "react";
import AppBar from "@/components/layout/AppBar";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import ToolList from "@/components/tools/ToolsList";
import { DashboardBar } from "@/components/layout/DashboardBar";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { cn } from "@/lib/utils";

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

/** Main dynamic page component */
const StudioPage: NextPage = () => {
  // e.g., /studio/agents => tab === 'agents'
  // e.g., /studio/tasks => tab === 'tasks'
  const { tab } = useParams();

  // Fallback to 'agents' if tab is undefined or not a string
  const activeTab = typeof tab === "string" ? tab : "agents";

  // Decide which component(s) to show based on activeTab
  const mainContent = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return (
          <div className="p-4">
            <h2 className="text-xl font-semibold">Tools</h2>
            <p className="text-gray-500 text-sm mb-2">
              Here you can view and manage tools.
            </p>
            <ToolList
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

      case "profile":
        return <Profile />;

      case "balances":
        return <Balances />;

      case "agents":
      default:
        // Also render your ToolList if desired, plus your Agents
        return (
          <div className="p-4">
            <h2 className="text-xl font-semibold">My Agents</h2>
            <p className="text-gray-500 text-sm mb-2">Manage your agents.</p>
            <AgentsShowcase />
          </div>
        );
    }
  }, [activeTab]);

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

        {/* Pattern in the background */}
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
