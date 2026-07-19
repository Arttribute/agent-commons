import { redirect } from "next/navigation";

/** Retain old bookmarks without maintaining a second agent-list page. */
export default function LegacyAgentsPage() {
  redirect("/studio/agents");
}
