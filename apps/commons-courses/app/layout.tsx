import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  fallback: ["Inter", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "CommonLab - AI agent courses and learning sandboxes",
  description:
    "CommonLab helps educators teach practical AI literacy with structured courses, guided agent labs, and safe sandboxes for learners.",
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
      </body>
    </html>
  );
}
