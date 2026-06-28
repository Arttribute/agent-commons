import { Route } from "lucide-react";
import { LoadingScreen } from "@/components/loading-screen";
import { Nav } from "@/components/nav";

export default function SkillPathLoading() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <LoadingScreen
        title="Opening your skill path"
        subtitle="Your challenge deck is ready. We’re just checking your latest progress."
        icon={Route}
        tone="sky"
      />
    </div>
  );
}
