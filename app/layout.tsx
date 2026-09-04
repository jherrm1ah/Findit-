import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FindIt Naija",
  description:
    "Request-first marketplace connecting buyers to verified sellers, starting in Nigeria.",
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
