import { runtime, type UploadEvidence } from "./index";

export type { UploadedEvidence } from "./index";

/** Send evidence files: to storage in the Hub, nowhere in the demo (it keeps each file's name and size). */
export const uploadEvidence: UploadEvidence = (files, target, onProgress) => runtime().uploadEvidence(files, target, onProgress);
