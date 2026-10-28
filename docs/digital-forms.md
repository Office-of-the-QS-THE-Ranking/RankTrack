# Digital Forms: modules, presets and templates

Digital Forms replaced the Workspace's **Templates & Forms** shelf (uploaded documents) with a repository of
electronic forms. Each form has its details, its own responder link, a table of responses and analytics. Forms are
built from **modules** (one per kind of question) and **presets** (ready-made questions and blocks UST forms ask
again and again). The first form is UST SIMBAHAYAN's *Community Development Project Proposal* (S040-00-FO21 rev06).

This page is the reference for the **Forms Builder**: everything it needs to assemble, check, render, review and
analyse a form already exists as described below.

---

## 1. Where things are

| Piece | File |
|---|---|
| Schema and answer types | `src/lib/forms/types.ts` |
| Module rules (clean, check, match, read as text) | `src/lib/forms/modules.ts` |
| Checking a whole response; shown sections; respondent; removed-row cascade | `src/lib/forms/check.ts` |
| Schema gate for untrusted schemas (the Builder's saves) | `src/lib/forms/schema.ts` → `readSchema()` |
| Review status (sign-offs) | `src/lib/forms/review.ts` |
| Budget arithmetic | `src/lib/forms/budget.ts` |
| Analytics engine | `src/lib/forms/analytics.ts` → `analyze()` |
| CSV export | `src/lib/forms/csv.ts` → `responsesCsv()` |
| Formatting (pesos, Manila days, nouns) | `src/lib/forms/format.ts` |
| Kinds, statuses, limits, module names | `src/lib/forms/kinds.ts` |
| Presets (the Builder's palette: `PRESETS`) | `src/lib/forms/presets.ts` |
| Forms Builder: new questions, keys, fitting presets, references | `src/lib/forms/builder.ts` |
| Forms Builder window | `src/components/forms/Builder.tsx` (`fb-*` in `forms.css`) |
| Templates | `src/lib/forms/templates/comdev-proposal.ts` |
| Module inputs | `src/components/forms/fields.tsx`, `blocks.tsx`, `controls.tsx` |
| Module answers, read back | `src/components/forms/answers.tsx` |
| Responder page (the responder link) | `src/app/f/[code]/page.tsx`, `src/components/forms/Responder.tsx`, `FormFrame.tsx` (hero with the share card: the link as a QR code, `components/ui/QrCode.tsx` on `uqr`; footer) |
| Team copies (§11) | `src/lib/forms/copies.ts` (sync book, live helpers), `src/app/f/[code]/[token]/page.tsx`, `src/components/forms/CopyStart.tsx`, `copy-parts.tsx`, `useCopy.ts`, `src/lib/governance/server/form-copies.ts`, `src/app/actions/form-copies.ts`, `supabase/migrations/20261028250000_form_copies.sql`, `20261028260000_form_copies_live.sql` |
| Workspace shelf, form window, responses, analytics | `src/components/forms/DigitalForms.tsx`, `FormWindow.tsx`, `Responses.tsx`, `Analytics.tsx`, `art.tsx`, `marks.tsx` |
| Styles | `src/styles/forms.css` (`fm-*` modules and Workspace, `fr-*` responder page) |
| Commands (store) | `src/lib/governance/engine/forms.ts`: `form.save`, `form.status`, `form.duplicate`, `form.delete` |
| Server data | `src/lib/governance/server/forms.ts` (`formsDesk`, `responderForm`, `responsesOf`, `runsForm`) |
| Server actions (responses) | `src/app/actions/forms.ts` (`submitFormResponse`, `loadFormResponses`, `reviewFormResponse`, `deleteFormResponses`, `exportFormResponses`) |
| Database | `supabase/migrations/20261028190000_digital_forms.sql` |
| Seeding a template as a live form | `scripts/forms/seed-sql.mts` |
| Tests | `tests/forms.test.ts`, `tests/forms-builder.test.ts`, `tests/forms-copies.test.ts` |

Routes: `/admin/workspace/forms` (the Office's forms), `/portal/workspace/forms` (a unit's own forms, with the
Office's open forms beside them), `/f/<code>` (the responder link, public, no site navigation; for a form with team
copies, where a copy is built), `/f/<code>/<token>` (a team copy). Old
`/…/workspace/templates` links redirect to `/…/workspace/forms`.

## 2. How it fits together

- **A form** is a row of `forms`, part of the governance store (in `hub_tables`, mapped in `server/db/rows.ts`),
  changed only through its commands, each authorized and audited. A unit's forms are written by its contributors
  (`evidence.submit` on the unit); the Office's by Knowledge Center editors (`knowledge.edit`).
- **Lifecycle:** draft → open → closed ↔ open. A form never goes back to draft, so only a draft (which has never
  taken a response) can be deleted, and its **questions change only while it is a draft**. To change an open form's
  questions, duplicate it (`form.duplicate` makes a draft copy with a new link). Details (title, description, kind,
  form number, issuing office, closing day, reference prefix) can change at any time.
- **Responses** are rows of `form_responses`, **outside** the store, so a busy form never rewrites it. They are
  numbered per form by `hub_form_submit()` (`CDP-0001`, `CDP-0002`…; the prefix is the form's). Restoring the store
  never touches them (no foreign key, on purpose). They are covered by Supabase's database backups, not by the
  Hub's recovery points.
- **Sending a response** (`submitFormResponse`): anyone with the link, while the form is open and not past its
  closing day. Rate limits: 20 per hour per network per form, 600 per hour per form (fail closed). A hidden trap
  field catches bots. The answers are rebuilt by the same module rules the page ran (unknown fields dropped, fixed
  rates and sources forced, hidden fields dropped); the e-signature tick is dated by the response's arrival (older typed signatures were dated on arrival). Not audited: a response is its
  own record.
- **Running a form** (reading responses, reviewing, removing, exporting) is for the people who may change it.
  Reviews save only over the version that was read (two reviewers can't overwrite each other), and every review,
  removal and export is written to the audit trail.

## 3. The schema

```ts
FormSchema = {
  sections: SectionSpec[];          // one responder step each: { id, title, icon?, showIf?, fields }
  review?: { stages: StageSpec[]; fields: FieldSpec[] };   // sign-offs, then office-only fields
  from?: { name: fieldId; email?: fieldId };               // who a response is from (responses table, CSV)
}
```

Every field shares: `id` (the answer's key: letters, digits, dashes; unique in the form), `type`, `label`, `help`
(a short line under the label), `hint` (longer text behind an info mark), `required`, `showIf`, `half` (half a row on
wide screens), `column` (shown as a column of the responses table).

**Conditions** (`showIf`) read an earlier field: `{ field, is: [...] }` shows the field or section when the answer
includes any of the values (a choice's values, `yes`/`no`, a budget's category ids…; see each module's *tokens*), and
`{ field, filled: true | false }` when it has or lacks an answer. A condition may only point back at a field that comes
before it; a hidden field's answer is dropped, so conditions on it are false. Table columns have their own
`showIf: { column, is }` within a row.

`readSchema(raw)` rebuilds a schema from untrusted input with known keys only and returns the schema or a sentence
saying what's wrong: unknown types, repeated ids, conditions or option sources that point forward, limits (20
sections, 300 questions, 60 per section, 60 options, 12 columns, 10 sign-offs, 30 office fields, 400 KB).

## 4. Modules

Each module has, in one place each:

1. a spec type (`types.ts`) and its schema check (`schema.ts`);
2. rules (`modules.ts`): `clean` (untrusted input → the answer as kept), `filled`, `problem` (what to fix, in a
   sentence), `tokens` (what a condition can match), `text` (the answer in words, for search, the table and CSV);
3. an input (`fields.tsx` / `blocks.tsx`), wired to the Hub's field messages: native constraints on plain inputs,
   and for groups a hidden proxy right after the group carrying the module's message (`GroupCheck`), so the group
   gets the red edge, the shake and the warning sign;
4. a read-back (`answers.tsx`);
5. an analytics summary (`analytics.ts`) and its card (`Analytics.tsx`).

| Module (`type`) | Asks for | Spec options | Answer as kept | Checks | Conditions match | Analytics |
|---|---|---|---|---|---|---|
| Short answer (`text`) | one line | `format: plain \| email \| phone`, `placeholder`, `max` (160), `domain` (emails must be `@domain`), `caps` (a name: capitals, letters only) | `string` | required, length, email format and domain, phone format, letters for `caps` | the text | counted with the answers in words |
| Paragraph (`paragraph`) | a few lines | `placeholder`, `max` (3,000), `sentences` (limit; abbreviations like Dr. and Brgy. don't end one) | `string` | required, length, sentences | `text` when filled | answers in words |
| Choice (`choice`) | one or several options | `options [{value,label,hint}]`, `multiple`, `min`, `max`, `other` (adds an option that asks for words), `display: cards \| chips` | `{ picked: string[], other? }` | required, min, max, words for Others | picked values | bars by option, share of respondents |
| Yes or no (`yesno`) | yes or no | `yes`, `no` labels | `"yes" \| "no"` | required | `yes`, `no` | bars |
| University unit (`unit`) | a unit from the Hub's directory | `sections: academic \| offices \| research` | unit id | required, must be a listed unit in those sections | the unit id | bars by unit |
| SDGs (`sdgs`) | goals, with their official tiles | `min`, `max` | `number[]` (1–17) | required, min, max | `"3"`, `"4"`… | bars with the goals' icons |
| Date (`date`) | a day | `min`, `max` | `YYYY-MM-DD` | required, range | the day | months |
| Dates (`daterange`) | rows mixing Date range and Date only | — | `{ from: "", to: "", entries: [{ mode, from, to }] }`; legacy `{ from, to }` and `{ dates }` remain readable | each day required; range endpoints ordered | — | months |
| Number (`number`) | a number | `min`, `max`, `unit` ("people") | `number` | required | — | sum, average, range |
| Amount (`money`) | pesos | `max` | `number` (centavos rounded) | required | — | total, average, range |
| Link (`link`) | an https link, showing what it opens (Google Forms, Docs, Drive, PDF…) | `placeholder` | `string` (normalized https) | required, https only, no credentials | `link` when filled | answers in words |
| People (`people`) | people one by one, each name in parts (last, first, optional middle) | `ask: phone \| email`, `min`, `max`, `domain`, `roles` (one person per role, in order), `noun` | `[{ lastName, firstName, middleName, name, phone?, email?, role? }]` (`name` is the full name, first to last) | names, phones, emails and domain, counts | `people` when filled | how many people |
| Rows (`table`) | rows of the same questions: phases, activities, speakers, fixed aspects | `columns [{id,label,type,required,options,optionsFrom,placeholder,examples,max,showIf,wide}]`, `min`, `max` (30), `rows` (fixed, named rows), `numbered` ("Phase" → Phase 1, 2…), `add` | `Row[]` (cells: text, number, `{from,to}`) | row count, each shown cell | `rows` when filled | how many rows, bars per choice column; fixed rows count as answers in words |
| Counts (`counts`) | numbers by group, with the total and its mix | `rows [{id,label}]`, `total` | `{ [rowId]: number }` | total above zero when required | — | total, bars by group |
| Budget (`budget`) | lines of quantity × rate × days, each paid from a source | `sources [{id,label}]`, `categories [{id,label,hint,presets,custom,perDay}]`, `per` (a table field: one budget per row, e.g. phase), `fixed` (presets are the lines), `theoretical`, `caps` (recipients' names) | `{ lines: [{ key, part?, category, item, qty, rate, days, source, recipient? }] }` | a line with an amount when required, item names, recipients where asked, parts that exist; **locked rates and preset sources are forced on the server** | category ids with an amount | totals by source (first source in gold), by category, average |
| Budget summary (`budgetsummary`) | nothing typed: one source of an earlier budget added up by category from every part (the paper's "Summary of budget under CSF"); with `payee`, who each category is paid to | `budget` (the budget field), `source` ("csf"), `payee [{value,label}]` | none; with `payee`, `{ [categoryId]: payee }` | with `payee` and `required`, a payee for every category with an amount | — | — |
| Declarations (`consent`) | statements to tick | `statements [{id,text,hint}]` | agreed ids | all ticked when required | agreed ids | — |
| Typed signature (`signature`, kept to read answers sent before the e-signature became a tick; not in the Builder's palette) | typed names in parts, one per signer, the full name shown in ink | `signers` (role labels) | `[{ lastName, firstName, middleName, name, on }]` (`on` set on arrival) | each signer named when required | — | — |
| Note (`note`) | nothing; words between questions | `text` | — | — | — | — |

**Step 0, data privacy** (every form, not part of the schema): before the first question the responder page shows
the notice in lib/forms/privacy.ts (PrivacyStep.tsx), built to be read at a glance: the law as a pill, six "What we
collect" tiles (icon, label, a few words), "Who uses it" as two cards (the Office of the QS/THE Rankings on onyx, UST
SIMBAHAYAN on gold-washed paper, four one-line uses each), three promises in one strip (never sold, seen by
reviewers only, kept while needed), the respondent's rights folded in a disclosure, and two titled statements to
agree to. Keep each line short; detail belongs in the disclosure, not in more paragraphs. No other step opens until both are ticked, and `submitFormResponse` refuses a response without them
(`readConsent`). The consent is saved as `form_responses.privacy_consent` (`{ version, agreed }`, given at
`submitted_at`). Change `PRIVACY_VERSION` whenever the notice's words change: drafts and sends with an older version
are asked to agree again.

**Persons' names** are always asked in parts, Last name, First name and Middle name (optional), and always in
capitals: people, e-signatures, a budget's recipients (`recipientName`, with the full name in `recipient`) and a
`name` table column (its cell is `{ lastName, firstName, middleName }`). Last and first names are required when the
name is ("Enter the speaker’s first name."). Answers sent before names had parts keep their whole name.

**Names in capitals, letters only**: every person's name, the review's signatory names, and a short answer or text
column with `caps` (an organization's name). Only letters of any alphabet (Ñ, É…) and spaces go in: digits, symbols
(`.`, `-`, `'` included) and emoji are taken out as they're typed, and letters come out in capitals. The server
capitalizes and checks the name again ("Use letters only, like JUAN DELA CRUZ."). `caps` on people, e-signatures
and budgets is from before and does nothing.

**No emoji anywhere**: `useNoEmoji()` (controls.tsx, mounted by the responder page and Digital Forms) keeps emoji
out of every text box: an emoji typed or picked on its own never goes in, and pasted or dictated text lands without
its emoji. The server strips emoji from every answer (`oneLine`, `lines`), refuses them in a form's title,
description, number and questions (schema.ts, form.save) and in a review note. The helpers are in lib/forms/letters.ts.

Table column types are `text`, `name` (a person's name in parts), `paragraph`, `choice`, `date`, `daterange`, `number`, `money`, `link`. A choice
column can take its options from an earlier table (`optionsFrom`): one option per row (`Phase 1 · Preparation`).
When a row of a table is removed on the responder page, `afterRowRemoved()` removes what pointed at it (budget lines
for that phase, an activity's phase) and moves later references up one.

## 5. Presets

Presets live in `src/lib/forms/presets.ts`. Each returns module specs with UST's wording and rules, taking only what
changes between forms (an id, a limit, rates). `PRESETS` lists them for the Builder's palette. A form copies its
presets when built; changing a preset later never changes a live form.

| Group | Preset | Builds |
|---|---|---|
| Who | `shortText(id, label)` | a required one-line question |
| Who | `organizations(id, label)` | organizations, one per row (empty = none) |
| Who | `affiliation()` | University-wide organization / NSTP / local organization or academic unit / Others |
| Who | `academicUnit(id)` | a college or faculty from the directory |
| Who | `contactPersons(id, max)` | names, phones and UST emails, up to `max` |
| Who | `officers(id, label, roles)` | one named person per role with a UST email (President, Treasurer) |
| What | `programAreas(id, max)` | the nine community development program areas, up to `max` |
| What | `targetSdgs(id, max)` | SDGs, up to `max` |
| What | `sentences(id, label, help, count)` | a paragraph with a sentence limit |
| What | `expectedResults(id, aspects)` | one expected result per aspect (Project, Implementers, Community) |
| Where and when | `participants(id)` | participants by group (community and each kind of Thomasian) with the total |
| Where and when | `phases(id, min, max)` | numbered phases: name, mode, dates, venue, and a meeting link when online or hybrid |
| Where and when | `projectFlow(id, phasesId)` | activities by phase: time, activity, person in charge, details |
| Money | `budgetPerPhase(id, phasesId, rates)` | a budget per phase: food at fixed rates, transport, materials, others; CSF / organization / community |
| Money | `csfSummary(id, budgetId, payee?)` | the budget's CSF lines by category with subtotals and the overall total; with `PAYEES` (SCDO / Purchasing / Supplier), the office's Item / Paid to / Amount |
| Money | `volunteerCounterpart(id, rates)` | the theoretical value of volunteers' time at fixed daily rates |
| Safety | `emergencyContact(id)`, `resourceSpeakers()` | an emergency contact; whether there are speakers and, if so, who, from where and what they're paid |
| Sign | `declarations(id, office, more)` | the Data Privacy Act consent (full text in its hint), informing participants, plus the office's own |
| Sign | `eSignature(id, what, forWhom)` | one required box to tick, "We sign this form electronically, for …", in place of signature lines; dated by the response's arrival |
| Review | `approvalChain(stages)`, `officeUse(budgetId)` | Noted / Endorsed / Approved sign-offs; proposed budget code, the summary of budget under CSF with who each category is paid to, final approved CSF budget and budget code, cash requisition, date of encoding, comments |

`RATES` holds SIMBAHAYAN's fixed rates: meals Php 175, snacks Php 100, student volunteers Php 500/day, staff volunteers
Php 2,000/day, partner community volunteers Php 1,000/day.

## 6. Template: Community Development Project Proposal

`COMDEV_PROPOSAL` (form `FM-0001`, link `/f/comdev-proposal`, references `CDP-0001`…, issued by SIMBAHAYAN, run by
the Office). The paper's instructions became the form's own rules.

| Step | Questions (presets) | From the paper |
|---|---|---|
| Project | title, lead organization, collaborating organizations, affiliation (+ academic unit for local organizations), program areas (up to 2), target SDGs (up to 3) | "Please HIGHLIGHT your selected answer" → choices; "Write NA if not applicable" → optional |
| People | contact persons (up to 2: name, phone, UST email), liquidation officers (President, Treasurer) | "2 proponents only" |
| Where and when | partner community, target participants (with total), phases (at least 2; meeting link only when online/hybrid) | the front page's phase dates and the dates/venues table, asked once |
| Plan | why this project, general objective (5 sentences each), expected results (Project, Implementers, Community), project flow by phase | "no more than five sentences"; "at least three expected results" |
| Budget | budget per phase (fixed food rates, transport with vehicle sizes and how each is paid, materials, others with token/honorarium/load), **summary of budget under CSF** (every CSF line by category with subtotals and the overall total, added up live), volunteer counterpart (theoretical) | the per-phase budget tables and the proposed CSF budget are one calculator with live totals; the paper's CSF summary table fills itself from it |
| Safety | emergency plan, nearest hospital, emergency contact, resource speakers (only if any; amount only if paid from CSF) | the speakers table |
| Sustainability | evaluation form link, project sustainability, care for creation | |
| Sign | declarations (Data Privacy Act, informing participants, links with Editor access, reports within 15 working days), one e-signature tick for the lead organization, any collaborating organization and the liquidation officers | "[insert wet signature / e-signature]" → a ticked e-signature declaration |

Review (office only): sign-offs **Noted** by the student organization adviser, **Endorsed** by the dean and the
regent (these three only for local student organizations), **Approved** by the ComDev coordinator or NSTP moderator,
**Approved** by the UST SIMBAHAYAN Director; then office use: proposed budget code, the Director's summary of budget
under CSF (Item / Paid to SCDO, Purchasing or Supplier / Amount, amounts from the proposal), final approved CSF budget,
final budget code, cash requisition number, date of encoding, comments. "For proposals submitted through the official online submission and approval system, approval will be
recorded digitally": the sign-offs are that record.

## 7. Review and status

`standing(schema, answers, review)` walks the sign-offs that apply to a response, in order. Each waits for the one
before it; a **return** or **decline** ends the chain. Status: `received` (shown as Submitted; none yet) → `in-review` → `approved` (all
approved), or `returned` / `declined`. A sign-off records the decision, the signatory's name, the day (today or
earlier), a note (required to return or decline), who recorded it and when. Only the latest sign-off can be undone.
The response row stores the status so lists filter fast.

## 8. Adding a module

1. Add its spec to `FieldSpec` in `types.ts` (and its answer shape to `Value`).
2. Add its rules to `MODULES` in `modules.ts`: `clean`, `filled`, `problem`, `tokens`, `text`.
3. Teach `readSchema()` its options (`schema.ts`).
4. Add its input to `Control` in `fields.tsx` (or `blocks.tsx`), on the Hub's pickers and field messages; never a
   native `<select>`, date or number input.
5. Add its read-back to `AnswerView` (`answers.tsx`) and its analytics (`analytics.ts`, `Analytics.tsx`).
6. Name it in `MODULE_NAMES` (`kinds.ts`) and give it an icon in `MODULE_ICON` (`FormWindow.tsx`).
7. Test the rules in `tests/forms.test.ts`.

## 9. Seeding a template as a live form

`npx tsx scripts/forms/seed-sql.mts <id> <code> > seed.sql` prints the insert for a migration; with `--update`, the
update that brings an existing form's questions up to its template (only while it has no responses, as with
`20261028200000_csf_summary.sql`). It refuses a template that doesn't pass `readSchema()` or that the check would
change. End the migration by moving `id_counters` (`form`) past the id (for an insert) and bumping
`hub_meta.version`, so running servers reload the store.

## 10. The Forms Builder

**Create form** on the Digital Forms shelf (for people who may change the forms run there) opens the Builder: start
from a blank form or the ComDev proposal template, then build. A draft's window has **Edit questions** (in its
menu, the shelf's row menu and the "What it asks" tile); open forms are changed by duplicating them.

- **Palette** (left): *Questions* lists every module (`PALETTE` in `builder.ts`); *Presets* lists `PRESETS`. Click adds
  after the selected question (or at the end of the selected or last step); drag drops it where the gold line
  shows. Review presets (sign-offs, office use) go to the review.
- **Canvas** (middle): the steps are pill tabs across the top (the shared `Tabs`, with **Add a step** in its
  actions), the last one **Review**; each step is its own page. A page shows each question rendered by its real
  input (`FieldInput`, inert), numbered as the responder page numbers them; drag by the grip or use the arrows to
  move, duplicate, remove, and the inspector's **Step** picker moves a question to another step. Review holds the
  sign-offs, then fields only the office fills in.
- **Inspector** (right): the selected question's wording, required, half width, column in responses, who a
  response is from (`schema.from`), its module's options, and its condition (`showIf`, from questions before it);
  a step's title, icon and condition; a sign-off's role, verb and condition; with nothing selected, the form's
  title, description and kind.
- **Keys:** a question's answer key is made from its label (`keyFrom`) and follows the label while the question is
  new in that sitting; after that it stays put. Option, group, source and statement values stay stable when their
  labels change, so conditions keep reading them.
- **Presets fit the form** (`fitPreset`): a field the preset brings that the form already has (same key and
  module, like the phases a budget is split by) is reused; any other clash is renamed and the preset's own
  references follow. Removing a question removes the conditions and respondent settings that read it
  (`withoutField`) and names the questions that still depend on it.
- The header runs `readSchema()` as you build: the step and question count, or "Needs a fix" with the sentence in
  the inspector. Save sends `form.save` (a new form is created as a draft and its window opens).
- Not in the Builder: a budget's preset lines and fixed rates (use the budget presets), a table column's examples
  and in-row conditions, and per-row placeholders; templates keep them.

Still to come: file uploads as a module, editing a response after sending it (returned proposals are re-sent), and
notifying the people who run a form when a response arrives.

## 11. Team copies

A form with **team copies** on (`forms.copies`, the *Team copies* switch in Edit details; on for the ComDev proposal,
and for new proposals made in the Builder) doesn't open on its questions. Its link builds a copy:

1. **Sign in** with Google from the form (choose any Google account, without typing an email first; `/auth/verify-email?back=/f/<code>` →
   `/auth/callback` → back with `?signin=<result>`, told as a toast). The proof is a signed cookie, `hub_form_who`
   (email and Google's name, 7 days, `server/email-verify.ts`), good only for a form's pages. Someone signed in to
   the Hub is known by their Hub account instead.
   The Auth creation hook admits Google identities so the selected email need not be allowlisted in advance.
   This grants no Hub account or session: the normal sign-in callback still checks registration and policy;
   the form callback closes the Auth session, removes unregistered Auth users and issues only the form cookie.
2. **Name** the copy after its event (80 characters), and choose **who can open it**: anyone with its link, or only
   the people the owner adds (by Google email, up to 30).
3. **Build copy** (`buildFormCopy`): the copy is a row of `form_responses` in status `draft` with the form's next
   reference (`hub_form_copy_create`, numbered with the responses), a 128-bit token, and the owner. Its link is
   `/f/<code>/<token>`; the start page lists the copies you own or were added to, and those opened on the device.

**Filling it in together, live.** The copy's page is the responder over the copy's answers (`useAnswers` in
`useCopy.ts`). Each change goes to the other open pages as it's typed, over a Supabase Realtime broadcast channel
(`liveChannel(copy.live)`, at most every 120 ms), and shows there at once unless they're editing that question too
(`takeLive`). Each page's presence on the channel says its step and the question with the cursor in it: the others
see a flag with the person's name in their colour on that question, small faces on that step in the rail, and the
faces under the rail (`peerColor`). Changes are saved by question once typing pauses: 3 s while the channel is up (the others
already see them), 1 s while it's down, at least every 10 s while typing goes on, and at once when the tab is hidden
(`saveFormCopy` → `hub_form_copy_save`, which merges the changed answers and clears the ones emptied); the save is announced on the
channel and the others take the copy as saved, which settles what they were shown live (`takeRemote` with `settle`;
a value shown live that no save settles within 8 s is checked against the whole copy). The server's copy is the
record: every 15 s while the channel is up, every 4 s when it isn't, the page asks what changed (`pullFormCopy` →
`hub_form_copy_pulse`), so a missed message or a dropped channel loses nothing. Two people typing in the same
question at once: the last save wins. The dock shows a green light and "Live" while the channel is up.

The channel's name is the copy's `live` id (migration `20261028260000_form_copies_live.sql`), given only to pages
the copy admits (its page and the pulse), and replaced whenever the owner changes who can open it, so someone taken
off a private copy is left on a channel no page uses. The page's CSP allows Supabase's https and wss origins. Saving runs the module rules with
`ctx.draft` (blank rows, people and budget lines stay where they were added; names in capitals; no emoji), so every
page reads well-formed answers. Each device agrees to the data privacy notice itself; the copy keeps only answers.

**Private copies.** Every save, pulse, send and page load checks access (`hub_form_copy_admits`): a private copy
admits its owner and the people they added, signed in with Google. Anyone else gets a door asking them to sign in
with an account the owner added. Only the owner changes the name and sharing (Share, `setFormCopySharing`).
Copy links are secret: the page sends no referrer outside the Hub, and isn't indexed.

**Requesting access.** Someone signed in with an account that isn't on a private copy can press Request access on
its door (`requestFormCopyAccess`, `hub_form_copy_request`, once per email, up to 20 waiting). The door then reads
"Access requested". The owner gets a toast on opening the copy, a gold count on Share, and an "Asking for access"
list in the Share sheet: Allow adds the email to the members (and moves the copy to a new live channel), Decline
drops the request (`answerFormCopyRequest`, `hub_form_copy_answer`). Adding the person by hand also clears their
request. Requests live in `form_responses.access_requests` (migration 20261028310000).

**Sending.** Send flushes the page's changes, then `submitFormCopy` checks the copy's saved answers in full (as a
response sent from a form's link), under the same rate limits, and turns the row into a received response, only over
the version it checked (a teammate's change meanwhile asks to check again). Every page open on the copy turns into
its receipt; from then on its link shows where the sign-offs stand (and a return's or decline's note) and what was
sent. Each copy is a row of the Responses table from the moment it's built (`responsesOf(id, true)`), marked
**Incomplete** with its name and last edit until it's sent, then **Submitted** (`received`) and on through the review.
An incomplete row opens read-only: no sign-offs, no Remove. The response counts take every copy (`hub_form_counts`,
a copy's `submitted_at` is its build time until it's sent); analytics and CSV take sent ones only (`isSent`). A figure
that would read 0 is left out, apart from the Responses total. A form with team copies refuses responses
sent straight from its link.

Still to come for copies: removing abandoned copies, and editing a returned copy to send it again.

