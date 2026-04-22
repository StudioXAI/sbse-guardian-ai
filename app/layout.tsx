import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SbSe Guardian — Multichain Smart Contract Intelligence",
  description:
    "Don't audit code. Ask the agent. Institutional-grade smart-contract analysis across Ethereum, BSC, Polygon, Base, Arbitrum, and Avalanche.",
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
  themeColor: "#0a0807",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${fraunces.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
