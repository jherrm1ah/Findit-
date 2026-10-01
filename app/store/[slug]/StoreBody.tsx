import Link from "next/link";
import Image from "next/image";
import { MessageCircle, ShieldCheck, BadgeCheck } from "lucide-react";
import type { PublicSellerProfile } from "@/lib/sellerPublicProfile";
import { getStoreAccent, type StoreAccent } from "@/lib/subscriptions";
import StoreListings from "./StoreListings";

// The four real, structurally different storefront layouts a paid Store
// plan can unlock (see lib/subscriptions.ts#STORE_TEMPLATES for which plan
// tier unlocks which). Everything SHARED between them (metadata, JSON-LD,
// the "store isn't open right now" state, the surrounding <main> + the
// escrow-protection copy, the review list, the footer) is factored into the
// small components below so the four JSX trees that actually differ stay
// readable — but the four layouts are genuinely different arrangements,
// not the same markup with different colors.
//
// ClassicLayout is, byte-for-byte in structure, exactly what every
// storefront rendered before this file existed — it's the universal
// default (see effectiveStoreTemplate) specifically so a seller who never
// opens the new template picker sees no change at all.
//
// Every spot that used to hardcode the #A855F7/#7C3AED violet gradient now
// reads it off `accent` (see lib/subscriptions.ts#STORE_ACCENTS) instead —
// a curated color pair the seller can pick, resolved against their live
// plan the same lapse-safe way the template itself is (effectiveStoreAccent).
// Inline styles, not Tailwind arbitrary-value classes, because the actual
// color is only known at render time, not at build time.

// Exported too — page.tsx's generateMetadata needs the exact same label
// for its Open Graph description fallback, and duplicating this map there
// would just be a second place it could drift out of sync with the page.
export const LEVEL_LABEL: Record<string, string> = {
  new: "New seller",
  verified: "Verified seller",
  trusted: "Trusted seller",
};

function gradient(accent: StoreAccent): string {
  return `linear-gradient(135deg,${accent.from},${accent.to})`;
}

type LayoutProps = {
  profile: PublicSellerProfile;
  categoryLabels: Record<string, string>;
};

function MessageSellerLink({
  profile,
  className,
  style,
}: {
  profile: PublicSellerProfile;
  className: string;
  style?: React.CSSProperties;
}) {
  // Goes through the SPA's session check, same as the "Open FindIt" link
  // below — a signed-out buyer lands on Login first (App.jsx never renders
  // MainApp without a session) and the param survives that detour, so it
  // still opens the thread once they're in.
  return (
    <Link
      href={`/?messageSeller=${encodeURIComponent(profile.name)}&messageSellerId=${encodeURIComponent(profile.id)}`}
      className={className}
      style={style}
    >
      <MessageCircle size={14} /> Message seller
    </Link>
  );
}

function BadgeRow({ profile, accent }: { profile: PublicSellerProfile; accent: StoreAccent }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
      <span
        className="flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold"
        style={{ background: accent.tint, color: accent.to }}
      >
        {(profile.verificationLevel === "verified" || profile.verificationLevel === "trusted") && (
          <BadgeCheck size={12} />
        )}
        {LEVEL_LABEL[profile.verificationLevel] ?? "New seller"}
      </span>
      {profile.category && (
        <span className="px-2.5 py-1 rounded-full bg-white border border-[#ECE9F7] text-[#514B67]">{profile.category}</span>
      )}
      {profile.location && (
        <span className="px-2.5 py-1 rounded-full bg-white border border-[#ECE9F7] text-[#514B67]">{profile.location}</span>
      )}
      {profile.rating !== null && (
        <span className="px-2.5 py-1 rounded-full bg-white border border-[#ECE9F7] text-[#514B67]">
          {"★"} {profile.rating} ({profile.reviewCount})
        </span>
      )}
    </div>
  );
}

// The same escrow promise ProductDetail.jsx gives a buyer inside the app —
// repeated here because a store link is often someone's very first touch
// with FindIt, before they've seen that reassurance anywhere else.
function EscrowBanner({
  profile,
  accent,
  compact = false,
}: {
  profile: PublicSellerProfile;
  accent: StoreAccent;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl ${compact ? "px-3.5 py-2.5" : "px-4 py-3"}`}
      style={{ background: accent.tint }}
    >
      <ShieldCheck size={compact ? 14 : 16} className="shrink-0" style={{ color: accent.to }} />
      <p className="text-[12px] text-[#4C1D95] leading-snug">
        Every order here is protected by FindIt — your payment is held and only released to{" "}
        {profile.name} once you confirm delivery.
      </p>
    </div>
  );
}

function ReviewsSection({ profile, accent }: { profile: PublicSellerProfile; accent: StoreAccent }) {
  if (profile.reviews.length === 0) return null;
  return (
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
                <p className="text-[11px] font-semibold mb-0.5" style={{ color: accent.to }}>
                  Seller reply
                </p>
                <p className="text-[12.5px] text-[#514B67] leading-relaxed">{r.sellerReply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreFooter({ accent }: { accent: StoreAccent }) {
  return (
    <div className="mt-10 pt-6 border-t border-[#ECE9F7] flex items-center justify-between gap-4 flex-wrap">
      <p className="text-[11.5px] text-[#8A8372]">A FindIt store</p>
      <Link
        href="/"
        className="text-[12.5px] font-semibold text-white px-4 py-2 rounded-full"
        style={{ background: gradient(accent) }}
      >
        Open FindIt
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Classic — the original, universal-default layout                          */
/* -------------------------------------------------------------------------- */

function ClassicLayout({ profile, categoryLabels }: LayoutProps) {
  const accent = getStoreAccent(profile.storeAccent);
  return (
    <>
      {profile.bannerUrl ? (
        <div className="relative h-36 sm:h-48 w-full overflow-hidden bg-[#EDE9FB]">
          <Image src={profile.bannerUrl} alt="" fill sizes="100vw" priority className="object-cover" />
        </div>
      ) : (
        <div className="h-24 w-full" style={{ background: gradient(accent) }} />
      )}

      <div className="max-w-3xl mx-auto px-5">
        <header className={`flex items-start justify-between gap-4 flex-wrap ${profile.bannerUrl ? "-mt-10" : "-mt-8"} mb-5`}>
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="relative w-20 h-20 rounded-2xl shrink-0 overflow-hidden border-4 border-[#FAFAFF] flex items-center justify-center text-white text-[26px] font-bold"
              style={{ background: gradient(accent) }}
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
                    style={{ background: gradient(accent) }}
                  >
                    PRO
                  </span>
                )}
              </h1>
            </div>
          </div>

          <MessageSellerLink
            profile={profile}
            className="mt-11 shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-full"
            style={{ background: "#1E1B4B" }}
          />
        </header>

        <div className="mb-4">
          <BadgeRow profile={profile} accent={accent} />
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

        <div className="mb-7">
          <EscrowBanner profile={profile} accent={accent} />
        </div>

        <StoreListings listings={profile.listings} categoryLabels={categoryLabels} accent={accent} />

        <ReviewsSection profile={profile} accent={accent} />
        <StoreFooter accent={accent} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compact — tighter vertical rhythm, gets to the products faster            */
/* -------------------------------------------------------------------------- */

function CompactLayout({ profile, categoryLabels }: LayoutProps) {
  const accent = getStoreAccent(profile.storeAccent);
  return (
    <>
      <div className="relative h-16 w-full overflow-hidden bg-[#EDE9FB]">
        {profile.bannerUrl ? (
          <Image src={profile.bannerUrl} alt="" fill sizes="100vw" priority className="object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient(accent) }} />
        )}
      </div>

      <div className="max-w-3xl mx-auto px-5">
        <header className="flex items-center gap-3 flex-wrap mt-3 mb-3">
          <div
            className="relative w-14 h-14 rounded-xl shrink-0 overflow-hidden border-2 border-[#FAFAFF] flex items-center justify-center text-white text-[18px] font-bold"
            style={{ background: gradient(accent) }}
          >
            {profile.logoUrl ? (
              <Image src={profile.logoUrl} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          <h1
            className="text-[18px] font-bold text-[#1E1B4B] leading-tight flex items-center gap-2 flex-wrap min-w-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {profile.name}
            {profile.proBadge && (
              <span
                className="text-[9.5px] font-bold text-white px-1.5 py-0.5 rounded-full"
                style={{ background: gradient(accent) }}
              >
                PRO
              </span>
            )}
          </h1>
          <MessageSellerLink
            profile={profile}
            className="ml-auto shrink-0 flex items-center gap-1.5 text-[12px] font-semibold text-white px-3.5 py-2 rounded-full"
            style={{ background: "#1E1B4B" }}
          />
        </header>

        <div className="mb-3">
          <BadgeRow profile={profile} accent={accent} />
        </div>

        {profile.description && (
          <p className="text-[13px] text-[#514B67] leading-relaxed mb-3 max-w-prose">{profile.description}</p>
        )}

        <div className="flex items-center justify-between gap-4 flex-wrap mb-4 text-[11.5px] text-[#6B6483]">
          <span>
            <b className="text-[#1E1B4B]">{profile.completedOrderCount}</b> completed order
            {profile.completedOrderCount === 1 ? "" : "s"}
            {profile.memberSince && (
              <>
                {" · "}On FindIt since{" "}
                <b className="text-[#1E1B4B]">
                  {new Date(profile.memberSince).toLocaleDateString("en-NG", { month: "short", year: "numeric" })}
                </b>
              </>
            )}
          </span>
        </div>

        <div className="mb-5">
          <EscrowBanner profile={profile} accent={accent} compact />
        </div>

        <StoreListings listings={profile.listings} categoryLabels={categoryLabels} accent={accent} />

        <ReviewsSection profile={profile} accent={accent} />
        <StoreFooter accent={accent} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gallery — the product grid is the hero, everything else condenses above   */
/* -------------------------------------------------------------------------- */

function GalleryLayout({ profile, categoryLabels }: LayoutProps) {
  const accent = getStoreAccent(profile.storeAccent);
  return (
    <div className="max-w-3xl mx-auto px-5">
      <header className="flex items-center gap-3 flex-wrap pt-5 mb-3">
        <div
          className="relative w-12 h-12 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-[16px] font-bold"
          style={{ background: gradient(accent) }}
        >
          {profile.logoUrl ? (
            <Image src={profile.logoUrl} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            profile.name.charAt(0).toUpperCase()
          )}
        </div>
        <h1
          className="text-[17px] font-bold text-[#1E1B4B] leading-tight flex items-center gap-2 flex-wrap min-w-0"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {profile.name}
          {profile.proBadge && (
            <span
              className="text-[9.5px] font-bold text-white px-1.5 py-0.5 rounded-full"
              style={{ background: gradient(accent) }}
            >
              PRO
            </span>
          )}
        </h1>
        <MessageSellerLink
          profile={profile}
          className="ml-auto shrink-0 flex items-center gap-1.5 text-[12px] font-semibold text-white px-3.5 py-2 rounded-full"
          style={{ background: "#1E1B4B" }}
        />
      </header>

      <div className="flex items-center gap-2 flex-wrap mb-5 text-[11.5px]">
        <BadgeRow profile={profile} accent={accent} />
        <span className="text-[#6B6483]">
          <b className="text-[#1E1B4B]">{profile.completedOrderCount}</b> completed order
          {profile.completedOrderCount === 1 ? "" : "s"}
        </span>
      </div>

      {profile.description && (
        <p className="text-[13px] text-[#514B67] leading-relaxed mb-5 max-w-prose">{profile.description}</p>
      )}

      <StoreListings listings={profile.listings} categoryLabels={categoryLabels} density="spacious" accent={accent} />

      <div className="mt-7">
        <EscrowBanner profile={profile} accent={accent} compact />
      </div>

      <ReviewsSection profile={profile} accent={accent} />
      <StoreFooter accent={accent} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Showcase — editorial, full-bleed, Pro-exclusive                           */
/* -------------------------------------------------------------------------- */

function ShowcaseLayout({ profile, categoryLabels }: LayoutProps) {
  const accent = getStoreAccent(profile.storeAccent);
  return (
    <>
      <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-[#EDE9FB]">
        {profile.bannerUrl ? (
          <Image src={profile.bannerUrl} alt="" fill sizes="100vw" priority className="object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient(accent) }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-5">
        <header className="flex items-start justify-between gap-4 flex-wrap -mt-12 mb-5">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="relative w-24 h-24 rounded-[22px] shrink-0 overflow-hidden border-4 border-[#FAFAFF] flex items-center justify-center text-white text-[30px] font-bold shadow-lg shadow-[#4C1D95]/15"
              style={{ background: gradient(accent) }}
            >
              {profile.logoUrl ? (
                <Image src={profile.logoUrl} alt="" fill sizes="96px" className="object-cover" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 pt-14">
              <h1
                className="text-[25px] font-bold text-[#1E1B4B] leading-tight flex items-center gap-2 flex-wrap"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {profile.name}
                {profile.proBadge && (
                  <span
                    className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
                    style={{ background: gradient(accent) }}
                  >
                    PRO
                  </span>
                )}
              </h1>
            </div>
          </div>
          <MessageSellerLink
            profile={profile}
            className="mt-14 shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-full"
            style={{ background: "#1E1B4B" }}
          />
        </header>

        <div className="mb-5">
          <BadgeRow profile={profile} accent={accent} />
        </div>

        {profile.description && (
          <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-5 mb-6">
            <p className="text-[10.5px] font-semibold text-[#8A8372] uppercase tracking-wide mb-2">
              About {profile.name}
            </p>
            <p className="text-[14px] text-[#514B67] leading-relaxed max-w-prose">{profile.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl p-4" style={{ background: accent.tint }}>
            <p className="text-[20px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
              {profile.completedOrderCount}
            </p>
            <p className="text-[11.5px] text-[#6B6483]">Completed order{profile.completedOrderCount === 1 ? "" : "s"}</p>
          </div>
          {profile.memberSince && (
            <div className="rounded-2xl p-4" style={{ background: accent.tint }}>
              <p className="text-[20px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
                {new Date(profile.memberSince).toLocaleDateString("en-NG", { month: "short", year: "numeric" })}
              </p>
              <p className="text-[11.5px] text-[#6B6483]">On FindIt since</p>
            </div>
          )}
        </div>

        <div className="mb-7">
          <EscrowBanner profile={profile} accent={accent} />
        </div>

        <StoreListings listings={profile.listings} categoryLabels={categoryLabels} density="spacious" accent={accent} />

        <ReviewsSection profile={profile} accent={accent} />
        <StoreFooter accent={accent} />
      </div>
    </>
  );
}

export default function StoreBody({ profile, categoryLabels }: LayoutProps) {
  switch (profile.storeTemplate) {
    case "compact":
      return <CompactLayout profile={profile} categoryLabels={categoryLabels} />;
    case "gallery":
      return <GalleryLayout profile={profile} categoryLabels={categoryLabels} />;
    case "showcase":
      return <ShowcaseLayout profile={profile} categoryLabels={categoryLabels} />;
    case "classic":
    default:
      return <ClassicLayout profile={profile} categoryLabels={categoryLabels} />;
  }
}
