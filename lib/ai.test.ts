import { describe, it, expect } from "vitest";
import { classifyRequest, generateProductDescription } from "./ai";
import { ValidationError } from "./errors";

// Only the length-cap rejection paths — both functions validate BEFORE
// ever touching the GoogleGenAI client (see lib/ai.ts), so these throw
// without needing GEMINI_API_KEY or a mocked client at all. The success
// paths need a real/mocked Gemini call and aren't covered here, same
// "can't exercise the external call in this sandbox" boundary as every
// other third-party-API function in this app (see lib/paystack.ts).

describe("classifyRequest — input validation", () => {
  it("rejects an empty description", async () => {
    await expect(classifyRequest("   ")).rejects.toThrow(ValidationError);
  });

  it("rejects a description over the length cap, before ever calling the AI API", async () => {
    await expect(classifyRequest("x".repeat(2001))).rejects.toThrow(/under 2000/i);
  });

  it("accepts a description right at the cap without throwing on length", async () => {
    // GEMINI_API_KEY isn't set in this sandbox, so this still throws — but
    // with the "isn't configured" error, not the length one, proving the
    // length check itself passed.
    await expect(classifyRequest("x".repeat(2000))).rejects.toThrow(/GEMINI_API_KEY/i);
  });
});

describe("generateProductDescription — input validation", () => {
  it("rejects an empty name", async () => {
    await expect(generateProductDescription({ name: "  ", categoryLabel: "Electronics" })).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects a name over the length cap", async () => {
    await expect(
      generateProductDescription({ name: "x".repeat(201), categoryLabel: "Electronics" })
    ).rejects.toThrow(/product name.*under 200/i);
  });

  it("rejects a color or variation over the length cap", async () => {
    await expect(
      generateProductDescription({ name: "Chair", categoryLabel: "Furniture", color: "x".repeat(61) })
    ).rejects.toThrow(/color.*under 60/i);
    await expect(
      generateProductDescription({ name: "Chair", categoryLabel: "Furniture", variation: "x".repeat(61) })
    ).rejects.toThrow(/variation.*under 60/i);
  });
});
