import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/store";

// Everything behind "/" other than the homepage itself is client-rendered
// app state (screens, admin, auth) with nothing for a crawler to index and
// no reason to spend crawl budget on it — only "/" and live storefronts
// (see app/sitemap.ts) are meant to be indexed.
export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/store/"],
        disallow: ["/api/", "/verify/"],
      },
    ],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
