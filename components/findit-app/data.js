import {
  Wrench, Lightbulb, Droplet, Utensils, Droplets, GraduationCap, Briefcase,
  Smartphone, Car, BatteryCharging, Sparkles, Leaf, Monitor, BookOpen, Package,
  Send, ShieldCheck, Star, Truck, BadgeCheck, ShieldPlus,
} from "lucide-react";
import { CATEGORY_LABELS } from "../../lib/categories";

/* Category icons. Categories themselves are now admin-editable, DB-backed
   data (see lib/categoryCatalog.ts, GET /api/categories) — lib/categories.js
   is kept only as this file's static default/fallback, so GROUPS below has
   something real to render before the one live fetch (made once, from
   MainApp) resolves. This map is the fixed set of icon components a
   category's `iconKey` can name; an admin-added category whose iconKey
   isn't in here just falls back to Package rather than breaking anything —
   a database row can't literally contain a React component. */
const CATEGORY_ICON_COMPONENTS = {
  BookOpen, Wrench, Package, Lightbulb, Droplet, Utensils, Droplets,
  GraduationCap, Briefcase, Smartphone, Car, BatteryCharging, Sparkles, Leaf, Monitor,
};

const DEFAULT_CATEGORY_ICON_KEYS = {
  reading: "BookOpen",
  tools: "Wrench",
  organization: "Package",
  lighting: "Lightbulb",
  cleaning: "Droplet",
  kitchen: "Utensils",
  bathroom: "Droplets",
  campus: "GraduationCap",
  travel: "Briefcase",
  phonetech: "Smartphone",
  car: "Car",
  power: "BatteryCharging",
  weird: "Sparkles",
  plant: "Leaf",
  desk: "Monitor",
};

export const GROUPS = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [
    key,
    { label, icon: CATEGORY_ICON_COMPONENTS[DEFAULT_CATEGORY_ICON_KEYS[key]] || Package },
  ])
);

// Called once by MainApp after GET /api/categories resolves. Mutates GROUPS
// IN PLACE (every consumer already does GROUPS[key] at render time, never a
// module-scope destructure — see e.g. ProductDetail.jsx) rather than
// reassigning the export, so every existing `import { GROUPS }` call site
// picks up a live admin edit on its next render with no changes of its own.
// A category an admin deactivates or removes stays in GROUPS rather than
// being deleted from it — an OLDER listing/request already tagged with that
// category still needs a label/icon to display, same as a lapsed Store plan
// never deletes a seller's existing listings.
export function applyCategoryOverrides(categories) {
  for (const c of categories) {
    GROUPS[c.id] = { label: c.label, icon: CATEGORY_ICON_COMPONENTS[c.iconKey] || Package };
  }
}

/* Gradient swatches for ArtBlock — product.art (from /api/products) indexes into this. */
export const ART = [
  "from-[#8B5CF6] to-[#4C1D95]", "from-[#A855F7] to-[#6D28D9]", "from-[#7C3AED] to-[#312E81]",
  "from-[#C026D3] to-[#5B21B6]", "from-[#6D28D9] to-[#1E1B4B]",
];

export const NOTIFICATION_ICONS = {
  offer: Send,
  delivery: Truck,
  payment: ShieldCheck,
  review: Star,
  seller: BadgeCheck,
  admin: ShieldPlus,
};

export const STEPS = ["Awaiting payment", "Seller preparing", "Dispatched", "Out for delivery", "Delivered"];

// How far a seller can move an order on their own. The last step belongs to
// the buyer: "Delivered" means the person who paid confirmed it arrived, and
// that confirmation is what releases the payment. Mirrors
// SELLER_SETTABLE_STATUSES in lib/repo.ts, which enforces the same rule
// server-side.
export const SELLER_STEPS = STEPS.filter((s) => s !== "Delivered");

export const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
