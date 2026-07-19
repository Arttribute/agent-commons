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

export const metadata: Metadata = {
  title: "Agent Commons",
  description:
    "Create, deploy, and manage AI agents and whole teams of them. Agent computers, workflows, integrations, and every major model in one place.",
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
