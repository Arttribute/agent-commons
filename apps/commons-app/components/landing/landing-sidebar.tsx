import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  LibraryBig,
  MoreHorizontal,
  Search,
  Wrench,
  Workflow,
} from "lucide-react";
import { ClipboardClock } from "@/components/icons/clipboard-clock";

const NAV_ITEMS = [
  { label: "Agents", icon: Bot, target: "/studio/agents" },
  { label: "Tools", icon: Wrench, target: "/studio/tools" },
  { label: "Scheduled tasks", icon: ClipboardClock, target: "/studio/tasks" },
  { label: "Workflows", icon: Workflow, target: "/studio/workflows" },
  { label: "Library", icon: LibraryBig, target: "/library" },
];

const signInTo = (target: string) =>
  `/login?callbackUrl=${encodeURIComponent(target)}`;

/**
 * The signed-out mirror of the studio's DashboardSideBar: same chrome, same
 * rhythm, but entirely static, with no session fetch and no client state, so the
 * landing page paints in one pass. Every row is a real link into the app that
 * routes through sign-in and lands on the section it names.
 */
export function LandingSidebar() {
  return (
    <aside className="hidden h-screen w-[290px] min-w-[290px] flex-col border-r border-border bg-white md:flex">
      <div className="px-3 pt-4">
        <div className="mb-3 flex h-8 items-center px-1">
          <Link href="/" className="flex items-center" aria-label="Agent Commons">
            <Image
              src="/logo.jpg"
              alt="Agent Commons"
              width={131}
              height={60}
              priority
              className="h-8 w-auto rounded-md object-contain"
            />
          </Link>
        </div>

        <div className="flex flex-col gap-1">
          <Link
            href={signInTo("/studio/agents")}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-left">Search</span>
          </Link>

          {NAV_ITEMS.map(({ label, icon: Icon, target }) => (
            <Link
              key={label}
              href={signInTo(target)}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            </Link>
          ))}

          <Link
            href={signInTo("/logs")}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-left">More</span>
          </Link>
        </div>
      </div>

      <div className="flex-1" />

      <div className="mt-auto border-t border-border p-2">
        <Link
          href={signInTo("/studio/agents")}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          Sign in
        </Link>
      </div>
    </aside>
  );
}
