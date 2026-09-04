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
