import type { MetadataRoute } from "next";

// Lets a visitor "Add to Home Screen" and get a real app-like icon and
// standalone window instead of a browser tab — the whole UI (bottom tab
// bar, full-screen overlays, splash screen) is already designed to feel
// like a native app; this is what actually makes that installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FindIt Naija",
    short_name: "FindIt",
    description: "Request-first marketplace connecting buyers to verified sellers.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAFF",
    theme_color: "#6D28D9",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
