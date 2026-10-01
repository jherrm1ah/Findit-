import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicStoreBySlug, appBaseUrl } from "@/lib/store";
import { listCategories } from "@/lib/categoryCatalog";
import StoreBody, { LEVEL_LABEL } from "./StoreBody";

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
        //
        // jsonLd.name/description/address embed a seller's own business
        // name/description/location verbatim — real user input, stored with
        // no HTML stripping (see lib/auth.ts#becomeSeller). JSON.stringify
        // does NOT escape "<", so a business name containing
        // "</script><script>…" would close this tag early and inject a
        // real, executing <script> into every visitor's page — a stored
        // XSS reachable by anyone who views this seller's public store, not
        // just the seller. Escaping "<" to its unicode form is the standard
        // mitigation for embedding JSON inside a <script> tag: it's a no-op
        // for JSON-LD parsers (still valid, still decodes to the same "<"),
        // but the raw HTML can no longer contain a literal "</script>".
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <StoreBody profile={profile} categoryLabels={categoryLabels} />
    </main>
  );
}
