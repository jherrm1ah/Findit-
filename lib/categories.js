// Real category taxonomy for listings — used both server-side (validating a
// new listing's category) and client-side (labels, paired with icons in
// components/findit-app/data.js). Not seed/demo data: this is the fixed set
// of categories the marketplace organizes real listings into.
const CATEGORY_LABELS = {
  reading: "Reading & Book Gadgets",
  tools: "Tools & Repair",
  organization: "Home Organization",
  lighting: "Lighting",
  cleaning: "Cleaning",
  kitchen: "Kitchen",
  bathroom: "Bathroom & Personal Care",
  campus: "Student & Campus",
  travel: "Travel & Everyday Carry",
  phonetech: "Phone & Everyday Tech",
  car: "Car Products",
  power: "Power & Connectivity",
  weird: "Weirdly Useful",
  plant: "Plant & Agriculture",
  desk: "Desk Setup",
};

module.exports = { CATEGORY_LABELS };
