import { LoadingScreen } from "@/components/loading-screen";
import { Nav } from "@/components/nav";

export default function SkillPathLoading() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <LoadingScreen
        title="Opening skill path"
        subtitle="Checking your latest progress."
      />
    </div>
  );
}
