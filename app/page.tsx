import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getUserForToken, SESSION_COOKIE } from "@/lib/auth";
import { listCategories } from "@/lib/categoryCatalog";
import HomeShell from "./HomeShell";

// Real, homepage-specific metadata — otherwise every page (this one
// included) falls back to the root layout's generic title/description.
export const metadata: Metadata = {
  title: "Request anything, buy from verified sellers",
  description:
    "FindIt is a request-first marketplace: tell us what you need and real, verified sellers near you send offers — or browse the catalogue directly. Every order is escrow-protected, released only once you confirm delivery.",
};

// A crawler never carries a session cookie, so this always resolves to the
// real marketing landing page for Google/social previews — the exact
// content this page exists to serve. A signed-in visitor (session cookie
// present, checked server-side so there's no logged-out flash before the
// app takes over) skips straight to the app, same as it always has.
export default async function Page() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const [user, categories] = await Promise.all([
    getUserForToken(token),
    listCategories().catch(() => []),
  ]);

  return <HomeShell hasSession={Boolean(user)} categories={categories} />;
}
