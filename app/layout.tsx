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
//
// colorScheme: "light" tells the browser this page is light-only — without
// it, a device/browser in dark mode (notably iOS Safari and Chrome's
// "auto-dark for websites" on Android) force-styles native form controls,
// including the text color INSIDE <input>/<textarea> elements, overriding
// whatever color Tailwind set on them. Every input in this app already sets
// an explicit light-mode text color, so under that forced-dark styling the
// text renders in a color close to the input's own light background —
// effectively invisible while typing, even though the field itself works.
export const viewport: Viewport = {
  themeColor: "#6D28D9",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  // Without this, opening the on-screen keyboard on Android Chrome leaves
  // the layout viewport (and every `fixed inset-0`/`100vh` full-screen
  // panel — Thread.jsx's chat box, every bottom-input form) at its
  // original height, so the keyboard just overlaps the bottom of the
  // screen instead of the page shrinking to fit above it. The message
  // input then ends up rendered underneath the keyboard: still there,
  // still working, just invisible. "resizes-content" makes the browser
  // actually shrink the layout viewport when the keyboard opens, so a
  // `flex flex-col` full-screen container reflows its `shrink-0` footer
  // back into view instead of getting covered.
  interactiveWidget: "resizes-content",
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
