import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { SidebarCollapseTrigger } from 'fumadocs-ui/layouts/docs/sidebar';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl="https://github.com/Arttribute/agent-commons"
      links={[
        { text: 'Web app', url: 'https://www.agentcommons.io', external: true },
        { text: 'Status', url: 'https://api.agentcommons.io/health', external: true },
      ]}
      nav={{
        // The same wordmark the commons-app dashboard sidebar shows when it is
        // open, at the same height — one brand mark across both surfaces.
        title: (
          <span className="flex items-center gap-2">
            <Image
              src="/logo.jpg"
              alt="Agent Commons"
              width={131}
              height={60}
              priority
              className="h-8 w-auto rounded-md object-contain"
            />
            <span className="rounded-full border border-fd-border px-1.5 py-px font-space text-[10px] font-medium uppercase tracking-widest text-fd-muted-foreground">
              Docs
            </span>
          </span>
        ),
        // Sits beside the wordmark, the way the app puts its collapse control in
        // the sidebar header. The copy in the footer is hidden in globals.css.
        children: (
          <SidebarCollapseTrigger className="docs-sidebar-toggle ms-auto -me-2 text-fd-muted-foreground max-md:hidden" />
        ),
      }}
      sidebar={{ banner: null }}
    >
      {children}
    </DocsLayout>
  );
}
