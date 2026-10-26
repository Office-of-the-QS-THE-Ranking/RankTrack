/*
 * Lets browsers on the Hub's sites PUT pictures to the R2 bucket through presigned URLs. Run once per bucket,
 * and again whenever a site origin changes:
 *
 *   node --env-file=.env.local scripts/r2/cors.mjs https://hub.example.edu
 *
 * Local dev origins (localhost:3000 and :3100) are always included. Changing bucket settings needs an R2 token
 * with Admin Read & Write; the app's Object Read & Write token is refused. Or paste the same rule in the
 * dashboard: R2 › bucket › Settings › CORS Policy.
 */
import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PRIVATE_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PRIVATE_BUCKET) throw new Error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PRIVATE_BUCKET.");

const origins = ["http://localhost:3000", "http://localhost:3100", ...process.argv.slice(2).map((o) => new URL(o).origin)];
const body = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration><CORSRule>${origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join("")}<AllowedMethod>PUT</AllowedMethod><AllowedHeader>content-type</AllowedHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;

const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const res = await client.fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_PRIVATE_BUCKET}?cors`, {
  method: "PUT",
  headers: { "Content-Type": "application/xml", "Content-MD5": createHash("md5").update(body).digest("base64") },
  body,
});
if (!res.ok) throw new Error(`CORS update failed (${res.status}): ${await res.text()}`);
console.log(`CORS set on ${R2_PRIVATE_BUCKET} for: ${origins.join(", ")}`);
