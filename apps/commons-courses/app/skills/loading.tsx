import { Sparkles } from "lucide-react";
import { LoadingScreen } from "@/components/loading-screen";
import { Nav } from "@/components/nav";

export default function SkillsLoading() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <LoadingScreen
        title="Lining up today’s skill badges"
        subtitle="A few crisp challenges are getting sorted for your next AI fluency run."
        icon={Sparkles}
        tone="lime"
      />
    </div>
  );
}
