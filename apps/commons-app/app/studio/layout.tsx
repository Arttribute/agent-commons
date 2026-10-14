import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
