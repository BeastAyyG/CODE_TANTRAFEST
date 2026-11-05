import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getProposals } from "@/lib/data";
import { ProposalProvider } from "@/lib/proposal-context";

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
  title: "Pact — A say in the work. Certainty in the pay.",
  description:
    "An employee-governed payroll prototype with one-person-one-vote, stablecoin pay, and a ring-fenced payroll vault.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Kept for the original IntentLock routes, which remain available in-repo.
  const proposals = await getProposals();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <ProposalProvider proposals={proposals}>{children}</ProposalProvider>
      </body>
    </html>
  );
}
