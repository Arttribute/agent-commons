import { redirect } from "next/navigation";

/** Tool creation now happens via the dialog on /studio/tools. */
export default function LegacyCreateToolPage() {
  redirect("/studio/tools");
}
