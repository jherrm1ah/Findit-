/* Server-side product catalogue + deterministic listing generation.
   Category labels/icons live client-side in components/findit-app/data.js
   (icons are React components); this file only needs the category keys. */

const CATALOGUE = {
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

const FIRST_20_TEST = new Set([
  "Book-insert reading light","Neck reading light","Mini endoscope camera","Magnetic wristband",
  "Digital measuring tape","Laser distance meter","Mini electric screwdriver","Rechargeable work light",
  "Under-bed motion-sensor light","Mini bag sealer","Electric fabric shaver","Keyboard cleaning kit",
  "Foldable laptop stand","Router backup battery","USB-C hub","Portable tire inflator",
  "Car diagnostic scanner","Mini thermal printer","Mini UPS for router",
]);

const MARKETING_PICKS = {
  "Book-insert reading light": "problemsolver",
  "Mini UPS for router": "hardtofind",
  "Mini endoscope camera": "trending",
  "Digital tire-pressure gauge": "problemsolver",
  "Foldable laptop stand": "trending",
  "Rechargeable clip-on book light": "hardtofind",
};

const SELLERS = [
  "Terra Gadgets", "PowerPoint Electricals", "TechBase Traders", "AutoFix Parts",
  "Campus Essentials", "Metro Tech Hub", "QuickFix Gadgets", "CityLine Home Store",
  "Rayfield Traders", "Farin Gada Wholesale", "Swift Repairs & Parts", "Central Market Direct",
];

// A first slice of Nigerian cities FindIt is live in — Jos is the pilot city,
// not the whole product, so seed listings span a spread of them, with more
// added as the marketplace grows nationally.
const CITIES = [
  "Jos", "Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", "Enugu", "Kaduna",
];

const ART_COUNT = 5;

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildProductRows() {
  const out = [];
  let n = 1;
  Object.entries(CATALOGUE).forEach(([groupKey, items]) => {
    items.forEach((name) => {
      const h = hashStr(name + groupKey);
      out.push({
        id: `p${n++}`,
        name,
        category: groupKey,
        price: 2800 + (h % 46) * 650,
        seller: SELLERS[h % SELLERS.length],
        rating: Number((3.9 + (h % 10) / 10).toFixed(1)),
        verified: h % 3 !== 0,
        testBatch: FIRST_20_TEST.has(name),
        marketingCat: MARKETING_PICKS[name] || null,
        loc: CITIES[h % CITIES.length],
        art: h % ART_COUNT,
      });
    });
  });
  return out;
}

module.exports = { CATALOGUE, SELLERS, FIRST_20_TEST, MARKETING_PICKS, buildProductRows };
