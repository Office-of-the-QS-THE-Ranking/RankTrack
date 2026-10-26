/*
 * The composer's pictures in the browser: read each one, scale large photographs down before they leave the
 * device (most phone photos shrink to a fraction of their size), and upload straight to the media bucket
 * through the signed URL the server handed out, reporting progress as it goes.
 */
import { MEDIA_MAX_MB, MEDIA_TYPES, POST_PICK } from "@/lib/governance/posts";

/** The longest side a photograph keeps. */
const MAX_SIDE = 2560;
/** Files this small and already within MAX_SIDE go up untouched. */
const KEEP_BYTES = 2.5 * 1_048_576;

export interface Prepared {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

/** What a post's picker offers: JPG and PNG only. Phones convert HEIC photographs to JPEG for a list like this. */
export const POST_ACCEPT = Object.keys(POST_PICK.types).join(",");

/** Why a picture can't go into a post, or null when it can: JPG or PNG, up to POST_PICK.maxMb. */
export function postPickProblem(file: File): string | null {
  if (!POST_PICK.types[file.type]) return `${file.name} isn’t a JPG or PNG picture.`;
  if (file.size > POST_PICK.maxMb * 1_048_576) return `${file.name} is larger than ${POST_PICK.maxMb} MB.`;
  return null;
}

/** The longest side a post's picture keeps once compressed. */
const POST_SIDE = 2000;

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * A picture ready to upload, or a reason it can't be: a format the browser can't read, or too large. With
 * `compress`, every picture is re-encoded, and the smaller of that and the original goes up.
 */
export async function prepare(file: File, maxSide = MAX_SIDE, compress = false): Promise<Prepared | string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return `${file.name} couldn’t be read. Use a JPG, PNG, WebP or GIF picture.`;
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  // Animated GIFs would lose their motion on a canvas, and small pictures don't need it.
  if (MEDIA_TYPES[file.type] && (file.type === "image/gif" || (!compress && scale === 1 && file.size <= KEEP_BYTES))) {
    bitmap.close();
    return file.size > MEDIA_MAX_MB * 1_048_576 ? `${file.name} is larger than ${MEDIA_MAX_MB} MB.` : { blob: file, type: file.type, width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return `${file.name} couldn’t be prepared for upload.`;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let blob = await encode(canvas, "image/webp", compress ? 0.8 : 0.86);
  // Browsers that can't write WebP hand back a PNG; a JPEG on white is far smaller.
  if (!blob || blob.type !== "image/webp") {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await encode(canvas, "image/jpeg", compress ? 0.82 : 0.88);
  }
  bitmap.close();
  if (!blob) return `${file.name} couldn’t be prepared for upload.`;
  // A small, already lean PNG can come out larger; then the original goes up as it is.
  if (compress && scale === 1 && MEDIA_TYPES[file.type] && blob.size >= file.size) return { blob: file, type: file.type, width, height };
  if (blob.size > MEDIA_MAX_MB * 1_048_576) return `${file.name} is still larger than ${MEDIA_MAX_MB} MB after resizing.`;
  return { blob, type: blob.type, width: canvas.width, height: canvas.height };
}

/** A post's picture, compressed for upload. */
export const preparePostPicture = (file: File) => prepare(file, POST_SIDE, true);

/** Send a file to its signed upload URL. */
export function upload(url: string, file: Prepared, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload refused (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file.blob);
  });
}
