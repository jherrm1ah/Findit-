import type { MetadataRoute } from "next";

// Lets a visitor "Add to Home Screen" and get a real app-like icon and
// standalone window instead of a browser tab — the whole UI (bottom tab
// bar, full-screen overlays, splash screen) is already designed to feel
// like a native app; this is what actually makes that installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FindIt",
    short_name: "FindIt",
    description: "Request-first marketplace connecting buyers to verified sellers.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAFF",
    theme_color: "#6D28D9",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      // Android/Play Store (TWA) look for these two sizes specifically —
      // without them, a Trusted Web Activity build has no valid launcher
      // icon to package. See lib/brandIcon.tsx.
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
