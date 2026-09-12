import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";

type Row = Record<string, unknown>;

// A real admin-initiated announcement — reuses the exact same
// notifications table and per-user notifications_enabled preference every
// other real notification in this app already writes to/respects (see
// lib/repo.ts#createNotification). Never a new delivery mechanism: a
// recipient sees this exactly where they already see every other
// notification.

export type BroadcastAudience = "all" | "buyers" | "sellers";

const AUDIENCE_ROLES: Record<BroadcastAudience, string[]> = {
  all: ["buyer", "seller"],
  buyers: ["buyer"],
  sellers: ["seller"],
};

export type BroadcastResult = {
  audience: BroadcastAudience;
  recipientCount: number;
};

function randomNotificationId(seed: number, index: number): string {
  return "n_" + seed.toString(36) + index.toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function sendBroadcast(title: string, body: string, audience: BroadcastAudience): Promise<BroadcastResult> {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle) throw new ValidationError("Give the announcement a title.");
  if (!cleanBody) throw new ValidationError("Write what you want to tell them.");

  const roles = AUDIENCE_ROLES[audience];
  if (!roles) throw new ValidationError("That's not a real audience.");

  const db = getDb();
  const usersResult = await db.from("users").select("id").in("role", roles).eq("notifications_enabled", true);
  const rows = assertNoError(usersResult, "loading broadcast recipients") as Row[];

  if (rows.length === 0) {
    return { audience, recipientCount: 0 };
  }

  const seed = Date.now();
  const notifications = rows.map((r, i) => ({
    id: randomNotificationId(seed, i),
    user_id: r.id as string,
    type: "admin_broadcast",
    title: cleanTitle,
    body: cleanBody,
  }));

  const insertResult = await db.from("notifications").insert(notifications);
  assertNoError(insertResult, "sending broadcast");

  return { audience, recipientCount: notifications.length };
}
