import { describe, it, expect } from "vitest";
import { slugify } from "./categoryCatalog";

// NOTE ON SCOPE: same as lib/subscriptions.test.ts — the DB-touching
// functions here (listCategories, isValidCategoryKey, createCategory,
// updateCategory) need a real Supabase project and aren't covered here.
// slugify is the one pure piece: what id createCategory would derive from
// an admin-typed label.

describe("slugify", () => {
  it("lowercases and joins words with underscores", () => {
    expect(slugify("Home Organization")).toBe("home_organization");
  });

  it("strips punctuation, collapsing it to a single separator", () => {
    expect(slugify("Bathroom & Personal Care")).toBe("bathroom_personal_care");
  });

  it("trims leading/trailing separators left over from punctuation at the edges", () => {
    expect(slugify("  -Weirdly Useful!-  ")).toBe("weirdly_useful");
  });

  it("produces an empty string for a label with no letters or digits — the caller rejects this", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("keeps digits", () => {
    expect(slugify("Under ₦2000")).toBe("under_2000");
  });
});
