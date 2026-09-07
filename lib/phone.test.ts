import { describe, it, expect } from "vitest";
import { normalizeE164, formatPhoneLocal, toTermiiRecipient } from "./phone";

describe("normalizeE164", () => {
  it("converts Nigerian local format (0...) to E.164", () => {
    expect(normalizeE164("08012345678")).toBe("+2348012345678");
  });

  it("strips spaces and punctuation before normalizing", () => {
    expect(normalizeE164("0801 234 5678")).toBe("+2348012345678");
    expect(normalizeE164("0801-234-5678")).toBe("+2348012345678");
  });

  it("collapses every common input format for the same number to one value", () => {
    const variants = ["08012345678", "2348012345678", "+2348012345678", "234 801 234 5678"];
    const normalized = variants.map(normalizeE164);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("+2348012345678");
  });

  it("passes an already-E.164 number from another country through untouched", () => {
    expect(normalizeE164("+14155552671")).toBe("+14155552671");
  });

  it("treats a bare 10-digit number with no leading 0 as Nigerian local", () => {
    expect(normalizeE164("8012345678")).toBe("+2348012345678");
  });
});

describe("formatPhoneLocal", () => {
  it("converts a Nigerian E.164 number back to local display format", () => {
    expect(formatPhoneLocal("+2348012345678")).toBe("08012345678");
  });

  it("falls back to the raw value for a non-Nigerian number", () => {
    expect(formatPhoneLocal("+14155552671")).toBe("+14155552671");
  });
});

describe("toTermiiRecipient", () => {
  it("strips the leading + for Termii's expected recipient format", () => {
    expect(toTermiiRecipient("+2348012345678")).toBe("2348012345678");
  });
});
