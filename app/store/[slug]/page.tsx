import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicStoreBySlug, appBaseUrl } from "@/lib/store";

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

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

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
  const result = await getPublicStoreBySlug(params.slug);

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

  return (
    <main className="min-h-screen bg-[#FAFAFF] pb-16">
      {profile.bannerUrl ? (
        <div className="h-36 sm:h-48 w-full overflow-hidden bg-[#EDE9FB]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profile.bannerUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-24 w-full" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }} />
      )}

      <div className="max-w-3xl mx-auto px-5">
        <header className={`flex items-start gap-4 ${profile.bannerUrl ? "-mt-10" : "-mt-8"} mb-5`}>
          <div
            className="w-20 h-20 rounded-2xl shrink-0 overflow-hidden border-4 border-[#FAFAFF] flex items-center justify-center text-white text-[26px] font-bold"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="" className="w-full h-full object-cover" />
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
        </header>

        <div className="flex items-center gap-2 flex-wrap mb-4 text-[11.5px]">
          <span className="px-2.5 py-1 rounded-full bg-[#F1ECFD] text-[#7C3AED] font-semibold">
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

        <h2 className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">
          {profile.listings.length} listing{profile.listings.length === 1 ? "" : "s"}
        </h2>

        {profile.listings.length === 0 ? (
          <p className="text-[13px] text-[#6B6483] py-10 text-center bg-white border border-[#ECE9F7] rounded-2xl">
            This store has no active listings right now.
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6 list-none p-0 m-0">
            {profile.listings.map((product) => (
              <li key={product.id}>
                <Link href={`/?product=${encodeURIComponent(product.id)}`} className="block group">
                  <div className="rounded-2xl overflow-hidden bg-[#EDE9FB] h-32 mb-2">
                    {product.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="text-[12.5px] font-medium text-[#1E1B4B] leading-tight line-clamp-2">{product.name}</p>
                  <p className="text-[13px] font-bold text-[#1E1B4B] mt-0.5">{naira(product.price)}</p>
                </Link>
              </li>
            ))}
          </ul>
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
