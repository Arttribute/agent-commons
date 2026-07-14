import { redirect } from "next/navigation";

/** Agent creation moved into the studio. */
export default function LegacyCreateAgentPage() {
  redirect("/studio/agents/create");
}
