import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppKitProvider from "@/components/AppKitProvider";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SbSe Guardian — Smart Contract Intelligence",
  description:
    "AI-powered security analysis for any token across 35+ EVM chains. Plain-English verdicts in seconds.",
  applicationName: "SbSe Guardian",
  authors: [{ name: "SbSe Protocol" }],
  keywords: [
    "smart contract audit",
    "rug pull detection",
    "token security",
    "defi security",
    "honeypot detection",
    "multichain",
  ],
  openGraph: {
    title: "SbSe Guardian",
    description: "Smart Contract Intelligence for DeFi.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppKitProvider>{children}</AppKitProvider>
      </body>
    </html>
  );
}
