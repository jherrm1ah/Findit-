import type { Metadata } from "next";
import App from "@/components/findit-app/App";

// Real, homepage-specific metadata — otherwise every page (this one
// included) falls back to the root layout's generic title/description.
export const metadata: Metadata = {
  title: "Request anything, buy from verified sellers",
  description:
    "FindIt is a request-first marketplace: tell us what you need and real, verified sellers near you send offers — or browse the catalogue directly. Every order is escrow-protected, released only once you confirm delivery.",
};

// No separate marketing landing page in front of this — every visitor
// (new or returning) goes straight into the app itself, which opens on
// its own Splash → Welcome → Login/signup sequence for a first-time
// visitor, or straight past that for a returning signed-in one. See
// components/findit-app/App.jsx.
export default function Page() {
  return <App />;
}
