// pages/index.jsx
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import AppBar from "@/components/layout/AppBar";

export default function Studio() {
  return (
    <div>
      <AppBar />
      <AgentsShowcase />
    </div>
  );
}
