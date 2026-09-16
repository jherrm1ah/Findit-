import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MessageCircle, ShieldCheck, BadgeCheck } from "lucide-react";
import { getPublicStoreBySlug, appBaseUrl } from "@/lib/store";
import { listCategories } from "@/lib/categoryCatalog";
import StoreListings from "./StoreListings";

// The dedicated public storefront. This is the first real server-rendered
// route in FindIt — everything else is the client app behind "/" — and it is
// server-rendered specifically so that a shared link has a title, a
// description and an Open Graph image when it is pasted into WhatsApp, which
// a client-only screen cannot provide.
//
// Nothing here is authenticated. What keeps that safe is lib/store.ts, which
// returns the same explicitly-built public object the seller profile uses:
// bank details, admin notes, verification evidence and phone numbers are
// never read, so they cannot be rendered or leak into metadata.
export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  new: "New seller",
  verified: "Verified seller",
  trusted: "Trusted seller",
};

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const result = await getPublicStoreBySlug(params.slug);
  if (result.status !== "ok") {
    return { title: "Store not found · FindIt", robots: { index: false, follow: false } };
  }

  const { profile } = result.store;
  // Built only from fields already published on the page itself.
  const description =
    profile.description?.trim() ||
    [
      LEVEL_LABEL[profile.verificationLevel],
      profile.category,
      profile.location,
      `${profile.listings.length} listing${profile.listings.length === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ");

  const base = appBaseUrl();
  const url = base ? `${base}/store/${result.store.canonicalSlug}` : undefined;
  const image = profile.bannerUrl || profile.logoUrl || undefined;

  return {
    title: `${profile.name} · FindIt`,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      type: "website",
      siteName: "FindIt",
      title: profile.name,
      description,
      url,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: profile.name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  // Run alongside the store lookup rather than after it — this server
  // component can call the same category catalog the admin dashboard edits
  // directly, so the search/filter UI below shows a seller's real category
  // labels ("Phone & Tech") instead of the raw internal key ("phonetech").
  const [result, categories] = await Promise.all([getPublicStoreBySlug(params.slug), listCategories()]);
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.label]));

  // An unknown or retired-and-reassigned slug, a suspended seller, or a
  // rejected one. All answer identically: a buyer has no business learning
  // which of those it was.
  if (result.status === "not_found") notFound();

  // Distinct from not_found on purpose. The store exists and its slug stays
  // reserved; the plan that publishes it has lapsed or been downgraded. The
  // seller's data is untouched and the page reopens on its own when they
  // upgrade again.
  if (result.status === "unavailable") {
    return (
      <main className="min-h-screen bg-[#FAFAFF] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-[15px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>
            This store isn&rsquo;t open right now
          </p>
          <p className="text-[13px] text-[#6B6483] mb-6 leading-relaxed">
            The seller&rsquo;s store plan isn&rsquo;t active, so their storefront is closed. Their listings may
            still be on FindIt.
          </p>
          <Link
            href="/"
            className="inline-block text-[13px] font-semibold text-white px-5 py-2.5 rounded-full"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            Browse FindIt
          </Link>
        </div>
      </main>
    );
  }

  const { store } = result;
  const { profile } = store;
  const base = appBaseUrl();

  // Structured data for rich results — a seller's own name/rating/products in
  // a Google Search card instead of a plain blue link. Built only from
  // fields already public on this page (see the module comment above on why
  // that boundary matters); aggregateRating is omitted entirely rather than
  // faked when there are no reviews yet, since Google's own guidelines
  // disallow a rating with no real review count behind it.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: profile.name,
    description: profile.description || undefined,
    image: profile.logoUrl || profile.bannerUrl || undefined,
    url: base ? `${base}/store/${store.canonicalSlug}` : undefined,
    address: profile.location ? { "@type": "PostalAddress", addressLocality: profile.location } : undefined,
    ...(profile.reviewCount > 0 && profile.rating != null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: profile.rating,
            reviewCount: profile.reviewCount,
          },
        }
      : {}),
  };

  return (
    <main className="min-h-screen bg-[#FAFAFF] pb-16">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON.stringify of our
        // own server-built object above, not user HTML; this is the
        // standard Next.js pattern for embedding JSON-LD.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {profile.bannerUrl ? (
        <div className="relative h-36 sm:h-48 w-full overflow-hidden bg-[#EDE9FB]">
          <Image src={profile.bannerUrl} alt="" fill sizes="100vw" priority className="object-cover" />
        </div>
      ) : (
        <div className="h-24 w-full" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }} />
      )}

      <div className="max-w-3xl mx-auto px-5">
        <header className={`flex items-start justify-between gap-4 flex-wrap ${profile.bannerUrl ? "-mt-10" : "-mt-8"} mb-5`}>
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="relative w-20 h-20 rounded-2xl shrink-0 overflow-hidden border-4 border-[#FAFAFF] flex items-center justify-center text-white text-[26px] font-bold"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              {profile.logoUrl ? (
                <Image src={profile.logoUrl} alt="" fill sizes="80px" className="object-cover" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>

            <div className="min-w-0 pt-11">
              <h1
                className="text-[22px] font-bold text-[#1E1B4B] leading-tight flex items-center gap-2 flex-wrap"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {profile.name}
                {profile.proBadge && (
                  <span
                    className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
                    style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                  >
                    PRO
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* Goes through the SPA's session check, same as the "Open FindIt"
              link below — a signed-out buyer lands on Login first (App.jsx
              never renders MainApp without a session) and the param survives
              that detour, so it still opens the thread once they're in. */}
          <Link
            href={`/?messageSeller=${encodeURIComponent(profile.name)}&messageSellerId=${encodeURIComponent(profile.id)}`}
            className="mt-11 shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-full"
            style={{ background: "#1E1B4B" }}
          >
            <MessageCircle size={14} /> Message seller
          </Link>
        </header>

        <div className="flex items-center gap-2 flex-wrap mb-4 text-[11.5px]">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F1ECFD] text-[#7C3AED] font-semibold">
            {(profile.verificationLevel === "verified" || profile.verificationLevel === "trusted") && (
              <BadgeCheck size={12} />
            )}
            {LEVEL_LABEL[profile.verificationLevel] ?? "New seller"}
          </span>
          {profile.category && (
            <span className="px-2.5 py-1 rounded-full bg-white border border-[#ECE9F7] text-[#514B67]">
              {profile.category}
            </span>
          )}
          {profile.location && (
            <span className="px-2.5 py-1 rounded-full bg-white border border-[#ECE9F7] text-[#514B67]">
              {profile.location}
            </span>
          )}
          {profile.rating !== null && (
            <span className="px-2.5 py-1 rounded-full bg-white border border-[#ECE9F7] text-[#514B67]">
              {"★"} {profile.rating} ({profile.reviewCount})
            </span>
          )}
        </div>

        {profile.description && (
          <p className="text-[13.5px] text-[#514B67] leading-relaxed mb-5 max-w-prose">{profile.description}</p>
        )}

        <dl className="flex gap-6 mb-7 text-[12px] text-[#6B6483]">
          <div>
            <dt className="sr-only">Completed orders</dt>
            <dd>
              <b className="text-[#1E1B4B]">{profile.completedOrderCount}</b> completed order
              {profile.completedOrderCount === 1 ? "" : "s"}
            </dd>
          </div>
          {profile.memberSince && (
            <div>
              <dt className="sr-only">On FindIt since</dt>
              <dd>
                On FindIt since{" "}
                <b className="text-[#1E1B4B]">
                  {new Date(profile.memberSince).toLocaleDateString("en-NG", { month: "short", year: "numeric" })}
                </b>
              </dd>
            </div>
          )}
        </dl>

        {/* Same escrow promise ProductDetail.jsx gives a buyer inside the app
            — repeated here because a store link is often someone's very
            first touch with FindIt, before they've seen that reassurance
            anywhere else. */}
        <div className="flex items-center gap-2.5 bg-[#F1ECFD] rounded-2xl px-4 py-3 mb-7">
          <ShieldCheck size={16} className="text-[#7C3AED] shrink-0" />
          <p className="text-[12px] text-[#4C1D95] leading-snug">
            Every order here is protected by FindIt — your payment is held and only released to{" "}
            {profile.name} once you confirm delivery.
          </p>
        </div>

        <StoreListings listings={profile.listings} categoryLabels={categoryLabels} />

        {profile.reviews.length > 0 && (
          <div className="mt-8">
            <h2 className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Reviews</h2>
            <div className="space-y-3 max-w-prose">
              {profile.reviews.map((r) => (
                <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span aria-label={`${r.rating} out of 5 stars`}>
                      <span className="text-[#F59E0B]">{"★".repeat(r.rating)}</span>
                      <span className="text-[#E4DFF5]">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="text-[11px] text-[#8A8372]">
                      {new Date(r.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {r.comment && <p className="text-[13px] text-[#514B67] leading-relaxed">{r.comment}</p>}
                  {r.sellerReply && (
                    <div className="mt-2.5 pl-3 border-l-2 border-[#ECE9F7]">
                      <p className="text-[11px] font-semibold text-[#7C3AED] mb-0.5">Seller reply</p>
                      <p className="text-[12.5px] text-[#514B67] leading-relaxed">{r.sellerReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-[#ECE9F7] flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11.5px] text-[#8A8372]">A FindIt store</p>
          <Link
            href="/"
            className="text-[12.5px] font-semibold text-white px-4 py-2 rounded-full"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            Open FindIt
          </Link>
        </div>
      </div>
    </main>
  );
}
