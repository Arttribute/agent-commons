'use client';

import { MoreHorizontal } from 'lucide-react';
import { LinksMenu } from 'fumadocs-ui/layouts/docs.client';
import { getLinks } from 'fumadocs-ui/layouts/shared';

/**
 * The off-site links, parked at the bottom-right of the sidebar rather than
 * beside the wordmark — that corner belongs to the collapse control.
 *
 * DocsLayout renders its own copy of this menu whenever it is given `links` or
 * `githubUrl`, so the layout withholds both and passes this through
 * `sidebar.footer` instead.
 */
const LINKS = getLinks(
  [
    { text: 'Web app', url: 'https://www.agentcommons.io', external: true },
    { text: 'Status', url: 'https://api.agentcommons.io/health', external: true },
  ],
  'https://github.com/Arttribute/agent-commons',
);

export function SidebarLinks() {
  return (
    <LinksMenu
      items={LINKS}
      aria-label="More links"
      className="docs-sidebar-links inline-flex items-center justify-center rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground [&_svg]:size-5"
    >
      <MoreHorizontal />
    </LinksMenu>
  );
}
