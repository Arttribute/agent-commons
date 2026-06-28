import { KeyRound } from "lucide-react";
import { LoadingScreen } from "@/components/loading-screen";

export default function AuthLoading() {
  return (
    <LoadingScreen
      title="Preparing your lab pass"
      subtitle="We’re setting up a clean sign-in handoff so you can get back to building."
      icon={KeyRound}
      tone="amber"
    />
  );
}
