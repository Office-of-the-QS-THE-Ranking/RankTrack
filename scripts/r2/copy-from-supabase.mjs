/*
 * One-off: copies every picture from the old Supabase Storage bucket (hub-media) into R2 under the same keys,
 * so /media/… links already saved in posts and unit logos keep working. Safe to run again; it overwrites.
 * Public copies follow on their own: the hourly media sweep (or the first view) copies them to the public bucket.
 *
 *   node --env-file=.env.local scripts/r2/copy-from-supabase.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

const env = process.env;
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET"]) {
  if (!env[name]) throw new Error(`Set ${name}.`);
}
const bucket = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }).storage.from("hub-media");
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });

let copied = 0;
for (const folder of ["posts", "emblems"]) {
  const { data: listed, error } = await bucket.list(folder, { limit: 1000 });
  if (error) {
    console.warn(`${folder}: ${error.message}`);
    continue;
  }
  for (const file of listed.filter((f) => f.id)) {
    const key = `${folder}/${file.name}`;
    const { data: blob, error: readError } = await bucket.download(key);
    if (readError) throw new Error(`${key}: ${readError.message}`);
    const res = await r2.fetch(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_PRIVATE_BUCKET}/${key}`, {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    if (!res.ok) throw new Error(`${key}: R2 answered ${res.status}`);
    copied++;
  }
}
console.log(`Copied ${copied} files to R2 bucket ${env.R2_PRIVATE_BUCKET}.`);
