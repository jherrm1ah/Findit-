import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";

type Row = Record<string, unknown>;

// The real, admin-editable prohibited-item keyword list — same "admin
// manages a list of configurable rows" pattern as lib/categoryCatalog.ts
// (categories), not a hardcoded array in application code. See migration
// 027 for the table and why severity only has two values.

export type ModerationRuleSeverity = "flag" | "block";

export type ModerationRule = {
  id: string;
  keyword: string;
  reason: string;
  severity: ModerationRuleSeverity;
  active: boolean;
};

function rowToRule(row: Row): ModerationRule {
  return {
    id: row.id as string,
    keyword: row.keyword as string,
    reason: row.reason as string,
    severity: row.severity as ModerationRuleSeverity,
    active: Boolean(row.active),
  };
}

// Used by createProduct/updateProduct on every write — always the live,
// active set, never a cached copy, so a rule an admin just added applies to
// the very next listing submitted.
export async function listActiveModerationRules(): Promise<ModerationRule[]> {
  const db = getDb();
  const result = await db.from("moderation_rules").select("*").eq("active", true);
  const rows = assertNoError(result, "listing active moderation rules") as Row[];
  return rows.map(rowToRule);
}

// Admin-only — includes inactive rules, for the management screen.
export async function listAllModerationRulesForAdmin(): Promise<ModerationRule[]> {
  const db = getDb();
  const result = await db.from("moderation_rules").select("*").order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing all moderation rules") as Row[];
  return rows.map(rowToRule);
}

// Pure — unit-testable without a database. Case-insensitive substring match
// against a listing's combined name + description; returns the first active
// rule that matches, preferring 'block' over 'flag' when both would match,
// since a block is the stronger signal and should never be shadowed by a
// weaker flag rule that happens to come first in the list.
export function findMatchingModerationRule(text: string, rules: ModerationRule[]): ModerationRule | null {
  const haystack = text.toLowerCase();
  let flagMatch: ModerationRule | null = null;
  for (const rule of rules) {
    if (!rule.active) continue;
    const keyword = rule.keyword.trim().toLowerCase();
    if (!keyword || !haystack.includes(keyword)) continue;
    if (rule.severity === "block") return rule;
    if (!flagMatch) flagMatch = rule;
  }
  return flagMatch;
}

function randomId(): string {
  return "mr_" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createModerationRule(input: {
  keyword: string;
  reason: string;
  severity: ModerationRuleSeverity;
}): Promise<ModerationRule> {
  const keyword = input.keyword.trim();
  if (!keyword) throw new ValidationError("A keyword is required.");
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("A reason is required — it's shown to the seller when this rule blocks a listing.");
  if (input.severity !== "flag" && input.severity !== "block") {
    throw new ValidationError("Severity must be flag or block.");
  }

  const db = getDb();
  const result = await db
    .from("moderation_rules")
    .insert({ id: randomId(), keyword, reason, severity: input.severity, active: true })
    .select()
    .single();
  const row = assertNoError(result, "creating moderation rule") as Row;
  return rowToRule(row);
}

const RULE_PATCH_COLUMNS: Record<string, string> = {
  keyword: "keyword",
  reason: "reason",
  severity: "severity",
  active: "active",
};

export async function updateModerationRule(id: string, patch: Partial<Omit<ModerationRule, "id">>): Promise<ModerationRule> {
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = RULE_PATCH_COLUMNS[key];
    if (column) columns[column] = value;
  }
  if (Object.keys(columns).length === 0) {
    throw new ValidationError("No editable fields provided.");
  }
  if (columns.keyword !== undefined && !(columns.keyword as string).trim()) {
    throw new ValidationError("A keyword is required.");
  }
  if (columns.severity !== undefined && columns.severity !== "flag" && columns.severity !== "block") {
    throw new ValidationError("Severity must be flag or block.");
  }
  columns.updated_at = new Date().toISOString();

  const db = getDb();
  const result = await db.from("moderation_rules").update(columns).eq("id", id).select().maybeSingle();
  const row = assertNoError(result, "updating moderation rule") as Row | null;
  if (!row) throw new ValidationError("That moderation rule doesn't exist.");
  return rowToRule(row);
}
