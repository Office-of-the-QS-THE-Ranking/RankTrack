import "server-only";

/*
 * Cloudflare R2, reached through its S3-compatible API with a token for the Hub's two buckets: "private" holds
 * every upload and everything internal to the portal; "public" holds copies of what the public website may show,
 * served from R2_PUBLIC_URL. Requests are signed here with aws4fetch; the browser only ever sees a presigned URL
 * for one object.
 */
import { AwsClient } from "aws4fetch";

export type Bucket = "private" | "public";

type R2 = { client: AwsClient; endpoint: string; buckets: Record<Bucket, string> };

const g = globalThis as typeof globalThis & { __hubR2?: R2 };

function r2(): R2 {
  if (g.__hubR2) return g.__hubR2;
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_PRIVATE_BUCKET: priv, R2_PUBLIC_BUCKET: pub } = process.env;
  if (!account || !accessKeyId || !secretAccessKey || !priv || !pub) throw new Error("R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PRIVATE_BUCKET and R2_PUBLIC_BUCKET.");
  return (g.__hubR2 = {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    buckets: { private: priv, public: pub },
  });
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");
const objectUrl = (bucket: Bucket, key: string) => `${r2().endpoint}/${r2().buckets[bucket]}/${encodeKey(key)}`;

/** Where the public bucket is served (its r2.dev address or custom domain), or null when none is set. */
export function publicUrl(key: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  return base ? `${base}/${encodeKey(key)}` : null;
}

/** A URL the browser can PUT one file to in the private bucket, for `seconds`. The Content-Type is part of the signature, so it must match. */
export async function presignPut(key: string, contentType: string, seconds: number) {
  const url = new URL(objectUrl("private", key));
  url.searchParams.set("X-Amz-Expires", String(seconds));
  const signed = await r2().client.sign(new Request(url, { method: "PUT", headers: { "Content-Type": contentType } }), { aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}

export async function getObject(bucket: Bucket, key: string): Promise<Blob | null> {
  const res = await r2().client.fetch(objectUrl(bucket, key));
  if (!res.ok) return null;
  return new Blob([await res.arrayBuffer()], { type: res.headers.get("Content-Type") ?? "application/octet-stream" });
}

export async function hasObject(bucket: Bucket, key: string) {
  return (await r2().client.fetch(objectUrl(bucket, key), { method: "HEAD" })).ok;
}

/** Copy an object between buckets inside R2, keeping its key and Content-Type. */
export async function copyObject(key: string, from: Bucket, to: Bucket) {
  const res = await r2().client.fetch(objectUrl(to, key), { method: "PUT", headers: { "x-amz-copy-source": `/${r2().buckets[from]}/${encodeKey(key)}` } });
  if (!res.ok) throw new Error(`R2 copy ${key} ${from}→${to}: ${res.status}`);
}

export async function deleteObject(bucket: Bucket, key: string) {
  const res = await r2().client.fetch(objectUrl(bucket, key), { method: "DELETE" });
  // R2 answers 204 whether or not the object existed.
  if (!res.ok) throw new Error(`R2 delete ${key}: ${res.status}`);
}

/** Up to 1,000 objects under a prefix, in key order. */
export async function listObjects(bucket: Bucket, prefix: string): Promise<{ key: string; modified: number }[]> {
  const url = new URL(`${r2().endpoint}/${r2().buckets[bucket]}`);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("prefix", prefix);
  const res = await r2().client.fetch(url);
  if (!res.ok) throw new Error(`R2 list ${prefix}: ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, item]) => ({
    key: decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(item)?.[1] ?? ""),
    modified: Date.parse(/<LastModified>([\s\S]*?)<\/LastModified>/.exec(item)?.[1] ?? ""),
  }));
}

const decodeXml = (text: string) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e]!);
