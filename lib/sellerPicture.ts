import type { SupabaseClient } from "@supabase/supabase-js";

// The picture other people see for a seller: their store logo when they've set one (a Store-plan
// branding choice), otherwise the profile photo they uploaded to their account. Before this, only
// the store logo was ever shown publicly, so a seller who changed their profile photo saw it on
// their own Profile but buyers never did.
export function publicSellerPicture(logoUrl: string | null | undefined, avatarUrl: string | null | undefined): string | null {
  return (logoUrl && String(logoUrl).trim()) || (avatarUrl && String(avatarUrl).trim()) || null;
}

// users.avatar_url for a set of user ids, in one query. Missing users simply aren't in the map.
export async function avatarsByUserId(db: SupabaseClient, userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const result = await db.from("users").select("id, avatar_url").in("id", ids);
  if (result.error) throw new Error(`loading profile photos: ${result.error.message}`);
  for (const row of (result.data ?? []) as Array<{ id: string; avatar_url: string | null }>) {
    if (row.avatar_url) map.set(row.id, row.avatar_url);
  }
  return map;
}
