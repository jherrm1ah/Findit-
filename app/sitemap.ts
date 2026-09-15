import type { MetadataRoute } from "next";
import { appBaseUrl, listActiveStoreSlugs, storeUrl } from "@/lib/store";

// The only URLs worth listing here are ones a crawler can actually render
// something from: "/" is the client-rendered app shell (no per-listing
// content without a session, see components/findit-app/App.jsx), so the
// homepage and each live seller storefront (the one real server-rendered,
// public, per-URL page — see app/store/[slug]/page.tsx) are what this
// returns. force-dynamic (like the store page itself) since the seller list
// changes as sellers get approved and claim slugs.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl();
  if (!base) return [];

  const stores = await listActiveStoreSlugs();

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...stores.map((s) => ({
      url: storeUrl(s.slug, base),
      lastModified: s.updatedAt ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
