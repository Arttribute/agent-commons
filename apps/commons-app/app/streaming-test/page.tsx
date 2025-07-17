import { SpaceStreamingTest } from "@/components/spaces/SpaceStreamingTest";
import { SpacesProvider } from "@/context/SpacesContext";

export default function StreamingTestPage() {
  return (
    <SpacesProvider>
      <div className="min-h-screen bg-gray-100 py-8">
        <SpaceStreamingTest />
      </div>
    </SpacesProvider>
  );
}
