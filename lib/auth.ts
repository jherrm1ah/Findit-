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
  // Platform-level suspension (see migration 015) — independent of a
  // seller's own status. getSessionUser never actually returns a suspended
  // user (see getUserForToken below), so in practice these only ever show
  // up in the admin user-management list, not on a live session.
  suspended: boolean;
  suspendedReason: string | null;
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
    suspended: Boolean(row.suspended),
    suspendedReason: (row.suspended_reason as string | null) ?? null,
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

// Any fixed value works — it isn't protecting anything, it just gives
// hashPassword a real salt-shaped input to run scrypt against below, so a
// login for a phone number with no account costs the same CPU time as one
// for a real account with a wrong password. Without this, an attacker who
// can measure response time could tell "no such account" apart from "wrong
// password" even though both return the identical error message.
const DUMMY_SALT_FOR_TIMING = "findit_no_such_account_dummy_salt";

export async function verifyLogin(phone: string, password: string): Promise<User | null> {
  const db = getDb();
  const result = await db
    .from("users")
    .select("*")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();
  const row = assertNoError(result, "logging in") as Row | null;
  if (!row) {
    hashPassword(password, DUMMY_SALT_FOR_TIMING);
    return null;
  }

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

// Destroys every OTHER active session for this account — called after a
// password change/reset so a stolen session cookie doesn't just keep
// working through the exact security action meant to lock an attacker
// out. `exceptToken` keeps the caller's own current session alive (a
// logged-in user changing their own password from their own device
// shouldn't be logged out by doing so); the forgot-password recovery flow
// has no current session to except, so it clears all of them.
async function destroyOtherSessions(userId: string, exceptToken?: string): Promise<void> {
  const db = getDb();
  let query = db.from("sessions").delete().eq("user_id", userId);
  if (exceptToken) query = query.neq("token", exceptToken);
  const result = await query;
  assertNoError(result, "invalidating other sessions");
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentToken?: string
): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters.");
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
  await destroyOtherSessions(userId, currentToken);
}

// Only ever called after the caller has proven phone ownership via OTP
// (see app/api/auth/reset-password/route.ts) — there is no session/current
// password here by design, since the whole point is recovering an account
// whose password was forgotten.
export async function resetPasswordForPhone(phone: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters.");
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
  // No current session to except here (this is the "I'm locked out"
  // recovery path) — and this is exactly the scenario where an attacker
  // holding a stolen session is most likely, so clear all of them.
  await destroyOtherSessions(row.id as string);
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
export async function getUserCounts(): Promise<{ total: number; buyers: number; sellers: number; admins: number; suspended: number }> {
  const db = getDb();
  const [total, buyers, sellers, admins, suspended] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "buyer"),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "seller"),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "admin"),
    db.from("users").select("id", { count: "exact", head: true }).eq("suspended", true),
  ]);
  for (const [label, result] of [["total", total], ["buyers", buyers], ["sellers", sellers], ["admins", admins], ["suspended", suspended]] as const) {
    if (result.error) throw new Error(`counting ${label} users: ${result.error.message}`);
  }
  return {
    total: total.count ?? 0,
    buyers: buyers.count ?? 0,
    sellers: sellers.count ?? 0,
    admins: admins.count ?? 0,
    suspended: suspended.count ?? 0,
  };
}

export type AdminUserListItem = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  businessName: string | null;
  suspended: boolean;
  suspendedReason: string | null;
  createdAt: string;
};

const ADMIN_USERS_PAGE_SIZE = 20;

// The real "browse every account" screen behind the admin Users tab — the
// existing users/lookup route only ever finds one exact phone number, which
// is fine for "look up this specific account" but useless for "show me
// every suspended account" or "who signed up this week." Search terms have
// commas/parens stripped before going into the filter string below: an
// admin is already authorized to see every row here regardless (there's no
// privilege boundary this could cross), but a stray comma would otherwise
// just break the admin's own search with a confusing filter-syntax error.
export async function listUsersForAdmin(input: {
  role?: Role;
  search?: string;
  page?: number;
}): Promise<{ users: AdminUserListItem[]; page: number; totalPages: number; total: number }> {
  const db = getDb();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const from = (page - 1) * ADMIN_USERS_PAGE_SIZE;
  const to = from + ADMIN_USERS_PAGE_SIZE - 1;

  let query = db
    .from("users")
    .select("id, name, phone, role, business_name, suspended, suspended_reason, created_at", { count: "exact" });
  if (input.role) query = query.eq("role", input.role);
  const term = input.search?.trim().replace(/[,()]/g, "");
  if (term) {
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const result = await query.order("created_at", { ascending: false }).range(from, to);
  const rows = assertNoError(result, "listing users") as Row[];
  const total = result.count ?? 0;

  return {
    users: rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      phone: row.phone as string,
      role: row.role as Role,
      businessName: (row.business_name as string | null) ?? null,
      suspended: Boolean(row.suspended),
      suspendedReason: (row.suspended_reason as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE)),
    total,
  };
}

// Platform-level suspension — restricts using the account at all, unlike
// a seller's own status (which only restricts selling). Takes effect
// immediately (see getUserForToken above), not just on the account's next
// login. Self-suspension is blocked so an admin can never lock themselves
// out this way; that in turn means suspending another admin can never
// strand the platform with zero usable admins, since the actor always
// keeps their own access.
export async function suspendUser(id: string, reason: string, actingAdminId: string): Promise<User> {
  if (!reason?.trim()) {
    throw new ValidationError("Give a reason — never a silent suspension.");
  }
  if (id === actingAdminId) {
    throw new ValidationError("You can't suspend your own account.");
  }
  const db = getDb();
  const result = await db
    .from("users")
    .update({ suspended: true, suspended_reason: reason.trim(), suspended_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "suspending account") as Row | null;
  if (!row) throw new ValidationError("Account not found.");
  return rowToUser(row);
}

export async function reactivateUser(id: string): Promise<User> {
  const db = getDb();
  const result = await db
    .from("users")
    .update({ suspended: false, suspended_reason: null, suspended_at: null })
    .eq("id", id)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "reactivating account") as Row | null;
  if (!row) throw new ValidationError("Account not found.");
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
  if (!row) return null;
  // A suspended account is treated as logged out immediately — not just
  // blocked from a future login — so suspending an account takes effect on
  // its very next request, not whenever it happens to log in again. The
  // session row itself is left alone: reactivating restores this same
  // session rather than forcing a fresh login.
  if (row.suspended) return null;
  return rowToUser(row);
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

/* -------------------------------------------------------------------------- */
/*  Staff sign-in — step-up authentication for the Admin Queue                 */
/* -------------------------------------------------------------------------- */

// Holding a session for an account whose role is 'admin' is deliberately NOT
// enough to reach an admin route. The staff screen re-verifies the password
// and stamps sessions.admin_unlocked_at (migration 020); requireAdmin then
// refuses anything older than this window. A session lasts 30 days — an
// admin capability should not.
const DEFAULT_ADMIN_UNLOCK_MINUTES = 60;

// The unlock slides forward while an admin is actually working, so nobody is
// thrown out mid-review. Writing that on every single admin request would be
// a database write per read, so the stamp is only refreshed once it's this
// old — the window is measured in tens of minutes, so a few minutes of drift
// costs nothing.
const ADMIN_UNLOCK_REFRESH_AFTER_MS = 5 * 60 * 1000;

export function adminUnlockMinutes(): number {
  const raw = Number(process.env.ADMIN_UNLOCK_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ADMIN_UNLOCK_MINUTES;
}

// Pure, so the expiry rule itself is unit-testable without a database or a
// request. Anything unparseable is treated as locked rather than unlocked —
// a corrupt timestamp must never grant access.
export function isUnlockFresh(unlockedAt: string | Date | null, now: Date = new Date()): boolean {
  if (!unlockedAt) return false;
  const stamped = unlockedAt instanceof Date ? unlockedAt : new Date(unlockedAt);
  const ms = stamped.getTime();
  if (!Number.isFinite(ms)) return false;
  const age = now.getTime() - ms;
  // A stamp from the future is as suspect as a corrupt one.
  if (age < 0) return false;
  return age < adminUnlockMinutes() * 60 * 1000;
}

export function sessionTokenFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}

export async function unlockAdminSession(token: string): Promise<void> {
  const result = await getDb()
    .from("sessions")
    .update({ admin_unlocked_at: new Date().toISOString() })
    .eq("token", token);
  assertNoError(result, "starting admin session");
}

// Leaving admin mode clears only the unlock — the person stays logged in as
// themselves, exactly like stepping out of an admin area rather than out of
// the app.
export async function lockAdminSession(token: string): Promise<void> {
  const result = await getDb()
    .from("sessions")
    .update({ admin_unlocked_at: null })
    .eq("token", token);
  assertNoError(result, "leaving admin session");
}

// Reads the unlock stamp for this request's session and slides it forward if
// it's still valid. Returns false for a missing cookie, an unknown session,
// or a stamp outside the window.
export async function isAdminSessionUnlocked(req: NextRequest): Promise<boolean> {
  const token = sessionTokenFromRequest(req);
  if (!token) return false;

  const result = await getDb()
    .from("sessions")
    .select("admin_unlocked_at")
    .eq("token", token)
    .maybeSingle();

  // 42703 = undefined_column: migration 020 hasn't been applied to this
  // database. Fail CLOSED (no admin access) but say so plainly — migrations
  // here are applied by hand, and the failure this produced otherwise was a
  // generic 500 on every admin route with nothing pointing at the cause.
  // See scripts/check-schema.mjs, which catches this before a deploy.
  if (result.error?.code === "42703") {
    console.error(
      "[admin-session] sessions.admin_unlocked_at is missing — apply supabase/migrations/020_admin_session_unlock.sql. Admin access stays closed until then."
    );
    return false;
  }

  const row = assertNoError(result, "checking admin session") as Row | null;
  if (!row) return false;

  const unlockedAt = (row.admin_unlocked_at as string | null) ?? null;
  if (!isUnlockFresh(unlockedAt)) return false;

  if (unlockedAt && Date.now() - new Date(unlockedAt).getTime() > ADMIN_UNLOCK_REFRESH_AFTER_MS) {
    await unlockAdminSession(token);
  }
  return true;
}
