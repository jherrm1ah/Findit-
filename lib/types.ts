export const SCORE_FIELDS = [
  { key: "localDifficulty", label: "Local Difficulty", hint: "5 = very hard to find locally" },
  { key: "problemStrength", label: "Problem Strength", hint: "5 = solves a real pain" },
  { key: "visualDemoPotential", label: "Visual Demo Potential", hint: "5 = great to film" },
  { key: "shippingSimplicity", label: "Shipping Simplicity", hint: "5 = easy/cheap to ship" },
  { key: "durability", label: "Durability", hint: "5 = very durable" },
  { key: "profitMargin", label: "Profit Margin", hint: "5 = high margin" },
  { key: "repeatDemand", label: "Repeat Demand", hint: "5 = high repeat purchase" },
  { key: "qcEase", label: "QC Ease", hint: "5 = easy to quality-check" },
  { key: "returnSafety", label: "Return Safety", hint: "5 = low return risk" },
  { key: "legalSafety", label: "Legal/Safety", hint: "5 = low legal & safety risk" },
] as const;

export type ScoreField = (typeof SCORE_FIELDS)[number]["key"];

export const STATUS_VALUES = [
  "idea",
  "testing",
  "ordered",
  "launched",
  "killed",
] as const;

export type Status = (typeof STATUS_VALUES)[number];

export type ScoreMap = Partial<Record<ScoreField, number | null>>;

export type Product = {
  id: number;
  num: number;
  category: string;
  name: string;
  testBatch: boolean;
  status: Status;
  supplierUrl: string | null;
  notes: string | null;
} & Record<ScoreField, number | null>;

export type CategorySummary = {
  category: string;
  productCount: number;
  testBatchCount: number;
  avgPriorityScore: number | null;
  statusCounts: Record<Status, number>;
};

export function computePriorityScore(product: Product | ScoreMap): number | null {
  const values = SCORE_FIELDS.map((f) => product[f.key]).filter(
    (v): v is number => typeof v === "number"
  );
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}
