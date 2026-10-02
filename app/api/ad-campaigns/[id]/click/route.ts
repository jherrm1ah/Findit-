import { NextRequest, NextResponse } from "next/server";
import { recordAdCampaignClick } from "@/lib/adCampaigns";
import { checkRateLimit } from "@/lib/rateLimit";

// Public, no auth — any buyer (including a guest) can tap a Sponsored
// slide. Rate-limited by IP rather than by user for that reason; a real
// click burst from one visitor genuinely re-tapping is rare and harmless,
// this only exists to stop a script hammering the counter. Fire-and-forget
// from the client (Home.jsx) — never blocks the actual navigation a tap
// triggers, and a failed/late click here is lost telemetry, not a user-
// facing error, hence the flat `{ ok: true }` regardless of outcome.
const MAX_CLICKS_PER_WINDOW = 60;
const WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = await checkRateLimit(`ad-campaign-click:${ip}`, MAX_CLICKS_PER_WINDOW, WINDOW_MS);
  if (allowed) {
    try {
      await recordAdCampaignClick(params.id);
    } catch {
      // Best-effort — see module comment.
    }
  }
  return NextResponse.json({ ok: true });
}
