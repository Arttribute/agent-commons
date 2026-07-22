import { EducatorCopilotShell } from "@/components/educator/educator-copilot-shell";

export default function EducatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div id="educator-shell-content">{children}</div>
      <EducatorCopilotShell />
    </>
  );
}
