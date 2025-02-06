// pages/index.jsx
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import AppBar from "@/components/layout/AppBar";
import { cn } from "@/lib/utils";
import { DotPattern } from "@/components/magicui/dot-pattern";

export default function Studio() {
  return (
    <div>
      <AppBar />
      <div className="  mt-16">
        <div className="grid grid-cols-12 px-4">
          <div className="col-span-3">
            <div className="flex bg-white p-4 rounded-lg border h-[88vh]">
              <p>Left Sidebar</p>
            </div>
          </div>
          <div className="col-span-9 relative h-[88vh]">
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
