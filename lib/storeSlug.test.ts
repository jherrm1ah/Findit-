import { describe, it, expect } from "vitest";
import {
  slugifyStoreName,
  storeSlugCandidate,
  isValidSlug,
  isReservedSlug,
  MAX_SLUG_LENGTH,
} from "./storeSlug";

describe("slugifyStoreName", () => {
  it("lowercases and hyphenates an ordinary name", () => {
    expect(slugifyStoreName("ABC Electronics")).toBe("abc-electronics");
  });

  it("collapses runs of spaces and punctuation into one hyphen", () => {
    expect(slugifyStoreName("Ben   Tech  //  Gadgets")).toBe("ben-tech-gadgets");
  });

  it("keeps '&' readable as a word instead of dropping it", () => {
    // "ade-sons" would lose the reading of the name entirely.
    expect(slugifyStoreName("Ade & Sons")).toBe("ade-and-sons");
  });

  it("joins across an apostrophe rather than splitting the word", () => {
    expect(slugifyStoreName("Mama Nkechi's Kitchen")).toBe("mama-nkechis-kitchen");
    expect(slugifyStoreName("Mama Nkechi’s Kitchen")).toBe("mama-nkechis-kitchen");
  });

  it("transliterates accented letters instead of deleting them", () => {
    expect(slugifyStoreName("Adéṣínà Fabrics")).toBe("adesina-fabrics");
  });

  it("handles abbreviations with dots", () => {
    expect(slugifyStoreName("B.T. Electronics")).toBe("b-t-electronics");
  });

  it("trims leading and trailing separators", () => {
    expect(slugifyStoreName("  --Jane Fashion--  ")).toBe("jane-fashion");
  });

  it("returns empty when nothing usable survives, rather than inventing a name", () => {
    expect(slugifyStoreName("🔥🔥🔥")).toBe("");
    expect(slugifyStoreName("   ")).toBe("");
    expect(slugifyStoreName("")).toBe("");
  });

  it("never ends on a hyphen after truncation", () => {
    const long = "Lagos Premium Imported Electronics And Household Appliances Limited";
    const slug = slugifyStoreName(long);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("tolerates a non-string without throwing", () => {
    expect(slugifyStoreName(undefined as never)).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts what slugifyStoreName produces", () => {
    expect(isValidSlug("abc-electronics")).toBe(true);
  });

  it("rejects the shapes a crafted URL segment would use", () => {
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("double--hyphen")).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    expect(isValidSlug("with space")).toBe(false);
    expect(isValidSlug("with/slash")).toBe(false);
    expect(isValidSlug("with%20encoded")).toBe(false);
    expect(isValidSlug("..")).toBe(false);
    expect(isValidSlug("ab")).toBe(false); // too short
    expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
  });
});

describe("storeSlugCandidate", () => {
  it("gives the bare slug on the first attempt", () => {
    expect(storeSlugCandidate("ABC Electronics", 0)).toBe("abc-electronics");
  });

  it("suffixes readably for the two sellers who share a name", () => {
    expect(storeSlugCandidate("Shopera", 1)).toBe("shopera-2");
    expect(storeSlugCandidate("Shopera", 2)).toBe("shopera-3");
  });

  it("uses the provided suffix once the readable ones are exhausted", () => {
    expect(storeSlugCandidate("Shopera", 3, "k4f2")).toBe("shopera-k4f2");
  });

  it("never hands out a reserved segment", () => {
    // A seller really called "Admin" still gets a working store, just not
    // one sitting on a route name.
    const slug = storeSlugCandidate("Admin", 0);
    expect(isReservedSlug(slug)).toBe(false);
    expect(slug).toBe("admin-1");
  });

  it("falls back to a usable slug when the name slugifies to nothing", () => {
    const slug = storeSlugCandidate("🔥🔥🔥", 0);
    expect(isValidSlug(slug)).toBe(true);
    expect(slug).toBe("store-1"); // 'store' is reserved, so it is suffixed
  });

  it("pads a name too short to be a slug on its own", () => {
    const slug = storeSlugCandidate("JJ", 0);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("stays within the length limit even when suffixed", () => {
    const long = "Lagos Premium Imported Electronics And Household Appliances Limited";
    for (const attempt of [0, 1, 2, 5]) {
      const slug = storeSlugCandidate(long, attempt, "abcd");
      expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("always produces something valid for a spread of real-world names", () => {
    const names = [
      "ABC Electronics",
      "Jane Fashion",
      "Ben Tech",
      "Ade & Sons",
      "Mama Nkechi's Kitchen",
      "B.T. Electronics",
      "Adéṣínà Fabrics",
      "Chukwu   Ventures",
      "247 Phones",
      "---",
      "🔥",
      "Store",
      "api",
    ];
    for (const name of names) {
      for (const attempt of [0, 1, 4]) {
        const slug = storeSlugCandidate(name, attempt, "x9");
        expect(isValidSlug(slug), `${name} @${attempt} -> ${slug}`).toBe(true);
        expect(isReservedSlug(slug), `${name} @${attempt} -> ${slug}`).toBe(false);
      }
    }
  });
});
