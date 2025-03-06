import ExternalAgentForm from "@/components/agents/ExternalAgentForm";
import AppBar from "@/components/layout/AppBar";

export default function ExternalAgentPage() {
  return (
    <>
      <AppBar />
      <div className="min-h-screen  mt-16">
        <ExternalAgentForm />
      </div>
    </>
  );
}
