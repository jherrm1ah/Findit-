import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

export async function uploadProductImage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const supabase = getSupabase();
  await ensureBucket(supabase);

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
