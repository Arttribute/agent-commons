import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import Image from 'next/image';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <div className="flex items-center gap-2">
            <Image
              src="/ac-icon.svg"
              alt="Agent Commons"
              width={22}
              height={22}
            />
            <span
              style={{ fontFamily: 'var(--font-space-mono), monospace' }}
              className="font-bold text-sm"
            >
              Agent Commons
            </span>
          </div>
        ),
      }}
      sidebar={{
        banner: null,
      }}
    >
      {children}
    </DocsLayout>
  );
}
