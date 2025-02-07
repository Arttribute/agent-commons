// pages/index.jsx
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import AppBar from "@/components/layout/AppBar";
import { cn } from "@/lib/utils";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { DashboardBar } from "@/components/layout/DashboardBar";
import ToolList from "@/components/tools/ToolsList";

export default function Studio() {
  return (
    <div>
      <AppBar />
      <div className="  mt-16">
        <div className="grid grid-cols-12 px-4 gap-4">
          <div className="col-span-3">
            <div className="flex bg-white p-4 rounded-lg border h-[88vh]">
              <DashboardBar />
            </div>
          </div>
          <div className="col-span-9 relative h-[88vh]">
            <ToolList
              tools={[
                {
                  name: "Agent",
                  description: "Create and manage your agents",
                  icon: "Bot",
                  href: "/studio/agents",
                },
                {
                  name: "Tool",
                  description: "Create and manage your tools",
                  icon: "Wrench",
                  href: "/studio/tools",
                },
                {
                  name: "Knowledge Base",
                  description: "Create and manage your knowledge base",
                  icon: "Book",
                  href: "/studio/knowledgebase",
                },
                {
                  name: "Marketplace",
                  description: "Buy and sell agents and tools",
                  icon: "ShoppingCart",
                  href: "/studio/marketplace",
                },
                {
                  name: "Settings",
                  description: "Manage your account settings",
                  icon: "Settings",
                  href: "/studio/settings",
                },
              ]}
            />
            <AgentsShowcase />
          </div>
        </div>
        <DotPattern
          className={cn(
            "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
          )}
        />
      </div>
    </div>
  );
}
