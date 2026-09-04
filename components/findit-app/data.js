import {
  Wrench, Lightbulb, Droplet, Utensils, Droplets, GraduationCap, Briefcase,
  Smartphone, Car, BatteryCharging, Sparkles, Leaf, Monitor, BookOpen, Package,
  Send, ShieldCheck, Star, Truck, BadgeCheck,
} from "lucide-react";
import { CATEGORY_LABELS } from "../../lib/categories";

/* Category icons, paired with the real category labels in lib/categories.js
   (the single source of truth for category ids/labels, shared with the
   server-side listing validation in lib/repo.ts). Product data itself
   (name, price, seller…) is real, served from /api/products. */
const CATEGORY_ICONS = {
  reading: BookOpen,
  tools: Wrench,
  organization: Package,
  lighting: Lightbulb,
  cleaning: Droplet,
  kitchen: Utensils,
  bathroom: Droplets,
  campus: GraduationCap,
  travel: Briefcase,
  phonetech: Smartphone,
  car: Car,
  power: BatteryCharging,
  weird: Sparkles,
  plant: Leaf,
  desk: Monitor,
};

export const GROUPS = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [key, { label, icon: CATEGORY_ICONS[key] }])
);

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
};

export const STEPS = ["Awaiting payment", "Seller preparing", "Dispatched", "Out for delivery", "Delivered"];

export const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
