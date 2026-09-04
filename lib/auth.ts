import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "./db";

export const SESSION_COOKIE = "findit_session";
const SESSION_DAYS = 30;

export type Role = "buyer" | "seller";

export type User = {
  id: string;
  phone: string;
  name: string;
  role: Role;
  businessName: string | null;
};

type Row = Record<string, unknown>;

function rowToUser(row: Row): User {
  return {
    id: row.id as string,
    phone: row.phone as string,
    name: row.name as string,
    role: row.role as Role,
    businessName: (row.business_name as string | null) ?? null,
  };
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function createUser(input: {
  phone: string;
  password: string;
  name: string;
  role: Role;
  businessName: string | null;
}): User {
  const db = getDb();
  const phone = normalizePhone(input.phone);
  const existing = db.prepare("SELECT id FROM users WHERE phone = ?").get(phone);
  if (existing) {
    throw new Error("An account with this phone number already exists.");
  }

  const id = "u_" + crypto.randomBytes(12).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);

  db.prepare(
    `INSERT INTO users (id, phone, password_hash, password_salt, name, role, business_name, created_at)
     VALUES (@id, @phone, @passwordHash, @salt, @name, @role, @businessName, @createdAt)`
  ).run({
    id,
    phone,
    passwordHash,
    salt,
    name: input.name,
    role: input.role,
    businessName: input.businessName,
    createdAt: new Date().toISOString(),
  });

  if (input.role === "seller") {
    db.prepare(
      `INSERT INTO sellers (id, name, city, docs, status) VALUES (@id, @name, 'Jos', 'Pending review', 'pending')`
    ).run({ id: "seller_" + id, name: input.businessName || input.name });
  }

  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row);
}

export function verifyLogin(phone: string, password: string): User | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE phone = ?")
    .get(normalizePhone(phone)) as Row | undefined;
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

export function createSession(userId: string): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

export function destroySession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserForToken(token: string | undefined): User | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString()) as Row | undefined;
  return row ? rowToUser(row) : null;
}

export function getSessionUser(req: NextRequest): User | null {
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
