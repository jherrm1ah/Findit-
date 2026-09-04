import { describe, it, expect } from "vitest";
import { createUser, verifyLogin, normalizePhone } from "./auth";

let seq = 0;
function uniquePhone() {
  seq += 1;
  return `0803${String(1000000 + seq).padStart(7, "0")}`;
}

describe("normalizePhone", () => {
  it("strips spaces and punctuation but keeps a leading +", () => {
    expect(normalizePhone("080 123 4567")).toBe("0801234567");
    expect(normalizePhone("+234 803 000 0000")).toBe("+2348030000000");
  });
});

describe("createUser / verifyLogin", () => {
  it("creates a buyer and logs them in with the right password", () => {
    const phone = uniquePhone();
    const user = createUser({
      phone,
      password: "correcthorse",
      name: "Test Buyer",
      role: "buyer",
      businessName: null,
    });
    expect(user.role).toBe("buyer");
    expect(user.phone).toBe(normalizePhone(phone));

    const loggedIn = verifyLogin(phone, "correcthorse");
    expect(loggedIn).not.toBeNull();
    expect(loggedIn?.id).toBe(user.id);
  });

  it("rejects a wrong password", () => {
    const phone = uniquePhone();
    createUser({
      phone,
      password: "correcthorse",
      name: "Test Buyer 2",
      role: "buyer",
      businessName: null,
    });
    expect(verifyLogin(phone, "wrongpassword")).toBeNull();
  });

  it("rejects login for a phone that was never registered", () => {
    expect(verifyLogin(uniquePhone(), "whatever")).toBeNull();
  });

  it("refuses to create a second account with the same phone", () => {
    const phone = uniquePhone();
    createUser({ phone, password: "pw12345", name: "First", role: "buyer", businessName: null });
    expect(() =>
      createUser({ phone, password: "pw12345", name: "Second", role: "buyer", businessName: null })
    ).toThrow();
  });

  it("creates a seller with a business name and a pending seller row", () => {
    const phone = uniquePhone();
    const user = createUser({
      phone,
      password: "pw12345",
      name: "Test Seller",
      role: "seller",
      businessName: "Test Business " + phone,
    });
    expect(user.role).toBe("seller");
    expect(user.businessName).toBe("Test Business " + phone);
  });
});
