import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appBaseUrl } from "@/lib/store";

const base = appBaseUrl();

export const metadata: Metadata = {
  // Without this, Next.js falls back to a relative URL for every OG image
  // and canonical link (including on app/store/[slug]'s own generateMetadata,
  // which builds its `url`/`images` fields relative to this) — a link
  // pasted into WhatsApp/Twitter needs an absolute one to render a preview
  // at all, and Google won't credit a relative canonical either.
  metadataBase: base ? new URL(base) : undefined,
  title: { default: "FindIt", template: "%s · FindIt" },
  description:
    "Request-first marketplace connecting buyers to verified sellers, starting in Nigeria.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FindIt" },
  openGraph: {
    type: "website",
    siteName: "FindIt",
    title: "FindIt",
    description:
      "Request-first marketplace connecting buyers to verified sellers, starting in Nigeria.",
  },
  twitter: {
    card: "summary",
    title: "FindIt",
    description:
      "Request-first marketplace connecting buyers to verified sellers, starting in Nigeria.",
  },
};

// Colors the mobile browser's own chrome (address bar / status bar) to
// match the app rather than defaulting to plain white/black around it.
export const viewport: Viewport = {
  themeColor: "#6D28D9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
