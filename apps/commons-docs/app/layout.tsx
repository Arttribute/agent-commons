import './globals.css';
import { Space_Mono } from 'next/font/google';
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
    'Documentation for Agent Commons — the open platform for building, deploying, and connecting AI agents.',
  openGraph: {
    siteName: 'Agent Commons Docs',
    url: 'https://docs.agentcommons.io',
  },
};

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body style={{ fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif' }}>
        <RootProvider theme={{ defaultTheme: 'light', enableSystem: false }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
