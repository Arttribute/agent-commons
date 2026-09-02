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
        // The same wordmark the commons-app dashboard sidebar shows when it is
        // open, at the same height — one brand mark across both surfaces.
        title: (
          <Image
            src="/logo.jpg"
            alt="Agent Commons"
            width={131}
            height={60}
            priority
            className="h-8 w-auto rounded-md object-contain"
          />
        ),
      }}
      sidebar={{ banner: null, footer: <SidebarFooter /> }}
    >
      {children}
    </DocsLayout>
  );
}
