import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "crypto";
import { assertPasswordAllowed, timesPasswordBreached } from "./passwordCheck";

const suffixOf = (pw: string) => crypto.createHash("sha1").update(pw).digest("hex").toUpperCase().slice(5);

afterEach(() => vi.unstubAllGlobals());

describe("breached-password check", () => {
  it("sends only the first 5 characters of the hash and finds a match", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(`0000000000000000000000000000000000A:0\r\n${suffixOf("password123")}:42`));
    vi.stubGlobal("fetch", fetchMock);
    expect(await timesPasswordBreached("password123")).toBe(42);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
    expect(url).not.toContain("password123");
  });

  it("refuses a leaked password and allows an unknown one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`${suffixOf("password123")}:42`)));
    await expect(assertPasswordAllowed("password123")).rejects.toThrow(/data leak/);
    await expect(assertPasswordAllowed("a-very-unusual-findit-pass-91")).resolves.toBeUndefined();
  });

  it("still enforces 8 characters, and lets passwords through if the check is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(assertPasswordAllowed("short")).rejects.toThrow(/at least 8/);
    await expect(assertPasswordAllowed("long-enough-pass")).resolves.toBeUndefined();
  });
});
