import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeReferralCode } from "@/lib/referrals";
import { getDb, assertNoError } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

// The referral link's entry point. This is not a page with content of its
// own — it only checks the code is real, then hands off into the SPA at
// /?ref=<code>, the same deep-link style /store/[slug]'s "Message seller"
// button uses for /?messageSeller=. From there, MainApp.jsx's one-shot
// deep-link effect stashes it (via components/findit-app/referral.js) so
// it survives a guest browsing before they eventually sign up — attribution
// doesn't happen here, it happens in lib/auth.ts#createUser at that point.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You've been invited to FindIt",
  robots: { index: false, follow: false },
};

export default async function ReferralLinkPage({ params }: { params: { code: string } }) {
  // Rate-limited the same way /verify/[code] is — the code space is large
  // enough that guessing isn't practical, but a walk of it should still
  // cost something.
  const forwarded = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await checkRateLimit(`ref-link:${forwarded.replace(/:/g, "_").slice(0, 100)}`, 60, 60 * 1000);
  if (!limit.allowed) redirect("/");

  const code = normalizeReferralCode(params.code);
  if (!code) redirect("/");

  const result = await getDb().from("users").select("id").eq("referral_code", code).maybeSingle();
  const row = assertNoError(result, "checking referral code") as { id: string } | null;
  // An unknown code is treated exactly like no code at all — just open the
  // app, don't show an error for something a visitor can't act on anyway.
  if (!row) redirect("/");

  redirect(`/?ref=${code}`);
}
