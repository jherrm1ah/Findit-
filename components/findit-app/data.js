import {
  PackageSearch, Wrench, TrendingUp, Package, Lightbulb, Droplet, Utensils,
  Droplets, GraduationCap, Briefcase, Smartphone, Car, BatteryCharging,
  Sparkles, Leaf, Monitor, BookOpen, Send, ShieldCheck, Star, Bell, Truck,
  BadgeCheck,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  CATALOGUE — every item from Section 15 of the FindIt Naija brief   */
/* ------------------------------------------------------------------ */

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

export const CATALOGUE = {
  reading: [
    "Book-insert reading light","Rechargeable clip-on book light","Flat-page reading lamp",
    "Book light bookmark","Neck reading light","Flexible reading light","Page magnifier with LED",
    "Book holder","Adjustable book stand","Foldable book stand","Bedside book holder",
    "Hands-free book holder","Reading timer","Book annotation tabs","Digital bookmark",
    "Book page magnifier","Rechargeable mini desk lamp","USB book light","Book-shaped night light",
    "Book sleeve with accessories",
  ],
  tools: [
    "Shelf-removal tool","Furniture moving sliders","Mini electric screwdriver",
    "Electric precision screwdriver","Magnetic screw tray","Flexible magnetic pickup tool",
    "Telescopic inspection mirror","Mini inspection camera","Cable pulling tool","Wire stripping tool",
    "Multi-function measuring tool","Digital measuring tape","Laser distance meter","Mini spirit level",
    "Stud or wall detector","Rechargeable electric cutter","Mini electric box cutter",
    "Precision craft knife","Universal socket","Ratchet screwdriver set","Flexible screwdriver extension",
    "Magnetic wristband","Foldable work light","USB rechargeable inspection light",
    "Mini work-light flashlight","Headlamp","Keychain flashlight","Rechargeable pen light",
    "UV flashlight","Multi-tool keychain",
  ],
  organization: [
    "Under-sink organizer","Expandable drawer organizer","Cable management box","Magnetic cable clips",
    "Under-desk cable tray","Self-adhesive cable holder","Rotating storage organizer",
    "Pull-out cabinet organizer","Vertical shoe organizer","Hanging wardrobe organizer",
    "Vacuum storage bags","Space-saving clothes hanger","Multi-layer hanger","Foldable storage boxes",
    "Bedside hanging organizer","Remote-control holder","Magnetic wall organizer",
    "Kitchen drawer divider","Fridge organizer","Can and bottle dispenser",
  ],
  lighting: [
    "Under-bed motion-sensor light","Wardrobe motion light","Closet LED light","Staircase motion light",
    "Toilet night light","Toilet-bowl night light","Cabinet light","Magnetic rechargeable wall light",
    "Stick-on rechargeable light","Motion-sensor night light","USB reading lamp","Book-page light",
    "Bedside flexible lamp","Portable emergency lamp","Solar emergency lamp","Rechargeable lantern",
    "Camping lantern","Mini magnetic flashlight","Rechargeable work light","USB-C rechargeable flashlight",
  ],
  cleaning: [
    "Electric spin scrubber","Mini electric cleaning brush","Electric grout cleaner",
    "Keyboard cleaning kit","Mini keyboard vacuum","USB cleaning vacuum","Screen-cleaning kit",
    "Electric fabric shaver","Lint remover","Reusable pet-hair remover","Window-cleaning magnetic tool",
    "Microfiber blind cleaner","Bottle-cleaning brush","Electric bottle cleaner","Drain hair catcher",
    "Sink drain cleaner","Reusable drain snake","Mini cleaning steam tool","Shoe cleaning machine",
    "Sneaker cleaning kit",
  ],
  kitchen: [
    "Mini bag sealer","Electric bottle opener","Automatic can opener","Vegetable chopper",
    "Mini electric food chopper","Garlic press","Oil spray bottle","Digital kitchen scale",
    "Foldable colander","Silicone food covers","Reusable food storage bags","Magnetic measuring spoons",
    "Pot-lid holder","Pan organizer","Fridge organizer","Egg storage container",
    "Automatic soap dispenser","Sink caddy","Kitchen faucet extender","Splash-proof faucet attachment",
  ],
  bathroom: [
    "Shower head with filter","Water-saving shower attachment","Automatic soap dispenser",
    "Toothpaste dispenser","Toothbrush UV holder","Wall-mounted toothbrush holder","Shower phone holder",
    "Waterproof phone pouch","Anti-fog bathroom mirror","LED bathroom mirror","Bathroom drain catcher",
    "Silicone body scrubber","Electric cleaning brush","Travel toiletry organizer",
    "Portable electric toothbrush","Mini bathroom storage rack",
  ],
  campus: [
    "Foldable laptop stand","Portable reading lamp","Mini thermal printer","Portable label printer",
    "LCD writing tablet","Digital Pomodoro timer","USB rechargeable fan","Mini desk fan",
    "Laptop privacy screen","Keyboard cleaning kit","Laptop stand with phone holder","Cable organizer",
    "Portable power bank","Mini UPS","Router backup battery","USB desk lamp","Noise-reduction earplugs",
    "Book holder","Portable document scanner","Digital voice recorder","Smart notebook",
    "Reusable notebook","Magnetic bookmark","Book reading light",
  ],
  travel: [
    "Electronic luggage scale","Compression packing cubes","Travel vacuum bags",
    "Portable luggage tracker","Bluetooth item tracker","RFID card holder","Anti-theft backpack",
    "Cable travel organizer","Universal travel adapter","Portable travel steamer","Portable water bottle",
    "Foldable water bottle","Travel toiletry bag","Passport organizer","Luggage cup holder",
    "Luggage phone holder","Portable neck fan","Travel pillow","Portable door lock","Travel safety alarm",
  ],
  phonetech: [
    "Phone cooling fan","Magnetic phone stand","Foldable phone stand","Phone microscope",
    "Phone thermal printer","Mini smartphone projector","Phone teleprompter","Mini smartphone tripod",
    "Bluetooth camera shutter","Clip-on phone light","Magnetic wireless charger","USB-C hub",
    "USB-C card reader","Phone cleaning kit","Screen magnifier","Phone gaming controller",
    "Mobile gaming triggers","Phone cooling clip","Portable phone fan","Smartphone microscope",
  ],
  car: [
    "Portable tire inflator","Digital tire-pressure gauge","Car jump starter","Car diagnostic scanner",
    "Car HUD","Portable CarPlay screen","Wireless CarPlay adapter","Magnetic phone mount",
    "Wireless charging car mount","Car seat gap organizer","Car trash bin","Car cleaning gel",
    "Mini car vacuum","Car emergency light","LED trunk light","Car blind-spot mirror",
    "Car battery monitor","USB car fan","Car seat organizer","Car cable organizer",
  ],
  power: [
    "Mini UPS for router","Router backup battery","DC backup fan","Rechargeable fan",
    "Solar reading lamp","Solar emergency light","Rechargeable emergency bulb","USB rechargeable lamp",
    "Power bank with built-in cables","20,000mAh power bank","High-capacity power bank",
    "Portable power station","Solar power station","Dual-SIM 4G router","Network signal booster",
    "Wi-Fi extender","USB Wi-Fi adapter","Mini DC UPS","Rechargeable work light","Solar motion light",
  ],
  weird: [
    "Mini thermal printer","Bluetooth label maker","Digital luggage scale","Digital measuring tape",
    "Laser distance meter","Bluetooth tracker","Mini endoscope camera","Portable UV flashlight",
    "Digital microscope","Mini metal detector","Key finder","Electric screwdriver",
    "Rechargeable lint remover","Mini bag sealer","Portable vacuum sealer",
    "Automatic plant watering device","Soil moisture meter","Digital thermometer and hygrometer",
    "Air-quality monitor","Smart water-level sensor",
  ],
  plant: [
    "Automatic plant watering system","Soil moisture meter","Digital plant monitor","Plant grow light",
    "Self-watering planter","Plant moisture sensor","Mini greenhouse","Seed starter kit",
    "Garden pruning tool","Electric plant sprayer","Portable garden sprayer","Solar irrigation timer",
  ],
  desk: [
    "Pixel LED display","Smart digital calendar","Digital desk clock","Magnetic desk organizer",
    "Cable-management box","Desk ambient light","Monitor light bar","RGB desk lamp",
    "Wireless charging desk mat","Phone charging stand","Headphone stand","Headphone hanger",
    "Monitor riser","Laptop stand","USB desk fan","Mini humidifier","Desktop air purifier",
    "Mini aroma diffuser",
  ],
};

export const FIRST_20_TEST = new Set([
  "Book-insert reading light","Neck reading light","Mini endoscope camera","Magnetic wristband",
  "Digital measuring tape","Laser distance meter","Mini electric screwdriver","Rechargeable work light",
  "Under-bed motion-sensor light","Mini bag sealer","Electric fabric shaver","Keyboard cleaning kit",
  "Foldable laptop stand","Router backup battery","USB-C hub","Portable tire inflator",
  "Car diagnostic scanner","Mini thermal printer","Mini UPS for router",
]);

export const MARKETING_PICKS = {
  "Book-insert reading light": "problemsolver",
  "Mini UPS for router": "hardtofind",
  "Mini endoscope camera": "trending",
  "Digital tire-pressure gauge": "problemsolver",
  "Foldable laptop stand": "trending",
  "Rechargeable clip-on book light": "hardtofind",
};

export const SELLERS = [
  "Terra Gadgets", "PowerPoint Electricals", "TechBase Plateau", "AutoFix Parts",
  "Campus Essentials", "Jos Tech Hub", "QuickFix Gadgets", "Plateau Home Store",
  "Rayfield Traders", "Farin Gada Wholesale", "Bukuru Repairs & Parts", "Terminus Market Direct",
];

export const ART = [
  "from-[#8B5CF6] to-[#4C1D95]", "from-[#A855F7] to-[#6D28D9]", "from-[#7C3AED] to-[#312E81]",
  "from-[#C026D3] to-[#5B21B6]", "from-[#6D28D9] to-[#1E1B4B]",
];

export const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const PRODUCTS = (() => {
  const out = [];
  let n = 1;
  Object.entries(CATALOGUE).forEach(([groupKey, items]) => {
    items.forEach((name) => {
      const h = hashStr(name + groupKey);
      out.push({
        id: `p${n++}`,
        name,
        group: groupKey,
        icon: GROUPS[groupKey].icon,
        price: 2800 + (h % 46) * 650,
        seller: SELLERS[h % SELLERS.length],
        rating: Number((3.9 + (h % 10) / 10).toFixed(1)),
        verified: h % 3 !== 0,
        testBatch: FIRST_20_TEST.has(name),
        marketingCat: MARKETING_PICKS[name],
        loc: "Jos",
        art: h % ART.length,
      });
    });
  });
  return out;
})();

export const MARKETING_SECTIONS = {
  hardtofind: { label: "Hard to Find", icon: PackageSearch },
  problemsolver: { label: "Problem Solver", icon: Wrench },
  trending: { label: "Trending Discovery", icon: TrendingUp },
};

export const STEPS = ["Awaiting payment", "Seller preparing", "Dispatched", "Out for delivery", "Delivered"];

export const MOCK_OFFERS = [
  { id: "o1", seller: "PowerPoint Electricals", verified: true, rating: 4.9, orders: 212, price: 24000, delivery: "2,000", eta: "1–2 days", condition: "New", warranty: "6 months", note: "Original, tested with TP-Link and MTN routers." },
  { id: "o2", seller: "Jos Tech Hub", verified: true, rating: 4.5, orders: 98, price: 21500, delivery: "1,500", eta: "2–3 days", condition: "New", warranty: "3 months", note: "Slightly smaller capacity, still covers 4–6 hrs." },
  { id: "o3", seller: "QuickFix Gadgets", verified: false, rating: 3.9, orders: 14, price: 19000, delivery: "Pickup only", eta: "Same day", condition: "Used — like new", warranty: "No warranty", note: "Buyer inspects before payment release." },
];

export const SELLER_INBOUND = [
  { id: "r1", customer: "Amaka O.", item: "Generator carburettor for Elemax SV6500", budget: "₦8,000–12,000", posted: "14 min ago" },
  { id: "r2", customer: "Danladi P.", item: "Replacement charger for HP EliteBook 840", budget: "₦10,000–15,000", posted: "1 hr ago" },
  { id: "r3", customer: "Chiamaka N.", item: "100 branded cups for a wedding", budget: "₦45,000", posted: "3 hrs ago" },
];

export const ADMIN_SELLERS = [
  { id: "s1", name: "Bakassi Auto Parts", city: "Jos", docs: "Govt ID + shop photo", status: "pending" },
  { id: "s2", name: "NightOwl Electronics", city: "Jos", docs: "Govt ID only", status: "pending" },
];

export const ADMIN_REQUESTS = [
  { id: "aq1", item: "Vintage Peugeot 504 door handle", age: "6 hrs, no match yet" },
  { id: "aq2", item: "Industrial sewing machine needle #16", age: "2 hrs, 1 seller contacted" },
];

export const MY_ORDERS_SEED = [
  { id: "ORD-4821", item: "Router Backup Mini-UPS", seller: "PowerPoint Electricals", price: 24000, status: "Delivered", date: "12 Aug", canReview: true, reviewed: false },
  { id: "ORD-4790", item: "Mini Endoscope Camera", seller: "TechBase Plateau", price: 15500, status: "Out for delivery", date: "18 Aug", canReview: false, reviewed: false },
  { id: "ORD-4712", item: "Book-Insert Reading Light", seller: "Terra Gadgets", price: 6500, status: "Delivered", date: "2 Aug", canReview: true, reviewed: true, myRating: 5 },
];

export const MY_SAVED_IDS = ["p2", "p7", "p45"];

export const NOTIFICATIONS = [
  { id: "n1", type: "offer", icon: Send, title: "3 sellers responded to your request", body: "Mini UPS for router — compare offers now", time: "12 min ago", unread: true },
  { id: "n2", type: "delivery", icon: Truck, title: "Order out for delivery", body: "ORD-4790 · Mini Endoscope Camera", time: "1 hr ago", unread: true },
  { id: "n3", type: "payment", icon: ShieldCheck, title: "Payment held securely", body: "ORD-4821 · Funds released only after you confirm delivery", time: "yesterday", unread: false },
  { id: "n4", type: "review", icon: Star, title: "How was your order?", body: "Rate PowerPoint Electricals for ORD-4821", time: "yesterday", unread: false },
  { id: "n5", type: "seller", icon: BadgeCheck, title: "Seller verified", body: "Bakassi Auto Parts is now a verified seller near you", time: "2 days ago", unread: false },
];
