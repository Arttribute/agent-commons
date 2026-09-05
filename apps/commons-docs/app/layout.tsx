import './globals.css';
import { Space_Grotesk } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { RootProvider } from 'fumadocs-ui/provider';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://docs.agentcommons.io'),
  title: {
    template: '%s | Agent Commons Docs',
    default: 'Agent Commons Docs',
  },
  description:
    'Documentation for Agent Commons — the open platform for building, running, and connecting AI agents.',
  openGraph: {
    siteName: 'Agent Commons Docs',
    url: 'https://docs.agentcommons.io',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <RootProvider theme={{ defaultTheme: 'light', enableSystem: true }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
