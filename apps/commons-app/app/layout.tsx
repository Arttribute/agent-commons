import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/Providers"; // The file with your <PrivyProvider> from earlier
import { AuthProvider } from "@/context/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import { Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/context/SidebarContext";
import { GlobalSearchProvider } from "@/context/SearchContext";
import { FloatingCommonsCopilot } from "@/components/copilot/floating-commons-copilot";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import { getAppBaseUrl } from "@/lib/app-url";

const spaceGrotesk = Space_Grotesk({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  fallback: ["Helvetica", "Arial", "sans-serif"],
  variable: "--font-space-grotesk",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "Create, deploy, and manage AI agents — and whole teams of them. Agent computers, workflows, integrations, and every major model, in one place.";

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
    title: "Agent Commons — build, deploy, and orchestrate AI agents",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commons — build, deploy, and orchestrate AI agents",
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Seed the client provider from the signed server cookie. Authenticated UI is
  // now correct on the first render instead of waiting for /api/auth/session.
  const serverSession = await auth();
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
        <Providers session={session}>
          <AuthProvider>
            <SidebarProvider>
              <GlobalSearchProvider>
                <div id="app-shell-content" className="h-full min-w-0">
                  {children}
                </div>
                <FloatingCommonsCopilot />
                <Toaster />
              </GlobalSearchProvider>
            </SidebarProvider>
          </AuthProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
