import ExternalAgentForm from "@/components/agents/ExternalAgentForm";
import AppBar from "@/components/layout/app-bar";

export default function ExternalAgentPage() {
  return (
    <>
      <AppBar />
      <div className="min-h-screen  mt-20">
        <ExternalAgentForm />
      </div>
    </>
  );
}
