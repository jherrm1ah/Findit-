import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appBaseUrl } from "@/lib/store";

// `new URL(...)` throws on anything that isn't a fully-formed absolute URL
// (e.g. APP_URL set to "shopwithfindit.com" instead of
// "https://shopwithfindit.com" — an easy env-var typo). This runs in the
// ROOT layout, so an uncaught throw here doesn't just break metadata, it
// crashes every single page on the site. Never let a malformed env var do
// that — fall back to no metadataBase (Next.js then just uses relative
// URLs, exactly like before this was added) instead of blanking the app.
function safeMetadataBase(): URL | undefined {
  const base = appBaseUrl();
  if (!base) return undefined;
  try {
    return new URL(base);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  // Without this, Next.js falls back to a relative URL for every OG image
  // and canonical link (including on app/store/[slug]'s own generateMetadata,
  // which builds its `url`/`images` fields relative to this) — a link
  // pasted into WhatsApp/Twitter needs an absolute one to render a preview
  // at all, and Google won't credit a relative canonical either.
  metadataBase: safeMetadataBase(),
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
