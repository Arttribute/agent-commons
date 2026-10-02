import { redirect } from "next/navigation";

/** The canvas lives in the Library now. */
export default function CanvasPage() {
  redirect("/library");
}
