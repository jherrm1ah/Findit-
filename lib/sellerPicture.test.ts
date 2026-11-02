import { describe, it, expect } from "vitest";
import { publicSellerPicture } from "./sellerPicture";

describe("publicSellerPicture — what buyers see for a seller", () => {
  it("the store logo when the seller has set one", () => {
    expect(publicSellerPicture("https://x.supabase.co/logo.png", "https://x.supabase.co/me.jpg")).toBe("https://x.supabase.co/logo.png");
  });
  it("otherwise their profile photo (the bug: this used to be ignored)", () => {
    expect(publicSellerPicture(null, "https://x.supabase.co/me.jpg")).toBe("https://x.supabase.co/me.jpg");
  });
  it("nothing when they have neither", () => {
    expect(publicSellerPicture(null, null)).toBeNull();
    expect(publicSellerPicture("  ", undefined)).toBeNull();
  });
});
