import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FindIt Naija",
  description:
    "Request-first marketplace connecting buyers to verified sellers, starting in Nigeria.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FindIt" },
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
