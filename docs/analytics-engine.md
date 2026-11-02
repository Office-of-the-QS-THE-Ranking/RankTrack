# Analytics engine: methodologies, facts and reports

The analytics engine scores the University against each ranking body's methodology. **A methodology is data.** Each
edition (UI GreenMetric 2026, THE Impact Ratings 2027 and so on) is a catalog of groups and indicators. Each
indicator says how it is entered and how it scores. **Facts** are what the Hub knows for an edition: values, evidence
links, activities, benchmarks and reviewed cases. **Reports** are computed from the two and are never stored, except as
snapshots.

The catalogs were built from the Office's *UST Dashboard* folder (Drive, downloaded to `~/Downloads/UST Dashboard`).
That folder is still growing. New methodologies, templates and sample files go in as data (packs, profiles, aliases)
or as one small function. The engine itself doesn't change.

---

## 1. Where things are

| Piece | File |
|---|---|
| Model (catalog, facts, reports) | `src/lib/analytics/types.ts` |
| Computing an edition | `src/lib/analytics/engine.ts` → `computeEdition({ catalog, facts, previous? })` |
| Score rules | `src/lib/analytics/rules.ts` → `score()`, `bandHit()`, `standing()`, `rubricTotal()` |
| How an edition adds up | `src/lib/analytics/aggregate.ts` → `AGGREGATES` |
| Formulas (`({1.5} − {1.6}) / {1.5} × 100`) | `src/lib/analytics/expr.ts` → `evaluate()`, `refsOf()`, `formulaProblem()` |
| Packs: validation, next year's edition | `src/lib/analytics/pack.ts` → `readPack()`, `nextEdition()` |
| Values from a form or a file | `src/lib/analytics/values.ts` → `readValue()`, `enterable()` |
| Data checks, fixes worth most | `src/lib/analytics/quality.ts`, `risk.ts` |
| Peer gaps, unit standings, briefs, CSV | `gap.ts`, `units.ts`, `brief.ts` |
| Evidence links (folders, Drive, shortening) | `links.ts` |
| Who supplies an indicator ("Every unit…" labels) | `owners.ts` |
| Template profiles (counts only) | `templates.ts` → `applyProfile()`, `detectProfile()` |
| File readers (xlsx, csv, docx), browser and Node | `tabular/zip.ts`, `xlsx.ts`, `text.ts`, `browser.ts`, `node.ts` |
| Importers | `importers/the-workbook.ts`, `register.ts`, `benchmarks.ts`, `documents.ts` |
| Database reads, caches, page data | `server/db.ts`, `server/load.ts`, `server/desk.ts` (types in `desk-types.ts`) |
| Permission, rate limit, audit for actions | `server/guard.ts` |
| Daily reminders, escalations, weekly snapshots | `server/daily.ts` → `analyticsDaily()` (run by `src/app/api/cron/deadlines/route.ts`) |
| Each ranking in brief (ranking pages, cards, dashboard) | `server/summary.ts` → `rankingSummaries()`, `summariesNow()`, `freshSummaries()` |
| Actions | `src/app/actions/analytics.ts` (values, links, activities, cases, requests, plans, peers, benchmarks), `analytics-admin.ts` (editions, packs, profiles, aliases, imports, exports) |
| Office pages | `src/app/admin/analytics/` (Scorecard, `indicators`, `collection`, `activities`, `benchmarks`, `imports`, `methodology`) |
| Unit page | `src/app/portal/requests/` (Data requests) |
| Components | `src/components/analytics/` (`parts.tsx` holds the shared pieces) |
| Styles | `src/styles/analytics.css` (`an-*`; the ranking page tile is `.rk .rk-an*`) |
| Seed builder | `scripts/analytics/` (§7) |
| Tables | `supabase/migrations/20261101200000_analytics_engine.sql` and later `*_analytics_*` migrations |
| Tests | `tests/analytics.test.ts` (fixtures written by `tests/zip.ts`) |

The 18 `analytics_*` tables sit outside the governance store, like `form_responses`. Row-level security is on, and
`anon` and `authenticated` have no grants. Only the server reads and writes them, through `adminDb()`. What changes
there is audited through the store (`run()` → `log()`), and notices go out in the same commit.

---

## 2. Catalog

### Editions

`analytics_editions`: `ranking` (a `ranking_frameworks` slug), `year`, `label`, `methodology`, `period`, `status`,
`scale`, `aggregate`, `options`, `sources`, `notes`, `opensOn`, `closesOn` and `years` (the calendar years evidence
may come from).

| Status | Meaning |
|---|---|
| Draft | Being prepared; units don't see it |
| Active | The current cycle. The ranking pages, the dashboard and the hub's readiness follow the active edition |
| Closed | Submitted. Read-only except for `rankings.manage` |
| Archived | Kept for history; refused for any change |

### Indicators

`analytics_indicators`: `code`, `position`, `group`, `parent`, `ref` (the body's own label, such as GreenMetric
`SI1`), `name`, `guidance`, `unit`, `input`, `score`, `evidence`, `owners` (org unit ids), `ownerLabels` (office
names with no Directory unit yet), `rollup`, `feeds` and `tags`.

**Input** (`InputSpec`):

| type | Entered as |
|---|---|
| `none` | Computed from other indicators by its rule's formula |
| `number` | `NumberField`, with optional `unit`, `integer`, `min`, `max` |
| `choice` | One of `options` |
| `picks` | Any of `options`, or "No, none of these" (`yes: false`) |
| `yesno` | Yes or No, plus a policy's dates when `evidence.policyDates` |
| `text` / `date` | Text up to `max`, or an ISO date |
| `result` | A published score, rank or band (recorded on the Indicators page's Results tab) |
| `cases` | Cases reviewed against a rubric (WURI) |

**Score rules** (`ScoreRule`, one function each in `rules.ts`). `points` is the most an indicator can earn on the
edition's scale: GreenMetric points, or THE's share of an SDG in percent.

| kind | Used for | Shape |
|---|---|---|
| `bands` | GreenMetric thresholds | `{ expr, bands: [{ label, min?, minIncl?, max?, maxIncl?, share }] }` |
| `choice` | One option, each worth a share | `{ shares: { option: 0.5, … } }` |
| `claim` | THE evidence questions | `{ existence: { yes? \| shares?, sum?, each?, cap? }, evidence, public, dates? }` |
| `ratio` | THE's normalised proportions | `{ expr, better: "higher" \| "lower" }`, projected only from peer benchmarks |
| `external` | Bibliometrics and surveys the body measures | known only once results are recorded |
| `dated` | A target date (THE 13.4.2) | `{ steps: [{ until, share }], later }` |
| `rubric` | WURI cases | `{ criteria: [{ key, label, group, max, levels }] }`, best case counts |

Formulas reference other indicators as `{code}` and allow `+ − × ÷` (or `* /`), parentheses, and `min`, `max`,
`abs`, `round`, `sum`. A missing input or a division by zero gives no result instead of a misleading one.

**Aggregates** (`AGGREGATES` in `aggregate.ts`): `sum` (GreenMetric), `the-impact` (SDG 17 × 0.22 plus the best
three SDGs × 0.26 each; `options` holds the mandatory group and weights), `best-per-group` (WURI: the best reviewed
case per category, averaged), `readiness` (QS Sustainability: no score, only how complete the data is) and `results`
(QS by Subject: published ranks).

**Rollup**: how unit answers become the University's. The Office's own row (`unit_id = ''`) always wins. Otherwise
`sum`, `max` or `latest` applies, and for answers: any Yes, the union of picks, and the best choice.

**Feeds** suggest a value next to the form; nothing is filled in automatically.
`{ kind: "activities", kinds?, tags?, measure?: "count" | "beneficiaries", per?: "year" | "average" }` counts the
activity register over the edition's academic years. `per: "year"` takes the latest year with activities, and
`per: "average"` the mean across the years (GreenMetric ED4, ED5 and ED8 ask per year).
`{ kind: "template", profile, measure }` takes a total from the latest template upload.

---

## 3. Facts, and what a report says

| Table | Holds |
|---|---|
| `analytics_values` | One row per edition, indicator and unit (`''` = the University). `status`: Draft, For review, Validated, Needs revision, Not applicable. `source`: manual, import, template, register, portal |
| `analytics_value_history` | Every change to a value, newest last |
| `analytics_links` | Evidence: a public `https://` address or an evidence record id, with `relevance`, `public` and `self_contained` once the Office assesses it |
| `analytics_activities` | The activity register (service learning, community development, advocacy, events…) |
| `analytics_peers`, `analytics_benchmarks` | Peer institutions (band: Philippines, ASEAN, Aspirational…) and figures; `peer_id = ''` is UST's own |
| `analytics_cases`, `analytics_reviews` | WURI cases and rubric scores |
| `analytics_profiles`, `analytics_imports`, `analytics_aliases` | Template profiles, the import log (file SHA-256, rows, totals, never rows themselves), unit-name aliases |
| `analytics_campaigns`, `analytics_campaign_units` | Data requests and who owes what |
| `analytics_actions` | Action items (the plan) |
| `analytics_snapshots` | Reports frozen weekly and on demand, for trends and "since last week" |

**Points** come in two tiers, so nobody mistakes a hope for a result:

- **claimed**: For review plus Validated values. Links not yet assessed count as specific.
- **secured**: Validated values only, with assessed links.

Each indicator reports `{ max, secured, claimed, open, lost }`, its state, its band (and the next one), and
**readiness**: the share of these checks that pass. `value`: answered. `validated`. `evidence`: a link where one is
required. `relevant`: assessed as specific. `public`: where the body rewards it. `single`: a file or page, not a
folder. `dates`: a policy's dates. `period`: the evidence's year falls in the edition's years. An `owner` check is
shown but left out of the ratio.

`quality.ts` adds **checks**: impossible percentages, division by zero, out-of-range values, unit slips (kWh against
"kilowatts", pesos against dollars), offices missing from the Directory, year-on-year changes over 50%, folder links,
private Drive links where public evidence is required, evidence outside the period, and one link reused across many
indicators. `risk.ts` ranks the **fixes worth most** (the points a missing value, link, assessment or date would add,
or the next band).

---

## 4. Packs

A pack is one edition as portable JSON: `{ pack: 1, edition, groups, indicators }`. The Methodology page imports and
exports packs. `readPack()` validates every one, whether it comes from that page or from the seed builder:

- codes match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$` and are unique;
- every formula parses and references codes in the pack;
- shares are between 0 and 1, and choice options exist;
- the aggregate is one of `AGGREGATE_KINDS`, the status one of `EDITION_STATUSES`.

Importing upserts the edition. Indicators missing from the pack are removed only when no facts reference them.
`nextEdition(pack, year)` makes next year's edition: the id's year swapped, dates moved a year, status Draft. The
Methodology page's **Start another year** does the same.

---

## 5. Templates: counts only

The Registrar, HR, the Health Service, FMO and Research keep files with personal data. The Hub never stores their
rows. A file is read **in the browser** (`tabular/browser.ts`). The profile counts it there, and only totals and
breakdowns go to the server. `importTemplate` checks them again and drops breakdown cells under the profile's
`minCell` again. The import log keeps the file's SHA-256, row count and totals.

```json
{
  "key": "student-count",
  "name": "Student count",
  "description": "Registrar: one row per enrolled student.",
  "kind": "rows",
  "headers": ["STUD_NUMBER", "COLLEGE"],
  "skip": [{ "column": "STUD_NUMBER", "match": "^\\*" }],
  "measures": [{ "key": "students", "label": "Students", "op": "distinct", "column": "STUD_NUMBER" }],
  "dimensions": ["COLLEGE"],
  "minCell": 5
}
```

`op` is `count` (rows), `distinct` (different values in `column`), `sum`, or `fte` (Σ min(column ÷ `full`, 1)), each
with optional `where` filters (`in`, `notIn`, `match`, `empty`). A `pairs` profile reads labelled figures instead
(FMO's water, energy and floor space). Only the columns a profile names are read. To add a template, add a profile on
the Data imports page (or in `scripts/analytics/profiles.ts` for the seed). No code changes.

---

## 6. Importers

All files are parsed in the browser, so the 1 MB Server Action limit never applies. Only sheets, text or counts are
sent. Limits: 60 MB per file. Zip archives: 4,000 entries, 64 MB per entry, 256 MB in all. Sheets sent: 60 sheets,
30,000 rows, 80 columns, 2,000 characters per cell.

| File | Reader | Lands in |
|---|---|---|
| THE data-collection workbook (one unit's) | `the-workbook.ts`: Yes/No rows, option sub-rows, continuous figures, evidence and public columns | values and links for that unit, For review |
| SIMBAHAYAN activity register (sheets per year, e.g. *Service Learning 2025-2026*) | `register.ts`: unit names through aliases | activities, deduplicated |
| Benchmark tables (long or wide) | `benchmarks.ts`: rows naming Santo Tomas become UST's own | peers and benchmarks |
| WURI case template (.docx) | `documents.ts` → `readWuriCase()`: title, category, abstract (≤ 300 words), writer, champion, email | cases |
| GreenMetric evidence document (.docx, `University_Country_1_5_….docx`) | `documents.ts` → `readEvidenceDoc()`: figures in context, the code from the file name | suggestions only; the Office chooses what to save |

When a register names a unit the Directory doesn't know ("MED (FMS)"), add an alias on Data imports → Unit names.
The importer then matches it next time, and already imported activities are relinked.

---

## 7. Rebuilding the seed from the UST Dashboard folder

```sh
npx tsx scripts/analytics/build.ts --drive "$HOME/Downloads/UST Dashboard" \
  --the-text "<THE methodology as .txt>" --out <folder for the packs' JSON> > seed.sql
```

| Builder | Reads |
|---|---|
| `greenmetric-2026.ts` | The 2026 guideline (written out: criteria, Appendix 1 bands, formulas, owners) |
| `the-impact.ts` | THE's methodology text (weights, existence schemes) and SIMBAHAYAN's data-collection workbook (the indicator rows) |
| `qs-sustainability-2027.ts` | The QS letters' tables (`1QS Sustainability/Letter`) |
| `wuri-2026.ts`, `qs-subject-2026.ts` | WURI's categories and rubric; QS by Subject's areas and subjects |
| `profiles.ts` | Template profiles, unit aliases, which THE figures templates can suggest |
| `shared.ts` | Band notation (`≥250-600`, `>1-5`…), office names → unit ids, `packsSql()` |

Every pack goes through `readPack()`. The SQL **only upserts**. Re-running it updates names, guidance, rules and
owners but never deletes, and never touches an edition's status after it was first inserted. To ship a change, diff
the new packs against the old ones, write the differences as a migration
(`supabase/migrations/<timestamp>_analytics_<what>.sql`; see `20261101230000_analytics_the_names.sql`, which only
rewrites rows still holding the generated text), then dry-run and push it.

When the Office adds a **new edition**, write a builder that returns a `MethodologyPack` (or start from
`nextEdition()`), add it to `build.ts`, and run the steps above. When THE publishes a new methodology, run
`the-impact.ts` on its text: weights, existence schemes and names come from the document. Watch for renumbering
between the methodology and the workbook (2026's methodology numbers the workbook's 6.5.2–6.5.6 as 6.5.3–6.5.7).
The builder only takes the methodology's name for an item when the workbook row starts with all of it.

---

## 8. Data requests

The Office asks units for an edition's items on Analytics → Data requests (`createCampaign`): a title, the
memorandum (such as `UST: S052-00-ME03`), a due date, reminder and escalation days, and the units. In `owned` mode
each unit gets the indicators it owns. In `chosen` mode the Office picks units and items.

| Event | Notice (template) | To |
|---|---|---|
| Request created | `tpl-data-request` | each unit |
| Every `remindDays` while items are open | `tpl-data-reminder` | the unit |
| `escalateDays` past due | `tpl-data-escalated` | the Office |
| A unit sends a value or evidence | `tpl-data-sent` | the Office |
| The Office returns a value (a note is required) | `tpl-data-returned` | the unit |
| Every item sent | `tpl-data-thanks` | the unit |

`analyticsDaily()` runs with the daily deadline cron: reminders, escalations, and a weekly snapshot of each active
edition. Letters (request, follow-up, thank-you) are drafted in the Office's wording, ready to copy.

Units answer on `/portal/requests`. Each item takes a value, a note and evidence (a link, or one of the unit's
evidence records), and can be saved as a draft, sent, or marked not applicable. **Admins never answer for a unit**:
the Office's own figure is the University's row, kept apart from units' answers.

---

## 9. Who may do what

| Action | Permission |
|---|---|
| See analytics pages | `rankings.view` |
| Enter the University's figure, links, activities, cases, benchmarks, plans | `rankings.edit` |
| Validate or return a value, assess a link | `data.approve` |
| A unit's answers and links | `data.submit` in that unit |
| Editions, packs, profiles, aliases, imports, requests; changes to a Closed edition | `rankings.manage` |
| Exports (CSV, positioning brief, quarterly report) | `rankings.export` |

Every action is rate-limited per account (`allowAccount`) and audited.

---

## 10. Rankings elsewhere in the Hub

`rankingSummaries()` computes each ranking's active edition in brief (figure, readiness, items to go, state counts,
top fixes). It caches the result for 60 seconds, and any analytics change clears it (`refresh()`). `hub()` never waits
for it: it uses `summariesNow()`, the last computed copy, and starts a fresh one in the background. With an active
edition, a ranking's `readiness` and `pending` ("items to go") come from the engine. The ranking page awaits fresh
summaries for up to 4 seconds and shows the **Analytics** tile, and its Evidence ring counts the edition's indicators.

---

## 11. History loaded on 1 November 2026

To show real content, SIMBAHAYAN's own files were loaded as history, through the importers, as the system account:

| Import (`analytics_imports.id`) | File | Rows written |
|---|---|---|
| `a43ccf67-0581-409c-92fc-07258c4c8a64` | UST SIMBAHAYAN Impact 2026-data collection support v1.xlsx | 49 values (`source = 'import'`, `source_ref` = the import id) and 74 links (`added_by = 'system'`), unit `simbahayan`, edition `the-impact-2026`, all For review |
| `fe350c67-4832-4073-b5f7-1e544d692cb9` | SIMBAHAYAN.xlsx (activity register) | 383 activities (`source_ref` = the import id) |

The alias `MED (FMS)` → `medicine` was added at the same time. To remove it all:

```sql
delete from public.analytics_values where source_ref = 'a43ccf67-0581-409c-92fc-07258c4c8a64';
delete from public.analytics_links where edition_id = 'the-impact-2026' and unit_id = 'simbahayan' and added_by = 'system';
delete from public.analytics_activities where source_ref = 'fe350c67-4832-4073-b5f7-1e544d692cb9';
delete from public.analytics_imports where id in ('a43ccf67-0581-409c-92fc-07258c4c8a64', 'fe350c67-4832-4073-b5f7-1e544d692cb9');
```

---

## 12. Extending

- **A new score rule**: add its shape to `ScoreRule` (`types.ts`), its function to `score()` (`rules.ts`), its
  validation to `readPack()`, its label to `RULES` in `Methodology.tsx`, and a test.
- **A new way of adding up**: add a kind to `AggregateKind` and `AGGREGATE_KINDS`, and a function to `AGGREGATES`.
- **A new template**: a profile (§5). No code.
- **A new kind of file**: a reader in `importers/` that returns facts; a browser step that sends only what the server
  needs; an action in `analytics-admin.ts` that checks it again, writes it with `source = 'import'` and logs it in
  `analytics_imports`.
- **A new feed**: add it to `Feed` (`types.ts`), to `feedValues()` in `engine.ts`, and to `readPack()`'s feed check.

Verify with `npx tsc --noEmit -p .` and `npx vitest run`.
