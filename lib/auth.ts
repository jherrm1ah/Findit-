import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb, assertNoError } from "./db";
import { ValidationError } from "./repo";
import { normalizeE164 } from "./phone";
import type { AdminRole } from "./adminRoles";
import { ensureDefaultStoreSubscription } from "./subscriptions";

export const SESSION_COOKIE = "findit_session";
const SESSION_DAYS = 30;

export type Role = "buyer" | "seller" | "admin";

export type User = {
  id: string;
  phone: string;
  // Optional — this app is phone-first; most accounts have no email.
  email: string | null;
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
  // Scoped admin sub-role — meaningful only when role === "admin". See
  // lib/adminRoles.ts. Null for every buyer/seller account.
  adminRole: AdminRole | null;
};

type Row = Record<string, unknown>;

function rowToUser(row: Row): User {
  return {
    id: row.id as string,
    phone: row.phone as string,
    email: (row.email as string | null) ?? null,
    name: row.name as string,
    role: row.role as Role,
    businessName: (row.business_name as string | null) ?? null,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    phoneVerified: (row.phone_verified as boolean | null) ?? true,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    notificationsEnabled: (row.notifications_enabled as boolean | null) ?? true,
    adminRole: (row.admin_role as AdminRole | null) ?? null,
  };
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

// Canonical phone normalization for the whole app — see lib/phone.ts for
// the actual rules (E.164, Nigeria-first). Every login/signup/OTP/phone-
// change path goes through this so "08012345678", "2348012345678", and
// "+2348012345678" are always the same account, never three different ones.
export const normalizePhone = normalizeE164;

// Loose but real — this only ever gates what gets stored, never blocks
// login (email isn't a credential here, phone is). Good enough to catch a
// typo without the false-rejection risk of a stricter RFC5322 regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUser(input: {
  phone: string;
  password: string;
  name: string;
  role: Role;
  businessName: string | null;
  phoneVerified: boolean;
  email?: string | null;
}): Promise<User> {
  const db = getDb();
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim() || null;
  if (email && !EMAIL_RE.test(email)) {
    throw new ValidationError("Enter a valid email address, or leave it blank.");
  }

  const existingResult = await db.from("users").select("id").eq("phone", phone).maybeSingle();
  const existing = assertNoError(existingResult, "checking for an existing account") as Row | null;
  if (existing) {
    throw new ValidationError("An account with this phone number already exists.");
  }
  if (email) {
    const existingEmailResult = await db.from("users").select("id").eq("email", email).maybeSingle();
    const existingEmail = assertNoError(existingEmailResult, "checking for an existing account") as Row | null;
    if (existingEmail) {
      throw new ValidationError("An account with this email address already exists.");
    }
  }

  const id = "u_" + crypto.randomBytes(12).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);

  const insertResult = await db.from("users").insert({
    id,
    phone,
    email,
    password_hash: passwordHash,
    password_salt: salt,
    name: input.name,
    role: input.role,
    business_name: input.businessName,
    phone_verified: input.phoneVerified,
  });
  assertNoError(insertResult, "creating account");

  if (input.role === "seller") {
    const sellerId = "seller_" + id;
    const sellerResult = await db.from("sellers").insert({
      id: sellerId,
      user_id: id,
      name: input.businessName || input.name,
      status: "pending",
    });
    assertNoError(sellerResult, "creating seller verification record");
    // Every store starts on Free — see lib/subscriptions.ts. Not fatal if
    // this fails: the first read of the seller's subscription
    // (getSellerSubscription) creates it lazily too, same as it does for
    // stores that existed before this feature did.
    await ensureDefaultStoreSubscription(sellerId).catch((err) =>
      console.error("[auth] couldn't provision default Free subscription", err)
    );
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

// A buyer who decides to start selling. Phone numbers are unique per account,
// so without this the only route was to sign up again with a SECOND phone
// number — which shut out exactly the people most likely to sell: the ones
// already using the app. Lands in the same pending state a seller signup
// does, so an admin still reviews them before they can trade.
export async function becomeSeller(userId: string, businessName: string): Promise<User> {
  const trimmed = businessName.trim();
  if (trimmed.length < 2) {
    throw new ValidationError("Enter the name your customers will see.");
  }
  if (trimmed.length > 80) {
    throw new ValidationError("Please keep the business name under 80 characters.");
  }

  const db = getDb();
  const currentResult = await db.from("users").select("role").eq("id", userId).maybeSingle();
  const current = assertNoError(currentResult, "loading account") as Row | null;
  if (!current) throw new ValidationError("Account not found.");
  if (current.role === "seller") {
    throw new ValidationError("You already have a seller account.");
  }
  if (current.role === "admin") {
    // An admin approves sellers; letting them self-approve muddies that.
    throw new ValidationError("Admin accounts can't also sell — use a separate account for selling.");
  }

  // The verification record comes first: if this insert fails the account
  // keeps its buyer role rather than becoming a seller nobody can review.
  const existingSellerResult = await db.from("sellers").select("id").eq("user_id", userId).maybeSingle();
  const existingSeller = assertNoError(existingSellerResult, "checking seller record") as Row | null;
  const sellerId = "seller_" + userId;
  if (existingSeller) {
    assertNoError(
      await db.from("sellers").update({ name: trimmed, status: "pending" }).eq("user_id", userId),
      "updating seller verification record"
    );
  } else {
    assertNoError(
      await db.from("sellers").insert({
        id: sellerId,
        user_id: userId,
        name: trimmed,
        status: "pending",
      }),
      "creating seller verification record"
    );
  }
  // Every store starts on Free — see lib/subscriptions.ts.
  await ensureDefaultStoreSubscription(sellerId).catch((err) =>
    console.error("[auth] couldn't provision default Free subscription", err)
  );

  assertNoError(
    await db.from("users").update({ role: "seller", business_name: trimmed }).eq("id", userId),
    "switching account to a seller account"
  );

  const row = assertNoError(
    await db.from("users").select("*").eq("id", userId).single(),
    "loading the updated account"
  ) as Row;
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

// Only ever called after the caller has proven phone ownership via OTP
// (see app/api/auth/reset-password/route.ts) — there is no session/current
// password here by design, since the whole point is recovering an account
// whose password was forgotten.
export async function resetPasswordForPhone(phone: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 4) {
    throw new ValidationError("New password must be at least 4 characters.");
  }
  const db = getDb();
  const result = await db
    .from("users")
    .select("id")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();
  const row = assertNoError(result, "loading account") as Row | null;
  if (!row) throw new ValidationError("Account not found.");

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(newPassword, salt);
  const updateResult = await db
    .from("users")
    .update({ password_hash: passwordHash, password_salt: salt })
    .eq("id", row.id as string);
  assertNoError(updateResult, "updating password");
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

// Admin-facing lookup, e.g. for the "promote a teammate to admin" flow —
// find the account behind a phone number before granting anything.
export async function getUserByPhone(phone: string): Promise<User | null> {
  const db = getDb();
  const result = await db
    .from("users")
    .select("*")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();
  const row = assertNoError(result, "looking up account") as Row | null;
  return row ? rowToUser(row) : null;
}

// Grants admin access to an existing account, with a scoped sub-role (see
// lib/adminRoles.ts) — defaults to 'super_admin' (full access) when not
// given, matching this function's original behavior before scoped roles
// existed. Granting admin access at all is gated to super_admin-only at the
// ROUTE level (requireSuperAdmin in lib/adminRoles.ts) — creating a new
// admin is categorically more sensitive than any single permission domain,
// so a lesser admin role must never be able to do it, unlike the old "any
// admin can promote any other account" model this replaces.
export async function promoteToAdmin(phone: string, adminRole: AdminRole = "super_admin"): Promise<User> {
  const user = await getUserByPhone(phone);
  if (!user) {
    throw new ValidationError("No FindIt account exists for that phone number yet.");
  }
  if (user.role === "admin") {
    throw new ValidationError(`${user.name} is already an admin.`);
  }

  const db = getDb();
  const result = await db
    .from("users")
    .update({ role: "admin", previous_role: user.role, admin_role: adminRole })
    .eq("id", user.id)
    .select()
    .single();
  const row = assertNoError(result, "promoting account to admin") as Row;
  return rowToUser(row);
}

// Removes admin access, restoring whatever role the account actually had
// before it was promoted (buyer/seller) — falls back to "buyer" if there's
// no previous_role on file (e.g. an admin created directly via
// scripts/create-admin.mjs, which was never "promoted" from anything).
//
// Two guards a UI confirmation dialog can't substitute for, because they
// protect the *platform*, not just this one action: an admin can never
// demote themselves (self-lockout — always needs a second admin to act),
// and the last remaining SUPER admin can never be demoted. That second
// guard is deliberately about super_admin specifically, not "any admin" —
// promoting/demoting is itself super_admin-only (see requireSuperAdmin in
// lib/adminRoles.ts), so losing the last super_admin would leave FindIt
// with admins who exist but can never create or remove another one, a
// quieter but just as real lockout than having zero admins at all.
export async function demoteFromAdmin(actingAdminId: string, phone: string): Promise<User> {
  const user = await getUserByPhone(phone);
  if (!user) {
    throw new ValidationError("No FindIt account exists for that phone number yet.");
  }
  if (user.role !== "admin") {
    throw new ValidationError(`${user.name} isn't an admin.`);
  }
  if (user.id === actingAdminId) {
    throw new ValidationError("You can't remove your own admin access — ask another admin to do it.");
  }

  const db = getDb();
  if (user.adminRole === "super_admin") {
    const countResult = await db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("admin_role", "super_admin");
    if (countResult.error) {
      throw new Error(`checking super admin count: ${countResult.error.message}`);
    }
    if ((countResult.count ?? 0) <= 1) {
      throw new ValidationError("Can't remove the last Super Admin — promote another Super Admin first.");
    }
  }

  const row = assertNoError(
    await db.from("users").select("previous_role").eq("id", user.id).single(),
    "loading account"
  ) as Row;
  const restoreRole = (row.previous_role as Role | null) ?? "buyer";

  const updateResult = await db
    .from("users")
    .update({ role: restoreRole, previous_role: null, admin_role: null })
    .eq("id", user.id)
    .select()
    .single();
  const updatedRow = assertNoError(updateResult, "removing admin access") as Row;
  return rowToUser(updatedRow);
}

// Real counts for the admin overview — a plain role tally, nothing derived.
export async function getUserCounts(): Promise<{ total: number; buyers: number; sellers: number; admins: number }> {
  const db = getDb();
  const [total, buyers, sellers, admins] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "buyer"),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "seller"),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "admin"),
  ]);
  for (const [label, result] of [["total", total], ["buyers", buyers], ["sellers", sellers], ["admins", admins]] as const) {
    if (result.error) throw new Error(`counting ${label} users: ${result.error.message}`);
  }
  return {
    total: total.count ?? 0,
    buyers: buyers.count ?? 0,
    sellers: sellers.count ?? 0,
    admins: admins.count ?? 0,
  };
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
