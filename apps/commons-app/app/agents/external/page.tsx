import ExternalAgentForm from "@/components/agents/ExternalAgentForm";
import AppBar from "@/components/layout/app-bar";

export default function ExternalAgentPage() {
  return (
    <div className="h-screen overflow-hidden">
      <AppBar />
      <div className="h-[calc(100vh-80px)] mt-20 overflow-y-auto">
        <ExternalAgentForm />
      </div>
    </div>
  );
}
