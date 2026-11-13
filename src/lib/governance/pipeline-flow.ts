/*
 * The live figures on Process Pipelines › Information: counts and times taken from where each information pipeline
 * writes. informationFlow() (app/actions/process-pipelines.ts) reads them; a figure it could not read is left out,
 * never shown as zero.
 */
export interface InformationFlow {
  at: string;
  /** analytics_values by status. */
  values?: { review: number; revise: number; validated: number };
  /** Data requests still open. */
  campaigns?: { open: number };
  imports?: { count: number; lastAt?: string };
  snapshots?: { lastAt?: string };
  editions?: { active: number; indicators: number };
  /** Evidence files read on the Review tab. */
  files?: { read: number; lastAt?: string };
  index?: { chunks: number; builtAt?: string; failed: boolean; paused: boolean };
  responses?: { count: number };
  forms: { open: number };
  deadlines: { sources: number; checkedAt?: string; waiting: number; failed: number };
  site: { rankings: number; stories: number; documents: number };
}
