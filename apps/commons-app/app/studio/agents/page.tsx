import Link from "next/link";
import { MessagesSquare } from "lucide-react";

export default function AgentsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <MessagesSquare className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
      <p className="mt-4 text-sm font-medium">Choose an agent to chat with</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">Your chats, files and settings for each agent live in one place.</p>
      <Link href="/studio/agents/create" className="mt-5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm shadow-card hover:bg-muted">
        Create agent
      </Link>
    </div>
  );
}
