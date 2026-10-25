import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getProposals } from "@/lib/data";
import { ProposalProvider } from "@/lib/proposal-context";
import { Shell } from "@/components/shell/Shell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AegisDAO IntentLock Console",
  description:
    "Security-ops console for verifiable governance execution: decision trail, red-team arena, COI graph, voting and scorecard.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const proposals = await getProposals();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <ProposalProvider proposals={proposals}>
          <Shell>{children}</Shell>
        </ProposalProvider>
      </body>
    </html>
  );
}
