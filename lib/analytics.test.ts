import { describe, it, expect } from "vitest";
import { bucketCountsByDay, bucketAmountsByDay } from "./analytics";

// NOTE ON SCOPE: same as lib/risk.test.ts — getPlatformAnalytics itself
// needs a real Supabase project and isn't covered here. What's tested is
// the pure day-bucketing logic it builds on.

const NOW = new Date("2026-09-12T15:00:00.000Z");

describe("bucketCountsByDay", () => {
  it("returns one zero-filled bucket per day in the window, oldest first", () => {
    const buckets = bucketCountsByDay([], 3, NOW);
    expect(buckets).toEqual([
      { date: "2026-09-10", count: 0 },
      { date: "2026-09-11", count: 0 },
      { date: "2026-09-12", count: 0 },
    ]);
  });

  it("counts multiple timestamps landing on the same day", () => {
    const buckets = bucketCountsByDay(
      ["2026-09-11T08:00:00.000Z", "2026-09-11T20:00:00.000Z", "2026-09-12T00:00:01.000Z"],
      3,
      NOW
    );
    expect(buckets).toEqual([
      { date: "2026-09-10", count: 0 },
      { date: "2026-09-11", count: 2 },
      { date: "2026-09-12", count: 1 },
    ]);
  });

  it("ignores a timestamp that falls outside the window", () => {
    const buckets = bucketCountsByDay(["2026-08-01T00:00:00.000Z"], 3, NOW);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});

describe("bucketAmountsByDay", () => {
  it("sums amounts landing on the same day instead of counting them", () => {
    const buckets = bucketAmountsByDay(
      [
        { timestamp: "2026-09-11T08:00:00.000Z", amount: 5000 },
        { timestamp: "2026-09-11T20:00:00.000Z", amount: 1500 },
        { timestamp: "2026-09-12T00:00:01.000Z", amount: 2000 },
      ],
      3,
      NOW
    );
    expect(buckets).toEqual([
      { date: "2026-09-10", amount: 0 },
      { date: "2026-09-11", amount: 6500 },
      { date: "2026-09-12", amount: 2000 },
    ]);
  });

  it("zero-fills every day with no paid orders", () => {
    const buckets = bucketAmountsByDay([], 5, NOW);
    expect(buckets.every((b) => b.amount === 0)).toBe(true);
    expect(buckets).toHaveLength(5);
  });
});
