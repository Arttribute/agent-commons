import { redirect } from "next/navigation";

// Builder quests are paused for now; send old links to the course catalog.
export default function BuildersPage() {
  redirect("/courses");
}
