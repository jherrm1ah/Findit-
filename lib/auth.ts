import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb, assertNoError } from "./db";
import { ValidationError } from "./repo";

export const SESSION_COOKIE = "findit_session";
const SESSION_DAYS = 30;

export type Role = "buyer" | "seller" | "admin";

export type User = {
  id: string;
  phone: string;
  name: string;
  role: Role;
  businessName: string | null;
  // Set only once the user has explicitly granted browser geolocation
  // permission on some device (see lib/repo.ts#updateUserLocation). Lets the
  // client skip re-prompting a returning user who already granted it.
  lat: number | null;
  lng: number | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
};

type Row = Record<string, unknown>;

function rowToUser(row: Row): User {
  return {
    id: row.id as string,
    phone: row.phone as string,
    name: row.name as string,
    role: row.role as Role,
    businessName: (row.business_name as string | null) ?? null,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    phoneVerified: (row.phone_verified as boolean | null) ?? true,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    notificationsEnabled: (row.notifications_enabled as boolean | null) ?? true,
  };
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export async function createUser(input: {
  phone: string;
  password: string;
  name: string;
  role: Role;
  businessName: string | null;
  phoneVerified: boolean;
}): Promise<User> {
  const db = getDb();
  const phone = normalizePhone(input.phone);

  const existingResult = await db.from("users").select("id").eq("phone", phone).maybeSingle();
  const existing = assertNoError(existingResult, "checking for an existing account") as Row | null;
  if (existing) {
    throw new ValidationError("An account with this phone number already exists.");
  }

  const id = "u_" + crypto.randomBytes(12).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);

  const insertResult = await db.from("users").insert({
    id,
    phone,
    password_hash: passwordHash,
    password_salt: salt,
    name: input.name,
    role: input.role,
    business_name: input.businessName,
    phone_verified: input.phoneVerified,
  });
  assertNoError(insertResult, "creating account");

  if (input.role === "seller") {
    const sellerResult = await db.from("sellers").insert({
      id: "seller_" + id,
      user_id: id,
      name: input.businessName || input.name,
      status: "pending",
    });
    assertNoError(sellerResult, "creating seller verification record");
  }

  const row = assertNoError(
    await db.from("users").select("*").eq("id", id).single(),
    "loading the account just created"
  ) as Row;
  return rowToUser(row);
}

export async function verifyLogin(phone: string, password: string): Promise<User | null> {
  const db = getDb();
  const result = await db
    .from("users")
    .select("*")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();
  const row = assertNoError(result, "logging in") as Row | null;
  if (!row) return null;

  const candidateHash = hashPassword(password, row.password_salt as string);
  const actualHash = Buffer.from(row.password_hash as string, "hex");
  const candidateBuf = Buffer.from(candidateHash, "hex");
  if (
    actualHash.length !== candidateBuf.length ||
    !crypto.timingSafeEqual(actualHash, candidateBuf)
  ) {
    return null;
  }
  return rowToUser(row);
}

async function verifyPasswordForUserId(userId: string, password: string): Promise<Row> {
  const db = getDb();
  const result = await db.from("users").select("*").eq("id", userId).maybeSingle();
  const row = assertNoError(result, "loading account") as Row | null;
  if (!row) throw new ValidationError("Account not found.");
  const candidateHash = hashPassword(password, row.password_salt as string);
  const actualHash = Buffer.from(row.password_hash as string, "hex");
  const candidateBuf = Buffer.from(candidateHash, "hex");
  if (
    actualHash.length !== candidateBuf.length ||
    !crypto.timingSafeEqual(actualHash, candidateBuf)
  ) {
    throw new ValidationError("Current password is incorrect.");
  }
  return row;
}

export async function updateUserName(userId: string, name: string): Promise<User> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Enter your name.");
  const db = getDb();
  const result = await db.from("users").update({ name: trimmed }).eq("id", userId).select().single();
  const row = assertNoError(result, "updating name") as Row;
  return rowToUser(row);
}

export async function updateSellerBusinessName(userId: string, newName: string): Promise<User> {
  const trimmed = newName.trim();
  if (!trimmed) throw new ValidationError("Enter a business name.");

  const db = getDb();
  const currentResult = await db
    .from("users")
    .select("business_name, role")
    .eq("id", userId)
    .maybeSingle();
  const current = assertNoError(currentResult, "loading account") as Row | null;
  if (!current || current.role !== "seller") {
    throw new ValidationError("Only seller accounts have a business name.");
  }
  const oldName = current.business_name as string | null;

  const updateResult = await db
    .from("users")
    .update({ business_name: trimmed })
    .eq("id", userId)
    .select()
    .single();
  const row = assertNoError(updateResult, "updating business name") as Row;

  // Products, orders, and offers all store the seller's business name as a
  // plain string rather than a foreign key to this user (see the comments
  // on those tables in supabase/schema.sql) — that's the same assumption
  // SellerDashboard's own filtering relies on. So a rename has to be
  // propagated everywhere the old name was copied, or this seller's
  // existing listings/orders would silently stop matching their own
  // dashboard.
  if (oldName && oldName !== trimmed) {
    assertNoError(
      await db.from("sellers").update({ name: trimmed }).eq("user_id", userId),
      "updating seller record"
    );
    assertNoError(
      await db.from("products").update({ seller: trimmed }).eq("seller", oldName),
      "updating product listings"
    );
    assertNoError(
      await db.from("orders").update({ seller: trimmed }).eq("seller", oldName),
      "updating orders"
    );
    assertNoError(
      await db.from("offers").update({ seller: trimmed }).eq("seller", oldName),
      "updating offers"
    );
  }

  return rowToUser(row);
}

export async function updateUserPhone(
  userId: string,
  newPhone: string,
  currentPassword: string
): Promise<User> {
  if (!newPhone || newPhone.trim().length < 10) {
    throw new ValidationError("Enter a valid phone number.");
  }
  await verifyPasswordForUserId(userId, currentPassword);
  const phone = normalizePhone(newPhone);

  const db = getDb();
  const existingResult = await db.from("users").select("id").eq("phone", phone).maybeSingle();
  const existing = assertNoError(existingResult, "checking for an existing account") as Row | null;
  if (existing && existing.id !== userId) {
    throw new ValidationError("Another account already uses this phone number.");
  }

  const result = await db.from("users").update({ phone }).eq("id", userId).select().single();
  const row = assertNoError(result, "updating phone number") as Row;
  return rowToUser(row);
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!newPassword || newPassword.length < 4) {
    throw new ValidationError("New password must be at least 4 characters.");
  }
  await verifyPasswordForUserId(userId, currentPassword);

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(newPassword, salt);
  const db = getDb();
  const result = await db
    .from("users")
    .update({ password_hash: passwordHash, password_salt: salt })
    .eq("id", userId);
  assertNoError(result, "updating password");
}

export async function updateUserAvatar(userId: string, avatarUrl: string): Promise<User> {
  const db = getDb();
  const result = await db
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId)
    .select()
    .single();
  const row = assertNoError(result, "updating profile photo") as Row;
  return rowToUser(row);
}

export async function updateNotificationPref(userId: string, enabled: boolean): Promise<User> {
  const db = getDb();
  const result = await db
    .from("users")
    .update({ notifications_enabled: enabled })
    .eq("id", userId)
    .select()
    .single();
  const row = assertNoError(result, "updating notification preference") as Row;
  return rowToUser(row);
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db
    .from("sessions")
    .insert({ token, user_id: userId, expires_at: expires.toISOString() });
  assertNoError(result, "creating session");
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const result = await getDb().from("sessions").delete().eq("token", token);
  assertNoError(result, "destroying session");
}

export async function getUserForToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const db = getDb();
  const sessionResult = await db
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  const session = assertNoError(sessionResult, "checking session") as Row | null;
  if (!session || new Date(session.expires_at as string) <= new Date()) return null;

  const userResult = await db.from("users").select("*").eq("id", session.user_id).maybeSingle();
  const row = assertNoError(userResult, "loading session user") as Row | null;
  return row ? rowToUser(row) : null;
}

export async function getSessionUser(req: NextRequest): Promise<User | null> {
  return getUserForToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}
