import { describe, it, expect } from "vitest";
import { matchesDeclaredImageType } from "./storage";

// NOTE ON SCOPE: uploadProductImage() itself needs a live Supabase project
// (see lib/db.ts's note on why this sandbox can't reach one). What's tested
// here is the part that doesn't need one: the real file-signature check
// that stops a spoofed Content-Type from getting past upload validation —
// see app/api/uploads/route.ts, which trusts this over the client's
// self-reported file.type.

function bytes(...values: number[]): Buffer {
  return Buffer.from(values);
}

describe("matchesDeclaredImageType", () => {
  it("accepts real JPEG/PNG/GIF/WEBP signatures for their matching declared type", () => {
    expect(matchesDeclaredImageType(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg")).toBe(true);
    expect(
      matchesDeclaredImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png")
    ).toBe(true);
    expect(
      matchesDeclaredImageType(Buffer.from("GIF89a", "ascii"), "image/gif")
    ).toBe(true);
    const riffWebp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      bytes(0, 0, 0, 0),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(matchesDeclaredImageType(riffWebp, "image/webp")).toBe(true);
  });

  it("rejects a spoofed Content-Type — real bytes must match what was declared", () => {
    // HTML content wearing an "image/png" label — the classic MIME-spoofing
    // upload attack this check exists to catch.
    const htmlPayload = Buffer.from("<script>alert(1)</script>", "ascii");
    expect(matchesDeclaredImageType(htmlPayload, "image/png")).toBe(false);
  });

  it("rejects a real image whose bytes don't match the declared type (e.g. a PNG labeled as JPEG)", () => {
    const pngBytes = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(matchesDeclaredImageType(pngBytes, "image/jpeg")).toBe(false);
  });

  it("rejects an unrecognized declared type outright", () => {
    expect(matchesDeclaredImageType(bytes(0xff, 0xd8, 0xff), "image/svg+xml")).toBe(false);
  });
});
