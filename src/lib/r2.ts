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

/**
 * Where browsers may be sent for a public file: the public bucket's custom domain, or null. Never its r2.dev
 * address: Cloudflare rate-limits r2.dev and means it for development only, and some networks block it outright
 * (pictures then fail to load). Without a custom domain the Hub streams public files itself and Vercel's CDN
 * caches them.
 */
export function publicUrl(key: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base || /\.r2\.dev$/i.test(new URL(base).hostname)) return null;
  return `${base}/${encodeKey(key)}`;
}

/**
 * A URL the browser can PUT one file to in the private bucket, for `seconds`. The Content-Type and the exact size
 * are part of the signature, so R2 refuses any other type or a single byte more or less.
 */
export async function presignPut(key: string, contentType: string, size: number, seconds: number) {
  const url = new URL(objectUrl("private", key));
  url.searchParams.set("X-Amz-Expires", String(seconds));
  const headers = { "Content-Type": contentType, "Content-Length": String(size) };
  const signed = await r2().client.sign(new Request(url, { method: "PUT", headers }), { aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}

export async function getObject(bucket: Bucket, key: string): Promise<Blob | null> {
  const res = await r2().client.fetch(objectUrl(bucket, key));
  if (!res.ok) return null;
  return new Blob([await res.arrayBuffer()], { type: res.headers.get("Content-Type") ?? "application/octet-stream" });
}

/** Store an object the server itself writes (recovery point files), replacing any with the same key. */
/** An object as a stream, for passing straight through to a response without holding it in memory. */
export async function streamObject(bucket: Bucket, key: string): Promise<{ body: ReadableStream<Uint8Array>; type: string; size: number | null } | null> {
  const res = await r2().client.fetch(objectUrl(bucket, key));
  if (!res.ok || !res.body) return null;
  const size = Number(res.headers.get("Content-Length"));
  return { body: res.body, type: res.headers.get("Content-Type") ?? "application/octet-stream", size: Number.isFinite(size) && size > 0 ? size : null };
}

/** An object's size and Content-Type, or null when it doesn't exist. */
export async function statObject(bucket: Bucket, key: string): Promise<{ size: number; type: string } | null> {
  const res = await r2().client.fetch(objectUrl(bucket, key), { method: "HEAD" });
  if (!res.ok) return null;
  return { size: Number(res.headers.get("Content-Length") ?? 0), type: res.headers.get("Content-Type") ?? "" };
}

export async function putObject(bucket: Bucket, key: string, body: Uint8Array, contentType: string) {
  const res = await r2().client.fetch(objectUrl(bucket, key), {
    method: "PUT",
    body: body as unknown as BodyInit,
    headers: { "Content-Type": contentType, "Content-Length": String(body.byteLength) },
  });
  if (!res.ok) throw new Error(`R2 put ${key}: ${res.status}`);
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

/** Every object under a prefix, in key order, following R2's pages of 1,000. */
export async function listObjects(bucket: Bucket, prefix: string): Promise<{ key: string; modified: number }[]> {
  const out: { key: string; modified: number }[] = [];
  let token: string | undefined;
  do {
    const url = new URL(`${r2().endpoint}/${r2().buckets[bucket]}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const res = await r2().client.fetch(url);
    if (!res.ok) throw new Error(`R2 list ${prefix}: ${res.status}`);
    const xml = await res.text();
    for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g))
      out.push({
        key: decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(item)?.[1] ?? ""),
        modified: Date.parse(/<LastModified>([\s\S]*?)<\/LastModified>/.exec(item)?.[1] ?? ""),
      });
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "") || undefined : undefined;
  } while (token);
  return out;
}

const decodeXml = (text: string) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e]!);
