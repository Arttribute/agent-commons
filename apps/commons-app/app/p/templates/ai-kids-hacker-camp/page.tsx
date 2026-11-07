import type { Metadata } from "next";
import CampPage from "@/components/project-pages/camp/camp-page";
export const metadata: Metadata = {
  title: { absolute: "AI Kids Hacker Camp · 9–11 December 2026" },
  description:
    "Comics, filmmaking, games and simple apps. Ages 7–13. Three mornings at NODE NBO, Gigiri, Nairobi. KSh 5,000.",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain">
      <CampPage />
    </div>
  );
}
