/*
 * Sending evidence files: an upload URL per file from the server (startEvidenceUploads), then each file straight
 * to storage. The command that saves the record names the uploads it returns.
 */
import { startEvidenceUploads } from "@/app/actions/evidence";
import { upload } from "@/components/impact/media";

export type UploadedEvidence = { name: string; sizeMB: number; src: string };

export async function uploadEvidence(files: File[], target: { unitSlug: string; evidenceId?: string }): Promise<{ ok: true; files: UploadedEvidence[] } | { ok: false; message: string }> {
  if (!files.length) return { ok: true, files: [] };
  const started = await startEvidenceUploads({ ...target, files: files.map((f) => ({ name: f.name, size: f.size })) });
  if (!started.ok) return started;
  try {
    await Promise.all(files.map((f, i) => upload(started.tickets[i].url, { blob: f, type: started.tickets[i].type, width: 0, height: 0 }, () => {})));
  } catch {
    return { ok: false, message: "A file couldn’t be uploaded. Check your connection and try again." };
  }
  return { ok: true, files: files.map((f, i) => ({ name: f.name, sizeMB: Math.round((f.size / 1_048_576) * 10) / 10, src: started.tickets[i].src })) };
}
