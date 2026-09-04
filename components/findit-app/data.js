import {
  Wrench, Lightbulb, Droplet, Utensils, Droplets, GraduationCap, Briefcase,
  Smartphone, Car, BatteryCharging, Sparkles, Leaf, Monitor, BookOpen, Package,
  Send, ShieldCheck, Star, Truck, BadgeCheck,
} from "lucide-react";

/* Category labels + icons for the FindIt idea bank. Product data itself
   (name, price, seller, rating…) is now served from /api/products —
   see lib/catalogue.js for the shared category->item list used to seed it. */
export const GROUPS = {
  reading: { label: "Reading & Book Gadgets", icon: BookOpen },
  tools: { label: "Tools & Repair", icon: Wrench },
  organization: { label: "Home Organization", icon: Package },
  lighting: { label: "Lighting", icon: Lightbulb },
  cleaning: { label: "Cleaning", icon: Droplet },
  kitchen: { label: "Kitchen", icon: Utensils },
  bathroom: { label: "Bathroom & Personal Care", icon: Droplets },
  campus: { label: "Student & Campus", icon: GraduationCap },
  travel: { label: "Travel & Everyday Carry", icon: Briefcase },
  phonetech: { label: "Phone & Everyday Tech", icon: Smartphone },
  car: { label: "Car Products", icon: Car },
  power: { label: "Power & Connectivity", icon: BatteryCharging },
  weird: { label: "Weirdly Useful", icon: Sparkles },
  plant: { label: "Plant & Agriculture", icon: Leaf },
  desk: { label: "Desk Setup", icon: Monitor },
};

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

export const MY_SAVED_IDS = ["p2", "p7", "p45"];

export const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
