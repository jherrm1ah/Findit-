// Downloads every file in every Supabase Storage bucket into a local folder,
// keeping the bucket/path layout, so the nightly backup workflow can encrypt
// and archive it alongside the database dump.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs <outDir>
//
// Read-only: it lists and downloads, never writes, moves or deletes anything
// in Storage.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!outDir || !url || !key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs <outDir>");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;

// Storage's list() is one folder at a time; entries with no id are folders.
async function* walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) yield* walk(bucket, full);
      else yield full;
    }
    if (data.length < PAGE) return;
  }
}

const { data: buckets, error } = await supabase.storage.listBuckets();
if (error) throw new Error(`listBuckets: ${error.message}`);

let total = 0;
let failed = 0;
for (const bucket of buckets) {
  let count = 0;
  for await (const file of walk(bucket.name)) {
    const { data, error: dlError } = await supabase.storage.from(bucket.name).download(file);
    if (dlError) {
      failed++;
      console.error(`download ${bucket.name}/${file}: ${dlError.message}`);
      continue;
    }
    const dest = path.join(outDir, bucket.name, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await data.arrayBuffer()));
    count++;
  }
  console.log(`${bucket.name}: ${count} files`);
  total += count;
}
console.log(`Storage backup: ${total} files, ${failed} failed`);
// A few failed downloads shouldn't throw away the whole night's backup, but
// a run where most of them fail means something is wrong and should go red.
if (failed > 0 && failed >= total) process.exit(1);
