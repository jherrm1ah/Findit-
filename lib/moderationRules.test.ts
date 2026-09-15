import { describe, it, expect } from "vitest";
import { findMatchingModerationRule, type ModerationRule } from "./moderationRules";

// NOTE ON SCOPE: same as lib/repo.test.ts — the DB-touching functions here
// (listActiveModerationRules, listAllModerationRulesForAdmin,
// createModerationRule, updateModerationRule) are covered in
// lib/moderationRules.integration.test.ts against the fake Supabase client.
// findMatchingModerationRule is the pure decision at the heart of the
// feature — what actually gets checked against every listing on every
// create/update — so it's worth testing thoroughly on its own.

function rule(overrides: Partial<ModerationRule> = {}): ModerationRule {
  return { id: "mr_1", keyword: "counterfeit", reason: "Counterfeit goods aren't allowed.", severity: "flag", active: true, ...overrides };
}

describe("findMatchingModerationRule", () => {
  it("returns null when nothing matches", () => {
    expect(findMatchingModerationRule("USB-C cable, brand new", [rule()])).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(findMatchingModerationRule("Genuine COUNTERFEIT sneakers", [rule()])).toEqual(rule());
  });

  it("matches as a substring, not a whole-word match", () => {
    expect(findMatchingModerationRule("counterfeiting is bad", [rule()])).toEqual(rule());
  });

  it("ignores an inactive rule even though its keyword matches", () => {
    expect(findMatchingModerationRule("counterfeit watch", [rule({ active: false })])).toBeNull();
  });

  it("ignores a rule with an empty/whitespace keyword rather than matching everything", () => {
    expect(findMatchingModerationRule("anything at all", [rule({ keyword: "   " })])).toBeNull();
  });

  it("prefers a 'block' match over a 'flag' match even when the flag rule comes first", () => {
    const flagRule = rule({ id: "mr_flag", keyword: "replica", severity: "flag" });
    const blockRule = rule({ id: "mr_block", keyword: "firearm", severity: "block" });
    const result = findMatchingModerationRule("replica firearm parts", [flagRule, blockRule]);
    expect(result?.id).toBe("mr_block");
  });

  it("returns the first flag match when multiple flag rules match and none block", () => {
    const first = rule({ id: "mr_a", keyword: "replica" });
    const second = rule({ id: "mr_b", keyword: "knockoff" });
    const result = findMatchingModerationRule("replica knockoff bag", [first, second]);
    expect(result?.id).toBe("mr_a");
  });

  it("checks the whole passed-in text, so a caller can combine name + description", () => {
    expect(findMatchingModerationRule("Nice bag", [rule({ keyword: "counterfeit" })])).toBeNull();
    expect(findMatchingModerationRule("Nice bag counterfeit leather", [rule({ keyword: "counterfeit" })])).not.toBeNull();
  });
});
