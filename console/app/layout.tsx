import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "Aegis IntentLock — Decision Trail",
    template: "%s · Aegis IntentLock",
  },
  description:
    "Voting transparency isn't informed consent. IntentLock binds the vote to the exact action, and makes the evidence, conflicts and execution verifiable.",
  applicationName: "Aegis IntentLock",
};

export const viewport: Viewport = {
  themeColor: "#f2efe7",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
