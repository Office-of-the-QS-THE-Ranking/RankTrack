# Evidence review: reading files, rules and the Reviewer

The **Review** tab of a submission's record helps the people who validate it. It reads the submission's files as text, suggests which indicators the pages support, and checks the SDGs, the year and copies. It is for the Rankings Office's review work. The Submit evidence form is unchanged: Coordinators still choose the SDGs themselves.

Nothing here decides anything. Rules suggest, an optional AI job gives a second opinion, and a person accepts or dismisses.

---

## 1. Where things are

| Piece | File |
|---|---|
| Model and limits | `src/lib/review/types.ts` |
| Which files can be read | `src/lib/review/files.ts` |
| Reading a file in the browser (PDF text, OCR, Word, slides, sheets) | `src/lib/review/extract/browser.ts` |
| Words, stems, sentences, masking | `src/lib/review/text.ts` |
| Matching pages to indicators | `src/lib/review/match.ts` |
| Figures and years | `src/lib/review/figures.ts` |
| Near-copies | `src/lib/review/fingerprint.ts` |
| Choosing indicators, SDG hits, the summary | `src/lib/review/rules.ts` |
| The Reviewer's prompt and answer checking | `src/lib/review/reviewer.ts` |
| Tables | `src/lib/review/server/store.ts` |
| Who may review, taking in pages, the tab's data | `src/lib/review/server/review.ts` |
| Accepting, dismissing, asking the Reviewer | `src/lib/review/server/decide.ts` |
| The Reviewer's model call, job settings | `src/lib/review/server/reviewer.ts` |
| Actions | `src/app/actions/review.ts`, `src/app/api/review/check/route.ts` (the AI check) |
| The tab | `src/components/contributions/ReviewTab.tsx`, `src/styles/review.css` |
| Job settings screen | Command & Control › Agentic Control › Models › **Jobs** (`AgenticControl.tsx`) |
| Workers and language data | `public/ocr`, copied by `scripts/ocr-assets.mjs` after `npm install` (not in git) |
| Migration | `supabase/migrations/20261112015635_evidence_review.sql` |
| Tests | `tests/review.test.ts`, `tests/review-guard.test.ts` |

---

## 2. How a file is read

1. The reviewer presses **Read**. The server checks they review this submission, then works out the file's SHA-256 from storage. If the same file was read before, its text is reused.
2. The browser downloads the file with the reviewer's own session and reads it there. The file is never sent anywhere else.
3. **PDF**: the text layer of each page is taken first (pdf.js). A page with fewer than 40 characters is a scan: it is drawn at about 200 dpi and read by Tesseract OCR, English and Filipino, on up to three workers.
4. **Word, PowerPoint, Excel, CSV, text**: opened with the importers' own readers. A file with no pages is cut into parts of about 3,000 characters; a slide is a page.
5. **Images**: read by OCR, unless the file's kind is Photo.
6. Only the text is sent, in batches, and kept in `review_pages` by the file's hash.

Limits: 300 pages, 20,000 characters a page, 60 MB a file. `.doc`, `.xls` and photos aren't read.

pdf.js and Tesseract run from `/ocr` on the Hub itself. The Content Security Policy lets WebAssembly compile on workspace pages (`'wasm-unsafe-eval'` in `src/proxy.ts`), and the workers have their own policy (`OCR_POLICY` in `next.config.ts`).

---

## 3. What the rules do

No model is involved, so the same file and terms always give the same result.

- **Which indicators.** Only those the submission counts toward: answerable indicators of each Active edition, in the groups it is mapped to ("THE Impact · SDG 4", "UI GreenMetric · Water"). Computed, published and case indicators are left out.
- **Lexicon.** Each indicator's telling words and two-word phrases come from its own name and guidance, weighed by how few other indicators share them. The Office's added terms count most.
- **Match.** A page matches by the share of the lexicon it holds. *Strong*: about half, with four or more terms. *Possible*: a quarter, or an added term. A short-named number ("Number of graduates") matches only in one sentence beside a figure.
- **What a suggestion shows.** The pages, the terms found, one sentence to read, and a warning when that sentence says no or not.
- **Figures.** Numbers with what they count, money and percentages, exactly as written. Dates, times, page and section numbers, phone numbers and bare years are left out.
- **Years.** The years the text names, against the years the edition takes evidence from.
- **SDGs.** A chosen SDG counts as found when the text names it or holds two of its terms. Up to three strong SDGs that weren't chosen are shown too.
- **Copies.** The same bytes in another submission, or about 60% or more of the same five-word runs (MinHash).

**Terms** live in `review_terms`: for an SDG, or for a ranking and indicator code, so they carry to next year's edition. People with `rankings.manage` add and remove them on the tab. Adding one checks the open submission again.

---

## 4. Accepting a suggestion

Accepting **links the evidence record to the indicator**, under the unit that sent it, with the pages in the link's label and the file's year. For an indicator that takes a number, the reviewer may choose one of the figures found. That figure is only **offered** beside the indicator ("Use 4,210 · Evidence EV-12, p. 40"), like the register's and templates' counts (`Facts.findings`, `feedValues()` in the engine).

No value is written for anyone. The Office never answers for a unit (`docs/analytics-engine.md` §8).

Undoing or dismissing removes the link if accepting created it and no other accepted suggestion rests on it.

---

## 5. AI jobs

| Job | Does | Model |
|---|---|---|
| **Assistant** | The chat (`docs/assistant.md`) | Each person's choice |
| **Reviewer** | Checks a file's open suggestions against their pages | Set once by an Administrator, on a plan that doesn't share data |
| Auditor | Copies, years, SDG checks | None: these are rules (§3) |

The Reviewer is off until an Administrator chooses a model and switches it on. One run sends up to 10 suggestions and 12 pages, 3,000 characters each, with emails, phone numbers and web addresses masked. It answers supports, partly or doesn't, with a sentence and a short reason.

Its answer is checked in code before anyone sees it (`readReviewerAnswer`):

- only the suggestions that were sent are read, once each;
- a quote is kept only if it is on a page that was sent, and is moved to the page it is really on;
- a figure is kept only if that quote states it;
- "supports" or "partly" with no quote that could be found becomes **Couldn't confirm**;
- the reason is one line with no addresses or markup.

A verdict sits beside a suggestion. It never accepts or dismisses one.

---

## 6. The walls between jobs

| Rule | Where | Enforced by |
|---|---|---|
| A file's text is read only by people who decide that submission (`evidence.approve` in its unit and bodies, never their own) | `reviewable()` in `server/review.ts`; every action's `gate()` | Code |
| Only those people see the Review tab | `ContributionRecord.tsx` | Code |
| Review tables are closed to everyone but the Hub's server | Row-level security, no grants | Database |
| The chat never reads review text: not in its index, its lookups or its code | `tests/review-guard.test.ts` scans `src/lib/assistant`, `api/chat`, `components/assistant` | Test |
| The Reviewer has no tools, no conversation, no Hub lookups, and isn't told who is asking | `server/reviewer.ts` | Code, test |
| Evidence text never reaches a plan that shares data | `jobModelProblem()`, checked when the job is saved and on every run | Code, test |
| The file itself never reaches a model, only extracted text | `reviewerPrompt()` | Code |
| Text can't be filed under a file it wasn't read from | SHA-256 worked out on the server from storage | Code |
| A model's quote and figure must be on the page | `readReviewerAnswer()` | Code, test |
| Instructions inside a document are ignored | `REVIEWER_INSTRUCTIONS`, and the answer's fixed shape | The model, then code |
| A failed model call is logged without the request, which holds pages | `server/reviewer.ts` | Code, test |
| Only counts are kept of a run, under the job's name | `assistant_usage.job` | Code |
| Whose a copied file is shows only to someone who may see that submission | `reviewDesk()` | Code |
| Every read, decision, AI run and term change is audited, never with page text | `audit()` | Code |

**What this doesn't stop.** Names inside a document can't be told apart in code, so they reach the Reviewer's model with the page. Choose a provider whose terms the Office accepts. A model can still misjudge a page, which is why its verdict decides nothing. OCR misreads scans, tables most of all, so figures from scans need a look at the file.

---

## 7. Tables

| Table | Holds |
|---|---|
| `review_files` | One row per file read: hash, pages, OCR pages, signature, the rules' summary |
| `review_pages` | The text, by file hash and page |
| `review_terms` | Terms for SDGs and indicators (170 SDG terms seeded) |
| `review_findings` | Suggestions: indicator, pages, terms, quote, figures, the AI check, the decision, the link made |
| `assistant_jobs` | The Reviewer's switch, model, backup and daily limit |
| `assistant_usage.job` | `assistant` or `reviewer` |

**Remove text** on a file deletes its row, its suggestions and its pages (unless another attachment is the same file). A file taken off a submission loses its text the next time the tab opens. Links already made stay.

---

## 8. Extending

- **A new file type**: a reader in `extract/browser.ts`, its extension in `files.ts`.
- **Better matching for an indicator**: add terms on the tab. No code.
- **A new job**: a row in `assistant_jobs` (widen its check), a `JobRow` in `agenticControlDesk()`, and its own module that calls `jobModelProblem()` before every run. Add its walls to `tests/review-guard.test.ts`.
- **An AI Auditor** (the same event sent by two units under different titles, figures that contradict across files) would be a second job reading `review_pages` across submissions. Not built.

Verify with `npx tsc --noEmit -p .` and `npx vitest run`. The reader was tried in headless Chromium on 12 November 2026 with a text PDF, a scanned PDF and an image. The Reviewer has not been run against a real model yet: turn it on, try it on real files and read its verdicts before relying on it.
