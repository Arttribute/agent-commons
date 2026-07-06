import { EducatorCopilotShell } from "@/components/educator/educator-copilot-shell";

export default function EducatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <EducatorCopilotShell />
    </>
  );
}
