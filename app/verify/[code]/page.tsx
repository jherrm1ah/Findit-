import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicVerification, normalizeTransactionCode } from "@/lib/transactionRecord";
import { checkRateLimit } from "@/lib/rateLimit";

// The public verification page. Anyone holding the code can confirm that a
// FindIt transaction really happened, and what became of it.
//
// What makes this safe is not authentication, which there deliberately is
// none of, but lib/transactionRecord.ts#getPublicVerification: it selects
// named columns and builds an explicit object. The buyer does not appear in
// it at all, and neither does the amount, the order reference or any internal
// id. A column added to the records table later cannot leak in here.
export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  new: "New seller at the time",
  verified: "Verified seller at the time",
  trusted: "Trusted seller at the time",
};

const EVENT_LABEL: Record<string, string> = {
  completed: "Transaction completed",
  dispute_opened: "A problem was reported",
  dispute_resolved: "Problem reviewed and resolved",
  refunded: "Subsequently refunded",
  admin_correction: "Reviewed by FindIt",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const verification = await getPublicVerification(params.code);
  if (!verification) {
    return { title: "Transaction not found · FindIt", robots: { index: false, follow: false } };
  }
  return {
    title: `${verification.code} · FindIt Verified Transaction`,
    description: `A completed FindIt transaction for ${verification.itemName} with ${verification.sellerName}.`,
    // A verification link is meant to be checked by whoever receives it, not
    // indexed and enumerated by a crawler.
    robots: { index: false, follow: false },
  };
}

export default async function VerifyPage({ params }: { params: { code: string } }) {
  // Rate-limited by source, not because the code is guessable (about 1.1e12
  // possibilities), but so that a determined attempt to walk the space costs
  // something rather than nothing. The limiter is shared across instances
  // since migration 022, so this is a real ceiling rather than a per-instance
  // one.
  const forwarded = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await checkRateLimit(`verify:${forwarded.replace(/:/g, "_").slice(0, 100)}`, 60, 60 * 1000);
  if (!limit.allowed) {
    return (
      <main className="min-h-screen bg-[#FAFAFF] flex items-center justify-center px-6">
        <p className="text-[13px] text-[#6B6483] text-center max-w-xs">
          Too many verification checks from this connection. Try again in a moment.
        </p>
      </main>
    );
  }

  const verification = await getPublicVerification(params.code);
  // A malformed code and an unknown one answer identically.
  if (!verification) notFound();

  const refunded = verification.status === "refunded";
  const disputed = verification.status === "disputed";
  const clean = !refunded && !disputed;
  const normalized = normalizeTransactionCode(params.code) ?? verification.code;

  return (
    <main className="min-h-screen bg-[#FAFAFF] px-5 py-10">
      <div className="max-w-md mx-auto">
        <p className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#7C3AED] mb-5">
          FindIt Verified Transaction
        </p>

        <div
          className={`rounded-2xl px-5 py-4 mb-6 border ${
            clean ? "bg-[#E8F5ED] border-[#BFE3CC]" : "bg-[#FBF0E2] border-[#EFD6AE]"
          }`}
        >
          <p className={`text-[15px] font-bold ${clean ? "text-[#15803D]" : "text-[#B45309]"}`}>
            {clean ? "✓ Verified" : refunded ? "⚠ Completed, then refunded" : "⚠ Under review"}
          </p>
          <p className="text-[12px] text-[#514B67] mt-1 leading-relaxed">
            {clean
              ? "This transaction was completed on FindIt and confirmed by the buyer."
              : refunded
                ? "This transaction completed, and was refunded afterwards. It is not a clean sale."
                : "A problem has been reported on this transaction and it is being reviewed."}
          </p>
        </div>

        <dl className="bg-white border border-[#ECE9F7] rounded-2xl divide-y divide-[#ECE9F7] mb-6">
          {[
            ["Transaction ID", normalized],
            ["Item", verification.itemName],
            ["Seller", verification.sellerName],
            ["Completed", formatDate(verification.completedAt)],
            ["Seller verification", LEVEL_LABEL[verification.sellerVerificationLevel] ?? "New seller at the time"],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <dt className="text-[10.5px] uppercase tracking-wide text-[#8A8372] mb-0.5">{label}</dt>
              <dd className="text-[13.5px] text-[#1E1B4B] font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>

        {verification.timeline.length > 1 && (
          <section className="mb-6">
            <h2 className="text-[10.5px] uppercase tracking-wide text-[#8A8372] mb-2">History</h2>
            <ol className="bg-white border border-[#ECE9F7] rounded-2xl divide-y divide-[#ECE9F7] list-none p-0 m-0">
              {verification.timeline.map((event, i) => (
                <li key={`${event.eventType}-${i}`} className="px-4 py-2.5 flex justify-between gap-3">
                  <span className="text-[12.5px] text-[#1E1B4B]">
                    {EVENT_LABEL[event.eventType] ?? event.eventType}
                  </span>
                  <span className="text-[11px] text-[#8A8372] whitespace-nowrap">{formatDate(event.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="text-[11.5px] text-[#6B6483] leading-relaxed mb-6">
          This record was created by FindIt when the buyer confirmed delivery. It shows what was true at that
          moment and is not editable. Buyer details and the amount paid are deliberately not published.
        </p>

        <Link
          href="/"
          className="inline-block text-[12.5px] font-semibold text-white px-4 py-2 rounded-full"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          Open FindIt
        </Link>
      </div>
    </main>
  );
}
