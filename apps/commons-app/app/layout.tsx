import { CommonsAppWindows } from "@/components/plugins/app-windows";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/Providers";
import { AuthProvider } from "@/context/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/context/SidebarContext";
import { GlobalSearchProvider } from "@/context/SearchContext";
import { FloatingCommonsCopilot } from "@/components/copilot/floating-commons-copilot";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { cookies } from "next/headers";
import { DesktopApprovalBridge } from "@/components/desktop/approval-widgets";
import { WorkspaceModeProvider } from "@/context/WorkspaceModeContext";
import { AgentProvider } from "@/context/AgentContext";

const spaceGrotesk = localFont({
  src: "../fonts/SpaceGrotesk-variable.ttf",
  weight: "400 700",
  display: "swap",
  fallback: ["Helvetica", "Arial", "sans-serif"],
  variable: "--font-space-grotesk",
});

const geistMono = localFont({
  src: "../fonts/GeistMono-variable.ttf",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-mono",
});

const SITE_DESCRIPTION =
  "One space for your agents and knowledge. Organize projects, chat with agents that cite your sources, and keep work in the cloud or on your computer.";

// The /og image is served `immutable` for a year, so its URL must change when
// the image does — otherwise social crawlers keep the previously scraped copy
// forever. Tie the version to the deploy (commit SHA) so every deploy yields a
// fresh URL that busts crawler/CDN caches.
const OG_VERSION = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_COMMIT_SHA ||
  "dev"
).slice(0, 8);
const OG_IMAGE_URL = `/og?v=${OG_VERSION}`;

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "Agent Commons",
    template: "%s · Agent Commons",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Agent Commons",
  openGraph: {
    type: "website",
    siteName: "Agent Commons",
    url: getAppBaseUrl(),
    title: "Agent Commons: one space for your agents and knowledge",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Agent Commons: one space for your agents and knowledge",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commons: one space for your agents and knowledge",
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Seed the client provider from the signed server cookie. Authenticated UI is
  // now correct on the first render instead of waiting for /api/auth/session.
  const localMode = process.env.COMMONS_DESKTOP_SERVER === "1" &&
    (await cookies()).get("commons-desktop-mode")?.value === "private-local";
  const serverSession = localMode ? null : await auth();
  const session: Session | null = serverSession?.user
    ? {
        expires: serverSession.expires,
        authSessionVersion: serverSession.authSessionVersion,
        user: {
          id: serverSession.user.id,
          workspaceId: serverSession.user.workspaceId,
          name: serverSession.user.name,
          email: serverSession.user.email,
          image: serverSession.user.image,
        },
      }
    : null;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.className} ${spaceGrotesk.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        <WorkspaceModeProvider initialMode={localMode ? "private-local" : "cloud"}>
        <Providers session={session}>
          <AuthProvider>
            <SidebarProvider>
              <GlobalSearchProvider>
                <AgentProvider>
                <div id="app-shell-content" className="h-full min-w-0">
                  {children}
                </div>
                </AgentProvider>
                <FloatingCommonsCopilot />
                <CommonsAppWindows />
                <DesktopApprovalBridge />
                <Toaster />
              </GlobalSearchProvider>
            </SidebarProvider>
          </AuthProvider>
        </Providers>
        </WorkspaceModeProvider>
        <Analytics />
      </body>
    </html>
  );
}
