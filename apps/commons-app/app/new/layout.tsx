import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default function NewChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
