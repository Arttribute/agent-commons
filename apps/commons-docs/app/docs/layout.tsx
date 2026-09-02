import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { source } from '@/lib/source';
import { SidebarFooter } from '@/components/sidebar-footer';

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
        title: (
          <span className="flex items-center gap-2">
            <Image src="/ac-icon.svg" alt="" width={22} height={22} />
            <span className="font-space text-sm font-bold tracking-tight">
              Agent Commons
            </span>
            <span className="hidden rounded-full border border-fd-border px-1.5 py-px font-space text-[10px] font-medium uppercase tracking-widest text-fd-muted-foreground sm:inline">
              Docs
            </span>
          </span>
        ),
      }}
      sidebar={{ banner: null, footer: <SidebarFooter /> }}
    >
      {children}
    </DocsLayout>
  );
}
