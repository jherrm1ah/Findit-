import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "./repo";

const BUCKET = "product-images";

let client: SupabaseClient | null = null;
let bucketEnsured = false;

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Image uploads aren't configured yet (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// Creates the bucket on first use so there's no manual dashboard setup step,
// the same way lib/db.ts creates tables on first use.
async function ensureBucket(supabase: SupabaseClient) {
  if (bucketEnsured) return;
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "5MB",
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(createError.message);
    }
  }
  bucketEnsured = true;
}

// Real file-signature ("magic bytes") checks — the multipart Content-Type a
// client sends is just a string it typed; nothing stops a request claiming
// "image/png" while the bytes are actually an HTML/script payload. This
// checks what the file's first bytes actually are, independent of whatever
// the client declared, so a spoofed Content-Type can't get past validation.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/gif": (b) =>
    b.length >= 6 &&
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  "image/webp": (b) =>
    b.length >= 12 &&
    b.subarray(0, 4).toString("ascii") === "RIFF" &&
    b.subarray(8, 12).toString("ascii") === "WEBP",
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function matchesDeclaredImageType(buffer: Buffer, declaredType: string): boolean {
  const check = SIGNATURES[declaredType];
  return check ? check(buffer) : false;
}

export async function uploadProductImage(
  buffer: Buffer,
  declaredType: string
): Promise<string> {
  if (!matchesDeclaredImageType(buffer, declaredType)) {
    throw new ValidationError("That file doesn't look like a valid image.");
  }

  const supabase = getSupabase();
  await ensureBucket(supabase);

  // The stored path never uses the client-supplied filename at all — only a
  // random id plus an extension WE choose from the verified type. This
  // rules out path traversal, dangerous filenames (e.g. a double extension
  // like "photo.jpg.html"), and any filename-based trickery entirely.
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${EXTENSIONS[declaredType]}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: declaredType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
