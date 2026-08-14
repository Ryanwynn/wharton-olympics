import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { getOptionalUser } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

// Open-source stand-ins for Wharton's licensed Acumin / Minion Pro (§12.2),
// self-hosted by next/font — no runtime request to Google, good on field wifi.
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "600", "700"],
});
const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Wharton Student Olympics",
  description:
    "Live schedule and scoreboard for the Wharton Student Olympics. Register for events, follow the standings, cheer your cluster.",
  robots: { index: false }, // student-org internal event; not for indexing
};

export const viewport: Viewport = {
  themeColor: "#011F5B",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader user={user ? { displayName: user.displayName, isAdmin: user.isAdmin, isScorekeeper: user.isScorekeeper } : null} />
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 sm:px-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
