import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getAppBaseUrl } from "@/lib/app-url";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  fallback: ["Inter", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "CommonLab - AI agent courses",
    template: "%s | CommonLab",
  },
  description:
    "CommonLab helps educators teach practical AI literacy with structured courses, guided agent labs, and safe sandboxes for learners.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "CommonLab - AI agent courses",
    description:
      "Practical AI literacy courses with guided agent labs and safe learning environments.",
    siteName: "CommonLab",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CommonLab - AI agent courses",
    description:
      "Practical AI literacy courses with guided agent labs and safe learning environments.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`}>
      <body className={`${spaceGrotesk.className} min-h-full flex flex-col`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
