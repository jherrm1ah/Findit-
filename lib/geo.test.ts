import { describe, it, expect } from "vitest";
import { haversineKm, formatDistanceKm } from "./geo";

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineKm(9.8965, 8.8583, 9.8965, 8.8583)).toBe(0);
  });

  it("computes a known real-world distance within reasonable tolerance", () => {
    // Jos, Plateau (~9.8965, 8.8583) to Abuja (~9.0765, 7.3986): ~172km real
    // road distance, ~165km great-circle — this is a test-time sanity check,
    // not a hardcoded production location (see supabase/migrations for why
    // no city is ever hardcoded in the app itself).
    const km = haversineKm(9.8965, 8.8583, 9.0765, 7.3986);
    expect(km).toBeGreaterThan(150);
    expect(km).toBeLessThan(190);
  });

  it("is symmetric", () => {
    const a = haversineKm(6.5244, 3.3792, 6.4550, 3.3841);
    const b = haversineKm(6.4550, 3.3841, 6.5244, 3.3792);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("formatDistanceKm", () => {
  it("rounds to whole kilometers and floors small distances", () => {
    expect(formatDistanceKm(0.4)).toBe("under 1 km away");
    expect(formatDistanceKm(2.6)).toBe("3 km away");
    expect(formatDistanceKm(15)).toBe("15 km away");
  });
});
