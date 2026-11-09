# The assistant

The chat behind the orb in `/admin` and `/portal`. It holds general conversations, answers questions about the Hub from the Hub's own content and live records, with what the person asking may see, compares results and works out what is holding them back, and links those answers to their sources. University-wide Administrators run it from **Administration › AI Assistant**.

## Turning it on

1. **Cloudflare.** On the AI Assistant tab, connect Cloudflare with an API token that has Workers AI Read and Edit. It builds the search index, and the first build starts when you connect. The account ID comes from `R2_ACCOUNT_ID`.
2. **A chat model.** Connect Google Gemini with a key from AI Studio, and say which plan it's on. Gemini 3.5 Flash-Lite is the default. Gemini 3.8 Flash is listed but off: on a free key it took 49 to 235 seconds and sometimes answered 503, which is past the chat's time limit.
3. **Check it.** Ask something the site answers, which should show sources, then something general, which should show none.
4. **Tune if needed.** `MIN_SIMILARITY` and `MIN_SIMILARITY_WITH_WORDS` in `src/lib/assistant/rules.ts` decide which passages reach the model, and were set from real questions. If Hub questions come back as general answers, lower them.

Vercel Cron needs `CRON_SECRET`, as it already does for the deadline check. The daily round rebuilds what changed in the index.

## How a question is answered

The assistant talks like any AI assistant: small talk, general questions, explanations, writing help and follow-ups (user, 2026-11-09). What it says about the University has to come from the Hub.

`POST /api/chat` (`src/app/api/chat/route.ts`, then `src/lib/assistant/server/chat.ts`):

1. Same-origin check, signed-in check, then a rate limit that stops the request if the counter can't be reached.
2. The model must be connected, switched on, within budget and within the person's daily limit, and open to them or approved for them.
3. If this person may read live records and a model may write from them, a model chooses which the question needs (`planLookups`), or that it needs none. It sees the question and the lookups' descriptions, never a result. The server reads what it chose (`server/data-tools.ts`).
4. Unless it's small talk, the question is embedded with Cloudflare's `bge-m3` and searched in `assistant_chunks`.
5. Each result must pass `pickPassages`: close enough, allowed at the model's level, still live on the site, and visible to this person.
6. The model writing the answer gets the conversation, whatever passed, and the records as numbered sources. It has no tools. With neither, it answers from its own knowledge, or says it doesn't have a Hub fact.
7. The text streams to the chat. Made-up citations are removed. An answer citing no source shows the records it read, if any, or none, and only counts are stored, in `assistant_usage` (`answered` used the Hub, `general` didn't).

**Who writes when.** Live records are internal, so a model on Google's free plan never gets them. With Gemini chosen, it does the choosing, since that sends nothing it wasn't already sent, and writes general answers. When records were read, or the chat already holds an answer built on them, a model that may read them writes instead (`dataModelFor`: the backup first, then free ones) and a toast says so. A later request to Gemini gets `WITHHELD_TURN` in place of such an answer, which the browser marks with `internal`. With no such model, or for someone with no lookups, the assistant behaves as if live records don't exist.

**Why choosing is separate from writing.** When one model did both in a tool loop, GLM 4.7 Flash skipped tools and invented answers ("Harvard University"), wrote raw `<tool_call>` text into answers, wandered through four tools on one question and ran past the time limit. Gemini said it didn't have the data about half the time when left to decide. Forced to choose, in one call with nothing read back, both were reliable, and answers fell from 20 to 55 seconds to 5 to 19. Lookups take about a second: the time goes on writing, at about 45 tokens a second on GLM. One round means a model can't read one record and then decide to read another, so the choice is made all at once, up to `LIMITS.lookups`.

If a provider refuses or stalls before any text is shown, the backup model answers, if one is set (Models pill). With a backup set, the chosen model gets 8 seconds to start; otherwise 18, and 35 in all (`PATIENCE` in `answer.ts`), which leaves room for the backup inside the route's 60 seconds. An empty account or a refused key takes that provider out of the chat and rings the bell for the Administrators. If Hub search itself fails, the chat carries on without Hub information and says so.

## How answers read

Answers are Markdown, drawn by `src/components/assistant/Answer.tsx` (`react-markdown` with GitHub tables and task lists). `INSTRUCTIONS` asks for short paragraphs, lists, tables and graphs. Models don't always listen, so these hold whichever model wrote the answer:

- A line break the model typed stays a line break, and a paragraph of more than three sentences is split (`remark-answer.ts`). Lists and tables are left whole.
- While an answer arrives, `prepareAnswer` in `src/lib/assistant/format.ts` closes bold and code, and holds back half a table, link, citation or code fence, so raw symbols never flash.
- Code and graph blocks are skipped when citations are read (`outsideCode`), so `[40, 60]` in a graph is never taken for a source.

**Graphs.** A model writes a fenced `chart` block holding JSON: `type` (`bar`, `column`, `line`, `area`, `pie`), `title`, `sub`, `unit`, `labels`, `series` of `{ name, values }`, and `invert` for ranks. `parseChart` checks it and `AnswerChart.tsx` draws it in the Hub's `ChartFrame`, with its Chart and Table views.

- Unknown types become bars. A pie that isn't up to six parts of one whole becomes ranked bars. More than six series become a table, since the palette has six colours that stay apart for colour-blind readers (`--assist-series-*` in `assistant.css`, checked on `#fff` and `#1d1d1f`).
- A series or unit named "Rank" puts rank 1 at the top even if the model forgets `invert`.
- A block that can't be read says the graph couldn't be drawn, and never shows its JSON.

## The guardrail

| Layer | Where | Enforced by |
|---|---|---|
| Only approved Hub fields are indexed; no web access, and the model writing has no tools | `server/sources.ts` | Code |
| Live lookups only read, go by the same permissions as their pages, and check each unit again when reached | `dataToolsFor` in `hub-data.ts`, `server/data-tools.ts` | Code |
| A refused unit is reported as refused, never as having nothing | `search_evidence`, `unit_detail` | Code, then the model |
| Live records never reach a plan that shares data, including through a later turn | `records` and `messagesWith` in `server/chat.ts` | Code |
| Text from a record can't close a tag or carry a link or email | `cleanText` in `hub-data.ts` | Code |
| Leaders, differences and what each failing check holds back are worked out in code | `leaders`, `compareEditions`, `investigate` in `hub-data.ts` | Code |
| Causes are stated as findings from the records, anything else as "may", and what the data can't tell is said | `limits` from `investigate`, `LOOKUP.data` in `rules.ts` | Code, then the model |
| Each passage is re-checked against live permissions at question time | `canRead` in `server/chat.ts` | Code |
| Withdrawn content stops being answerable within a minute | `liveSourceIds` in `server/sources.ts` | Code |
| A key on Google's free plan gets public passages only, including as a backup | `levelsFor` in `rules.ts`, `readable` in `server/chat.ts` | Code |
| A source link only ever points to a passage the model was sent | `tidyAnswer` in `rules.ts` | Code |
| Images in an answer never load, since an address could carry what the model read to someone's server. HTML shows as text. An outside link shows its real site beside its text | `Answer.tsx` | Code |
| Graphs only use numbers from sources or the person, exactly as given | `INSTRUCTIONS` | The model |
| A unit's content with no permission named is closed, not open | `canRead` in `server/chat.ts` | Code |
| A model reciting its instructions is cut off and replaced (exact wording only, not paraphrases) | `leaksInstructions` in `rules.ts` | Code |
| A unit's text travels apart from what the Office reviewed, and its source is marked "not reviewed by the Office" | `askWithSources`, `from` on a source | Code, then the model |
| Hub facts only from sources, never guessed | `INSTRUCTIONS` | The model |
| No help fabricating evidence; instructions inside documents are ignored | `INSTRUCTIONS`, `askWithSources` | The model |

The asker's name and email aren't sent to a model, and it can't change anything in the Hub. Lookups leave out people's names and form answers, and strip emails, but a name typed into a submission's summary can't be told apart in code and stays. The person's unit name goes to the model choosing, so "our college" can be read.

**What this doesn't stop.** A model writing from records can still misread them. On real questions on 2026-11-09, GLM 4.7 Flash reported a record's figures correctly but once read a count of failures as a count of passes, and once a group's score as a fraction out of 10, which is why such keys now spell out their meaning. Leaders and differences are safe because code works them out. Anything a model concludes from a table is worth checking against its source. A model can also state something false from its own knowledge, including about UST, despite its instructions. An answer with no sources listed isn't from the Hub, but code can't tell whether it's true, and a wrong number looks more convincing as a graph: when tried, GLM 4.7 Flash once put THE's 29.5% into a graph of QS weights. General chat also uses the same free quota as Hub questions. No model can leak what it wasn't sent, so portal permissions don't depend on the model at all.

**Attack test.** `npm run test:assistant-live` tries about 70 attacks on real models, using the saved keys, and writes nothing to the Hub. It isn't in CI because it needs those keys and spends quota. Run it after changing `INSTRUCTIONS`, the default or backup model, or what gets indexed, and always before indexing a new kind of content. On 2026-11-09 Gemini 3.5 Flash-Lite passed every attack that got an answer, and GLM 4.7 Flash failed 2: it paraphrased its rules after a forged conversation, and passed on a link planted in Office text. A later run the same day, after live data was added, held 60 with 6 failures, all GLM repeating text planted in a passage: a marker, a link twice, a false announcement that evidence rules were suspended, and "the best unit" claim twice. **GLM now writes every live-data answer on the free setup, so this matters more:** `cleanText` removes links from records, but a false claim typed into a submission's summary can still be repeated as fact. A stronger model on a paid plan is the real fix.

**Data test.** `npx vitest run --config vitest.live.config.ts tests/live/assistant-data` asks real questions about live data through the real chat and permission checks, as an Administrator, a Coordinator and a Student Organizer, and prints the answers. It writes nothing, and uses real data whatever `.env.local` says about demo data. Passing means the right records were read and known wrong answers stayed out, so read the answers too. Run it after changing a lookup, `planInstructions` or `LOOKUP`.

`tests/assistant.test.ts` and `tests/assistant-data.test.ts` test the code layers with fake models. They don't measure how a real model behaves, so try real questions after changing `INSTRUCTIONS` or the model.

## What the index holds

| Content | Level | Who can read it |
|---|---|---|
| Public rankings: name, what it measures, period, deadline, method changes, public note, indicator name, weight and definition | Public | Anyone signed in |
| The ranking bodies' full names and the rankings under each | Public | Anyone signed in |
| Published stories, article and report abstracts | Public | Anyone signed in |
| Public dictionary, evidence standards, questions, policies, calendar (while the section is on) | Public | Anyone signed in |
| About the Office: purpose, vision, deliverables, team, governance, contact | Public | Anyone signed in |
| The portal's Knowledge Center questions and policies | Internal | `knowledge.view`, and never a free Google key |

Left out of the index on purpose: rankings' strengths, gaps, targets and owners, unit coordinators and emails, drafts, evidence, form responses, Workspace files, methodology packs, demo data, and the text inside PDFs (the Hub has no PDF reader yet). What changes belongs in a live lookup rather than the index, which is only rebuilt daily.

## What can be looked up live

| Lookup | Gives | Who, by page permission |
|---|---|---|
| `hub_overview` | Every edition's status, points, readiness, top fixes | `rankings.view` |
| `ranking_detail` | One edition's groups and indicators, most at stake first | `rankings.view` |
| `investigate_gaps` | Why: failing checks and what they hold back, weakest groups, fixes, data problems, who owes what, change since a snapshot, what can't be told | `rankings.view` |
| `compare_editions` | Two editions side by side, with differences | `rankings.view` |
| `activity_summary` | The activity register, counted | `rankings.view` |
| `benchmarks` | Published results by year, and gaps to peers | `rankings.view` |
| `data_requests` | Who was asked for what, and what is overdue | `rankings.view`, or `data.view` for their units |
| `action_items` | The action plan | `rankings.view`, or `evidence.view` for their units |
| `unit_standings` | The leaderboard, with who sent most | `units.view` |
| `unit_detail` | A unit's submissions and answers, or several compared | `evidence.view` in that unit |
| `search_evidence` | Submissions by words, unit, status, ranking or SDG | `evidence.view` in that unit |
| `forms_summary` | Forms and response counts, never answers | `forms.view` and `evidence.view` |
| `publications_status` | Stories by state | `posts.view` or `stories.view` |

So a University-wide Administrator has them all, a Coordinator or unit Administrator has the last seven for their unit and the standings, and Student Organizers and External partners have none.

Not available: accounts, audit logs, what people answered on forms, Workspace files, and what's inside uploaded files. What a lookup can't answer depends on what's in the Hub too. On 2026-11-09 there were no peer institutions, snapshots, action items or data requests recorded, so comparing with competitors and tracking change over time say so instead of answering. On a demo deployment evidence and units include its presentation data, as its pages do, and each result tells the model to say they're samples.

To add a lookup, add it to `DATA_TOOLS` and `dataToolsFor` with the permission its page asks for, then to `all` in `server/data-tools.ts`, listing each field, and add a test. Give results keys that say what they mean (`indicatorsFailingIt`, not `indicators`), and work out in code whatever a model could get wrong from a table.

To add content to the index, add a document in `sourceDocs()`, listing each field, with its `level` and the `module`, `action` and `unitId` a reader must hold. Sessions are a custom cookie, so row-level security can't filter by person. The permission check has to be in the app, and unit-owned content must pass `unitId` because `viewerCan` skips the unit check without it. Add a rule to `canRead` for each new module, and a test.

## Costs and credits

- **Connecting.** Keys are pasted, tested, stored with AES-256-GCM and never shown again. The encryption key derives from `HUB_VERIFY_SECRET`, or `SUPABASE_SECRET_KEY` without it. If that secret changes, the saved keys can't be opened, so connect the providers again.
- **Spend.** Tokens from each answer × the price on the model's row. A free plan costs nothing. Prices are data: correct them from a model's row menu. **Gemini 3.8 Flash's price rises to $1.50 / $7.50 on 2027-01-01, if you switch it on.**
- **Credits left.** An estimate: what an Administrator recorded buying, minus tracked spend. The docs read when this was built showed no way to read a balance or buy credit by API. The provider's bill is final.
- **Budgets.** A provider's models pause when it reaches its monthly budget. Set a cap on the provider's own site as well, where one is offered.
- **Notices.** Low credit and budget notices ring the bell once, on the message that crosses the line. A provider that stops also goes to `HUB_ALERT_WEBHOOK`.
- **Access.** The chat's settings list every model, grouped by tier: Free when its provider is on a free plan, Premium otherwise. A model that's switched off, on a provider that isn't connected or has stopped, or past budget shows as Unavailable. On-request models have a Request button. The AI tab's Models pill holds the decisions.

## Before relying on it

- The Terms and Privacy pages are still placeholders, while the chat's note points to them.
- The note says interactions may be collected and reviewed. The Hub stores only counts, but Google's free plan can use and review what it's sent.
- Check the Claude **Add credits** and **Get a key** links. They were written from memory of the console's addresses, not from a page that was read.
