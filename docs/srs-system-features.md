# 4. System Features

**System:** UST Rankings and Impact Hub, for the Office of QS/THE Rankings, University of Santo Tomas.

**Scope of this section.** This section specifies the complete, final system. It covers what is already built and what is still to be built, because the Hub is under active development and this document is its plan.

**How to read a requirement.** Each function has an ID (FR-module.number), a status, a requirement statement, and its Inputs, Processing, Outputs and Validation rules. Numeric limits are binding unless marked *default*, which means an Administrator can change them.

| Status | Meaning |
|---|---|
| **[Built]** | Implemented as specified. |
| **[Extend]** | Partly implemented. The requirement states the final behaviour, and a **To complete** line names what remains. |
| **[Planned]** | Not yet implemented. The requirement states the intended final behaviour. |

Each module ends with **Scaling provisions**: how the module should grow in capacity or scope. These are design allowances for later releases, not commitments of the current release. Section 4.32 covers scaling across the whole system, and section 4.33 lists all remaining work.

**Actors**

| Actor | Description |
|---|---|
| Public visitor | Reads the public website; has no account. |
| Applicant | Requests an account and tracks the decision. |
| Office Administrator | An Administrator with University-wide scope in the Rankings Office. Runs the Hub, reviews and approves, and never files contributions for a unit. |
| Ranking Specialist and Director | Office Administrators in their process roles: the Specialist gathers and follows up, and the Director approves final submissions and acts on escalations. |
| Unit Administrator | An Administrator of one office or college, with read-only access to that unit's data. |
| Coordinator | Files evidence, data and publications for a unit and runs its forms. |
| Student Organizer | The Secretary of a student organization, commission or council. Uses the Student Portal and belongs to no unit. |
| External guest | A temporary, read-only partner account. |
| Form respondent or collaborator | Answers a form or edits a team copy; needs no Hub account. |
| Named signatory | An adviser, dean, regent, coordinator or director who signs off a form response. |
| System automation | Scheduled jobs and automatic housekeeping. |

**Module index**

| # | Module | # | Module |
|---|---|---|---|
| 4.1 | Public Website | 4.18 | Notifications and Email |
| 4.2 | Authentication and Sessions | 4.19 | Workspace Shell and Search |
| 4.3 | Access Requests | 4.20 | Administration Overview |
| 4.4 | Roles, Permissions and Scope | 4.21 | Accounts |
| 4.5 | Personal Account Window | 4.22 | Organizational Directory |
| 4.6 | Dashboards | 4.23 | Data Governance |
| 4.7 | Rankings and Deadlines | 4.24 | Approval Workflows |
| 4.8 | Analytics Engine | 4.25 | Privacy and Security |
| 4.9 | Final Submission Management | 4.26 | Audit Trail |
| 4.10 | Evidence Contributions and Validation | 4.27 | System Configuration |
| 4.11 | Assistance Requests | 4.28 | Backup and Recovery |
| 4.12 | Units, Honours and Recognition | 4.29 | Automation and Common Services |
| 4.13 | Publications | 4.30 | Reputation Survey Contacts |
| 4.14 | Workspace and Knowledge Center | 4.31 | External Data Connections |
| 4.15 | Digital Forms | 4.32 | System-Wide Scaling |
| 4.16 | Student Portal and Team Copies | 4.33 | Remaining Work Summary |
| 4.17 | Reports | | |

---

## 4.1 Public Website

Presents approved ranking, publication and recognition information to anyone, without signing in. Everything shown is decided by governance settings: a ranking appears only if tracked, marked public and backed by a results dataset classified Public.

**FR-4.1.1 Site frame and navigation. [Built]** The system shall give the public site its own header, menus and footer, separate from the workspaces.
- **Inputs:** Page request; public rankings, sections switched on, and the deadline calendar.
- **Processing:** Builds mega-menus for Rankings (by body), Publications, Recognition, Knowledge and About, with a calendar of what is still to close. Follows the University's visual identity.
- **Outputs:** Header, menus, loading mark, footer, and a sign-in link.
- **Validation:** Menu entries for switched-off sections or non-public rankings are not shown.

**FR-4.1.2 Home page. [Built]** The system shall present the University's public ranking position and the Office's work on one landing page.
- **Inputs:** Public rankings, published stories, active units.
- **Processing:** Assembles the animated hero, biggest ranking movers with a chart, ranking menu, where each contribution counts, the contribution process, story folders, an adaptation invitation for published stories, the top 10 units by rankings served, and an Office panel.
- **Outputs:** The home page.
- **Validation:** Sections without data are omitted. Reduced-motion preferences are honoured.

**FR-4.1.3 Rankings index. [Built]** The system shall list public rankings grouped by body.
- **Inputs:** Ranking frameworks and configuration.
- **Processing:** Shows each ranking's latest position and direction.
- **Outputs:** A rankings index.
- **Validation:** Only rankings in the public set appear.

**FR-4.1.4 Ranking detail. [Built]** The system shall publish one ranking's public page.
- **Inputs:** Ranking slug.
- **Processing:** Loads the result, trajectory chart, interpretation, dimensions and calendar dates.
- **Outputs:** A ranking detail page; a Not Found page for a non-public ranking.
- **Validation:** Missing figures stay blank and are never estimated. No internal evidence is shown.

**FR-4.1.5 Stories & News. [Built]** The system shall run a newsroom of published stories.
- **Inputs:** Theme tab, SDG filter, search text; story slug.
- **Processing:** Shows a lead story, the latest stories and an archive. Renders each story in its chosen layout, with gallery and related stories.
- **Outputs:** A newsroom page; an article page.
- **Validation:** Published items only. Requires `public-publications` on and the stories dataset classified Public; otherwise Not Found.

**FR-4.1.6 Research Articles. [Built]** The system shall list published research articles and open a detail page.
- **Inputs:** Search and filters; article slug.
- **Processing:** Shows the featured article first, then authors, venue, date, abstract, SDGs and keywords. Generates a citation.
- **Outputs:** A list; a detail page with DOI or source link, PDF download and a Cite button that copies the citation.
- **Validation:** Published items only. A PDF is available only while its document is published.

**FR-4.1.7 Reports & Insights. [Built]** The system shall show published reports on a shelf with generated covers and detail pages, under the same rules as FR-4.1.6.

**FR-4.1.8 Public Recognition page. [Extend]** The system shall show achievements, contributing units, innovations and sustainability partners.
- **Inputs:** Validated contribution data; approved awards (FR-4.12.7).
- **Processing:** Summarizes each category; empty categories are omitted.
- **Outputs:** The Recognition page.
- **Validation:** Not Found when `public-recognition` is off. Only approved awards appear.
- **To complete:** Replace presentation award data with awards from the workflow in FR-4.12.7.

**FR-4.1.9 Public Knowledge Center. [Built]** The system shall publish methodologies, a dictionary, templates and deadlines.
- **Inputs:** Section and search term.
- **Processing:** Reads reference data from the database.
- **Outputs:** Knowledge Center page.
- **Validation:** Not Found when `public-knowledge` is off.

**FR-4.1.10 About the Office. [Built]** The system shall publish the Office's mission, ranking portfolio, roles, deliverables, team, data governance, accessibility and contact details, including a methodology disclaimer.

**FR-4.1.11 Policy pages. [Extend]** The system shall publish Privacy, Terms of Use and Cookies pages.
- **Inputs:** Policy text; configured privacy contact and notice date.
- **Processing:** Renders the current approved text with its last-updated date.
- **Outputs:** Policy pages linked from the footer and forms.
- **Validation:** The text must cover every personal data item collected, including the birthday on access requests.
- **To complete:** Replace any placeholder text with text approved by the Data Protection Officer.

**FR-4.1.12 Public search. [Built]** The system shall search public content from a modal.
- **Inputs:** Typed query.
- **Processing:** Ranks matches across public rankings, published stories, active units and dictionary terms.
- **Outputs:** Grouped, keyboard-navigable results.
- **Validation:** The public index holds no evidence, notices, requirements or internal data.

**FR-4.1.13 Anonymous post view counting. [Built]** The system shall count article views without identifying visitors.
- **Inputs:** Post slug, sent only when an article is actually visible.
- **Processing:** Counts per Manila day using a hashed client key and a revisit window.
- **Outputs:** Daily counts for FR-4.13.11.
- **Validation:** Slug must match `^[a-z0-9][a-z0-9-]{0,119}$`. Bots, crawlers and previews are ignored. Only visible published posts count. Views per client per hour are capped.

**FR-4.1.14 Public and internal view switch. [Built]** The system shall let signed-in staff move between a page's public and internal versions, staying on the equivalent page.

**FR-4.1.15 Site notice. [Built]** The system shall show the administrator-set notice across the site (FR-4.27.10).

**FR-4.1.16 Campus sustainability map. [Planned]** The system shall show sustainability activity on a campus map on the relevant ranking dashboard.
- **Inputs:** Buildings and sites with coordinates; activities and campus indicators linked to them.
- **Processing:** Plots sites and layers, such as energy, water, waste and green space, from validated data only.
- **Outputs:** An interactive map with a keyboard-accessible list alternative.
- **Validation:** Requires location data for each site. Only Public-classified figures appear on the public version.

**Scaling provisions**
- Add new rankings to the public site by adding a framework record, with no code change.
- Serve public pages through CDN caching, so ranking-season traffic does not reach the database.
- Add language versions, starting with Filipino, through a translation layer for labels and an approved-translation field for content.
- Offer an RSS feed and open data downloads of published results and stories.
- Add structured data for search engines and scholarly indexing of research articles.

---

## 4.2 Authentication and Sessions

**FR-4.2.1 Google sign-in. [Built]** The system shall authenticate users through Google and then apply the Hub's own access rules.
- **Inputs:** Google identity (email, name, photo, hosted domain); optional return path; "Keep me signed in".
- **Processing:** Exchanges the Google code through Supabase Auth and closes that session at once. Checks, in order: University domain proof, registration, status, allowed domain or guest policy, active role. Creates a Hub session and activates a Pending Invitation on first sign-in. Removes the Supabase user for anyone unregistered or pending. Refreshes the profile photo from Google's photo host only.
- **Outputs:** A session cookie and a redirect to the active role's workspace, or a sign-in page message.
- **Validation:** Refusal reasons are not-registered, pending, suspended, deactivated, domain, guests and no-role. A University-domain email must come from the University's Google Workspace. A UST email alone never grants access. The return path may only be under `/admin` or `/portal`. Every attempt is audited. A database gate also refuses unknown emails before an Auth user is created.

**FR-4.2.2 Multi-factor authentication. [Planned]** The system shall require a second factor according to policy.
- **Inputs:** Policy mode (Everyone, Privileged roles, Off), roles, allowed methods; authenticator code or security key.
- **Processing:** After Google sign-in, issues a challenge before opening a session. Provides enrolment for an authenticator app or security key, with single-use recovery codes. Forced re-authentication asks for the factor again.
- **Outputs:** A session marked as second-factor verified; enrolled methods listed under Sign-in & security.
- **Validation:** Challenges expire after 10 minutes. Attempts are limited and count toward lockout. Recovery codes are stored hashed. Enrolment and removal are audited. An administrator can reset a person's factor only with a recorded reason. When the mode is Off, sign-in relies on Google's own 2-Step Verification, as it does today.

**FR-4.2.3 Sign-in lockout. [Planned]** The system shall temporarily block repeated failed sign-ins.
- **Inputs:** Failed attempts by email; policy attempts and window (*default* 5 in 15 minutes).
- **Processing:** Counts failures in the window, blocks further attempts until it ends, and raises a "Repeated failed sign-ins" alert.
- **Outputs:** A refusal message that does not reveal whether the account exists; a security alert.
- **Validation:** Attempts 3–20; window 5–120 minutes. A successful sign-in clears the count. Blocks are audited.

**FR-4.2.4 Session control. [Built]** The system shall re-check the session on every request.
- **Inputs:** Session cookie; security policy; personal preferences.
- **Processing:** Stores only the SHA-256 of a 32-byte random token. Heartbeats keep the session alive during activity. Expired sessions are removed and audited.
- **Outputs:** A viewer context, or a session problem: ended, expired, suspended or reauth.
- **Validation:** *Default* limits are 30 minutes idle, 12 hours absolute and a 2-minute warning. Suspension, revocation or forced re-authentication takes effect on the next request. In production the cookie is `__Host-`, Secure, HttpOnly and SameSite=Lax.

**FR-4.2.5 Idle warning. [Built]** The system shall warn before idle sign-out and let the person stay.
- **Inputs:** Activity signals; idle and warning limits.
- **Processing:** Shows a warning in the last minutes, then signs out if nobody answers. A person who chose to stay signed in only sends heartbeats.
- **Outputs:** A warning dialog, then redirect to sign-in with a toast.
- **Validation:** The server enforces the same limit independently.

**FR-4.2.6 Sign-out. [Built]** The system shall end the current session.
- **Inputs:** Sign-out, or "clear cookies and sign out".
- **Processing:** Removes the session, clears the Hub cookies and the form identity cookie, and audits the time in use.
- **Outputs:** Redirect to `/signin` with a toast, after which the URL parameter is removed.
- **Validation:** Needs no input.

**FR-4.2.7 First administrator bootstrap. [Built]** The system shall create or restore an Administrator from a configured address when no active University-wide Administrator exists.
- **Inputs:** Sign-in by the `HUB_BOOTSTRAP_ADMIN` email.
- **Processing:** Creates or restores the account and makes the Administrator role active.
- **Outputs:** A working Administrator; an audit entry.
- **Validation:** Does nothing while any active University-wide Administrator exists, and warns in production if the setting remains.

**FR-4.2.8 New-device alert. [Extend]** The system shall raise a security alert when an account signs in from a device not seen before.
- **Inputs:** Browser and system label; the account's audit history.
- **Processing:** Compares against earlier sign-ins.
- **Outputs:** A medium-severity alert.
- **Validation:** Applies to External accounts today.
- **To complete:** Extend to privileged accounts, and email the person (FR-4.18.3).

**FR-4.2.9 Sign-in page. [Built]** The system shall present sign-in with an animated night scene, "Sign in via Institution Account", "Request access", and the Submission Tracker, and show each refusal or session ending as a toast.

**Scaling provisions**
- Add other identity providers (Microsoft, SAML, or the University's future identity system) behind the same second-half checks in FR-4.2.1.
- Move session reads from the governance store to a dedicated session service with its own expiry, so busy periods do not touch the main store.
- Support step-up verification for sensitive actions such as restores and exports.
- Support passkeys as a first factor for External guests who have no Google account.

---

## 4.3 Access Requests

**FR-4.3.1 Request access form. [Extend]** The system shall let a person without an account apply in three steps: Profile, Affiliation, Declarations.
- **Inputs:** Last, first and optional middle name; salutation; birthday; email; affiliation with suggestions; organization or website where asked; for a Thomasian, role, section and unit; three declarations (true details, Data Privacy Notice, Terms of Use).
- **Processing:** Opens an account-access approval request. External applicants are placed with the Office as guests, and Student Organizers are kept with the Office. Keeps the applicant's details on the request.
- **Outputs:** A reference (RQ-####), a timestamp, a receipt with a tracker link stating a review time of 3 to 5 working days, and a copy of the receipt by email.
- **Validation:**
  - Names: capitals, letters and spaces only. Middle name optional.
  - Salutation: from the list, an "Other" entry with letters (24 characters at most), or "Prefer not to specify".
  - Birthday: a real date from 01/01/1900 and at least 15 years ago.
  - Email: valid format. Thomasians must use a UST domain proved through Google; a UST email cannot be used with an outside affiliation.
  - Thomasian: role required. Administrators and Coordinators choose a University Office or College/Faculty and a listed unit. Student Organizers name their organization.
  - External: affiliation may use letters, spaces, hyphens, em dashes, slashes and parentheses. A website is a plain `https` address of 200 characters at most, shown to approvers only as text.
  - All declarations must be accepted. A duplicate account or pending request is refused.
  - Limits: 5 requests per network per hour, 60 overall per hour, 200 pending. If the rate counter cannot be reached, nothing is sent.
- **To complete:** Send the receipt email (FR-4.18.2). The receipt already states that a copy is sent.

**FR-4.3.2 Email verification. [Built]** The system shall prove ownership of a UST email during the request.
- **Inputs:** Typed email; Google account selection.
- **Processing:** Sends the person to Google for that address and Workspace, then sets a signed proof cookie. The form's answers are kept in the tab during the trip.
- **Outputs:** A result toast: verified, cancelled, not-ust, other-account, expired, busy or unavailable.
- **Validation:** Allowed domains only. 20 verifications per network per hour. Grants no account or session.

**FR-4.3.3 Submission Tracker. [Built]** The system shall show an applicant where their request stands.
- **Inputs:** Reference code (accepts forms such as `rq-4`) and email.
- **Processing:** Looks up the request and polls while open. Computes four stages: received, under review, decision, first sign-in.
- **Outputs:** Stages and a status: Under review, Approved, Signed in, Not approved or Withdrawn.
- **Validation:** Both values must match, and a miss never says which was wrong. 20 failed lookups per network per hour. Only stages and any rejection note are revealed, never who decided.

**FR-4.3.4 Domain evidence for approvers. [Built]** The system shall compare an applicant's email and website with domains known for the affiliation.
- **Inputs:** Email, affiliation, website.
- **Processing:** Classifies the email as university, match, mismatch, personal or unknown, and notes whether the website shares its domain.
- **Outputs:** A verdict in the approval sheet.
- **Validation:** Advisory; the approver decides.

**FR-4.3.5 Approval of an access request. [Built]** On approval the system shall create the account with its role.
- **Inputs:** Request; the unit confirmed by the approver.
- **Processing:** Follows FR-4.24.2. External access ends 90 days after approval.
- **Outputs:** A new account; the tracker updates.
- **Validation:** Re-checks the email, unit, role and guest policy at approval.

**FR-4.3.6 Applicant data minimization. [Built]** The system shall remove the birthday and website 30 days after a request closes, and audit the removal.

**FR-4.3.7 Decision email. [Planned]** The system shall email the applicant when their request is approved, rejected or withdrawn, with a sign-in link or the rejection note, using the templates in FR-4.18.2.

**Scaling provisions**
- Extend the affiliation and known-domain lists through reference data, with no code change.
- Add configurable review times per workflow, shown on the receipt.
- Add an annual renewal path for External guests instead of a new request.

---

## 4.4 Roles, Permissions and Scope

**FR-4.4.1 Role model. [Built]** The system shall authorize every action by role, action and scope.
- **Inputs:** The account's assignments. Four roles (Administrator, Coordinator, Student Organizer, External), 19 modules, 8 actions (view, create, edit, delete, submit, approve, export, manage).
- **Processing:** Permissions come from the active role. Scope limits reach by units (with descendants), ranking bodies, cycles and datasets. An Administrator holds full oversight only when assigned University-wide. Oversight excludes filing contributions.
- **Outputs:** Grants, a permitted workspace (Office or Portal), and navigation showing only permitted pages.
- **Validation:** The server re-checks every page and command; hidden navigation is not the control. Refusals are audited as Denied.

**FR-4.4.2 Active role switching. [Built]** The system shall let a person with several assignments act in one at a time.
- **Inputs:** Assignment ID.
- **Processing:** Sets the active assignment and recomputes permissions and landing page.
- **Outputs:** A toast and redirect to that role's workspace; an audit entry.
- **Validation:** The assignment must be the person's own and not expired.

**FR-4.4.3 Role permission editing. [Built]** The system shall let Rankings Office Administrators change what each role may do, in a matrix per scope.
- **Inputs:** Role, scope (unit or university), new permissions, and the permissions the editor started from.
- **Processing:** Normalizes the set, computes each granted or removed action, and saves it.
- **Outputs:** Updated roles; an audit entry listing each change.
- **Validation:** Unknown modules or actions are rejected. A change made by someone else during editing is refused. The Office's authority to manage roles cannot be removed.

**FR-4.4.4 Permission overview. [Built]** The system shall show each role's permissions, reach, holders and temporary access.

**FR-4.4.5 Temporary access expiry. [Built]** The system shall end expired assignments and data grants automatically and audit each one.

**FR-4.4.6 Anti-escalation. [Built]** The system shall refuse any grant beyond the actor's own authority, and route an increase in an active account's tier through FR-4.24.

**Scaling provisions**
- Add Office process roles (Ranking Specialist, Senior Specialist, Director) as named workflow step holders without adding full roles.
- Add new modules or actions to the catalogue, which the matrix and checks pick up automatically.
- Add delegated authority for a fixed period while a Director or Coordinator is away.
- Add ranking-body scoped reviewers, such as a GreenMetric lead, using the existing scope axes.

---

## 4.5 Personal Account Window

Opens from the sidebar profile with tabs: Overview, Edit profile, Roles & access, Sign-in & security, Devices, Logs, Notifications, Data & privacy, Language, Support, Settings.

**FR-4.5.1 Overview. [Built]** The system shall show the person's activity statistics, badges, activity by day, member-since date and last sign-in, counted from their audit entries.

**FR-4.5.2 Edit profile. [Built]** The system shall let a person change their own name and position.
- **Inputs:** Full name; position.
- **Processing:** Saves the change and audits it. Never accepts an account ID or access field.
- **Outputs:** A toast and the updated profile.
- **Validation:** Name 3–160 characters; position 160 at most; the account must be Active.

**FR-4.5.3 Roles & access. [Built]** The system shall list the person's roles, scopes and end dates, with a Switch action (FR-4.4.2).

**FR-4.5.4 Sign-in & security. [Extend]** The system shall show the sign-in account and method and let the person manage session preferences and second factors.
- **Inputs:** Idle minutes or none; stay signed in; factor enrolment.
- **Processing:** Stores the choice. Staying signed in extends the cookie up to the absolute session limit.
- **Outputs:** Updated session behaviour; an audit entry.
- **Validation:** Idle is a whole number from 5 up to the policy limit. The absolute limit cannot be changed by the person.
- **To complete:** Factor enrolment (FR-4.2.2).

**FR-4.5.5 Devices. [Built]** The system shall list active sessions and let a person end one or all others.
- **Inputs:** Session ID, or "all others".
- **Processing:** Ends the selected sessions and audits them.
- **Outputs:** An updated list and a toast.
- **Validation:** Only the person's own sessions.

**FR-4.5.6 Personal logs. [Built]** The system shall show the person's own recent audit entries.

**FR-4.5.7 Notification preferences. [Extend]** The system shall let a person choose what they receive per channel.
- **Inputs:** Email on or off; kind and channel pairs switched off, across New submissions, Review results, Request decisions, Publications, Deadlines, and Account and security.
- **Processing:** Saves the choice and audits it. The bell hides notices of kinds switched off for the Hub channel, and the mail service honours the email choices.
- **Outputs:** Updated preferences and a filtered bell.
- **Validation:** Keys must be known kinds. Account and security is always on.
- **To complete:** Apply email choices once FR-4.18.2 exists, and remove the "Coming soon" tag.

**FR-4.5.8 Data & privacy. [Built]** The system shall show the data privacy notice and contact, and let a person download their own data.
- **Inputs:** Request.
- **Processing:** Gathers account details, roles, sessions, notifications and up to 5,000 activity entries, and audits the export.
- **Outputs:** A JSON file named `hub-data-<date>.json`.
- **Validation:** Requires a valid session; rate-limited.

**FR-4.5.9 Data subject self-service. [Planned]** The system shall let a person file a correction, objection or erasure request from this tab, which enters FR-4.25.5 with a tracked status.

**FR-4.5.10 Language and formats. [Built]** The system shall show the display language, Manila time zone and date and number formats.

**FR-4.5.11 Support. [Built]** The system shall show Office contacts, help links and keyboard shortcuts.

**FR-4.5.12 Settings. [Built]** The system shall let a person clear saved preferences, or clear cookies and sign out.

**Scaling provisions**
- Add a language choice once translations exist.
- Add weekly digest preferences (FR-4.18.4).
- Add accessibility preferences, such as reduced motion and larger text, stored per account.

---

## 4.6 Dashboards

**FR-4.6.1 Executive dashboard. [Built]** The system shall give the Office a University-wide view.
- **Inputs:** View selection (Submissions, Rankings, Recognition); governed data.
- **Processing:** Opens on the configured default view. Evidence shown is limited to what the viewer may see.
- **Outputs:** A welcome tile, submission workload, ranking overview with readiness and deadlines, standings, the Recognition wall, an as-of date and a link to Reports.
- **Validation:** Requires `dashboard: view`. The Recognition view requires `recognition-internal` on.

**FR-4.6.2 Unit dashboard. [Built]** The system shall show a Coordinator or Unit Administrator their unit's progress.
- **Inputs:** The viewer's unit and scope.
- **Processing:** Computes submission readiness, standing among comparable units, a "Next up" list, season honours, submission flow, and the rankings and SDGs served by validated evidence.
- **Outputs:** Dashboard tiles with links to the next task.
- **Validation:** Limited to the viewer's scope. Reuse insights follow the `reuse-insights` flag.

**FR-4.6.3 Student dashboard. [Built]** The system shall show a Student Organizer what is waiting.
- **Inputs:** Their copies, assignments and forms.
- **Processing:** Lists returned copies, assignments to answer and proposals in progress, then tiles per page and recently edited copies.
- **Outputs:** The Student Portal dashboard.
- **Validation:** Requires the Student role.

**FR-4.6.4 External guest workspace. [Built]** The system shall show a guest only what is shared with them.
- **Inputs:** Guest's approved data grants.
- **Processing:** Lists datasets, published reports, and methods and results. Downloads follow the sharing policy.
- **Outputs:** A "Shared with you" page, with a request form for more data.
- **Validation:** Read-only. Access ends on the assignment's end date.

**FR-4.6.5 Leadership summary. [Planned]** The system shall give University leadership a read-only quarterly view.
- **Inputs:** Active editions, action items, snapshots.
- **Processing:** Shows positions, movement since last quarter, top risks, and decisions needed.
- **Outputs:** A one-page view and a downloadable PDF.
- **Validation:** Requires a read-only leadership permission set; no record-level data.

**Scaling provisions**
- Let administrators choose tiles and their order per role.
- Add Dean-level quarterly review dashboards per college, per the Office's subject procedure.
- Add per-subject dashboards as QS and THE by Subject data grow.

---

## 4.7 Rankings and Deadlines

**FR-4.7.1 Ranking catalogue. [Built]** The system shall list tracked rankings by group with position, readiness and items to go.
- **Inputs:** Ranking frameworks and configuration. Currently THE WUR, THE Impact, THE by Subject, QS WUR, QS Sustainability, QS by Subject, UI GreenMetric and WURI.
- **Processing:** With an active analytics edition, readiness and pending counts come from the engine, cached for 60 seconds.
- **Outputs:** Ranking cards and sidebar groups.
- **Validation:** Disabled bodies and rankings are excluded. Requires `rankings: view`.

**FR-4.7.2 Ranking workspace page. [Built]** The system shall present one ranking in tabs: Overview, Indicators, Evidence, Units, Action plan, Methodology.
- **Inputs:** Ranking slug; filters.
- **Processing:** Combines indicators, linked evidence by status, contributing units, strengths, gaps, opportunities and an Analytics tile. Answers five questions: where we stand, why, what is missing, who owns it, and what comes next.
- **Outputs:** A hero with rank curve and readiness dial, tabbed content, and Reports in a drawer.
- **Validation:** Evidence is limited to the viewer's scope. Missing data shows an empty state.

**FR-4.7.3 Framework-specific dashboards. [Extend]** The system shall provide a tailored board for each framework family.
- **Inputs:** Ranking data.
- **Processing:** THE Impact: all 17 SDGs and an impact evidence ladder. QS and THE WUR: research influence, reputation and reach, pillars, research funnel and signals. By Subject: subject portfolio, comparison and distance to threshold. QS Sustainability: connections. WURI: innovation pipeline, categories and submitted projects.
- **Outputs:** Dashboard tiles in the ranking page.
- **Validation:** Each tile shows an empty state without data.
- **To complete:** Replace fixed figures with values from the engine as each framework's edition loads (FR-4.8.2).

**FR-4.7.4 Indicator detail. [Built]** The system shall open an indicator's definition, formula, owner, history, linked evidence and recommended actions in a drawer.

**FR-4.7.5 Indicator diagnostic. [Extend]** The system shall explain a ranking's main gap.
- **Inputs:** Ranking; engine results; benchmarks; bibliometric data.
- **Processing:** Computes the principal gap, history against target, where the score comes from, a breakdown by cluster, improvement actions and linked evidence.
- **Outputs:** A diagnostic page.
- **Validation:** Shows an empty state without values and targets. Every figure traces to a recorded value.
- **To complete:** Replace fixed illustrative breakdowns and recommendations with computed ones. Source bibliometric figures from FR-4.31.

**FR-4.7.6 Set dates manually. [Built]** The system shall let the Office set a ranking's deadline and calendar dates.
- **Inputs:** Deadline; dated entries, each with a label and date.
- **Processing:** Records the source as Manual with who and when, and settles any matching waiting finding.
- **Outputs:** An updated calendar; an audit entry.
- **Validation:** Requires `config: edit`. Valid dates only. At most 20 entries per ranking. Labels required (120 characters at most), unique, and may not reuse the deadline's label.

**FR-4.7.7 Automatic deadline check. [Built]** The system shall read ranking bodies' public pages and report changed dates without applying them.
- **Inputs:** Configured sources with fixed reading rules; triggered daily or by "Check now".
- **Processing:** Fetches each page with a named user agent and a 15-second timeout, and signs in nowhere. Records each source's status (Read, Waiting, Failed, Manual). Creates a finding for a date that differs from the Hub's and notifies the Office. Notes when a watched page changes.
- **Outputs:** Findings with the source quote and link; "page changed" notices.
- **Validation:** Past dates are ignored. A date already raised is not raised again. The check never changes a date itself. "Check now" requires `config: edit` and is rate-limited.

**FR-4.7.8 Apply or dismiss a finding. [Built]** The system shall let the Office decide each finding.
- **Inputs:** Finding ID and decision.
- **Processing:** Apply replaces the date and records the source URL; dismiss keeps the current date.
- **Outputs:** An updated calendar and finding state; an audit entry.
- **Validation:** Only New findings. Requires `config: edit`. 200 decided findings are retained.

**FR-4.7.9 Deadline reminders. [Planned]** The system shall remind units and the Office before a deadline.
- **Inputs:** Calendar; warning days (*default* set in FR-4.27.7); open items per unit.
- **Processing:** The daily job sends in-app and email reminders at set intervals, naming how many requirements remain.
- **Outputs:** Reminder notices using the "Deadline reminder" template.
- **Validation:** Sends nothing to units with nothing open. One reminder per unit per interval.

**FR-4.7.10 Calendar feed. [Planned]** The system shall offer a subscribable calendar (iCal) of ranking dates, per role and scope, through a revocable private link.

**Scaling provisions**
- Add rankings by data: Asia editions, QS Stars, THE Interdisciplinary Science and AppliedHE, each named in the Office's procedures.
- Add more deadline sources by adding source records and reading rules.
- Move the deadline check to a queue, so more sources do not hit the job's 60-second limit.
- Add multi-year trend comparison across rankings.

---

## 4.8 Analytics Engine

Scores the University against each ranking body's methodology. A methodology is stored as data, so a new edition needs no code. Facts are what the Hub knows for an edition, and reports are computed from the two rather than stored. Office pages: Scorecard, Indicators, Data requests, Activities, Benchmarks, Data imports, Methodology. Unit page: Portal → Data requests.

**FR-4.8.1 Manage editions. [Built]** The system shall maintain a methodology edition per ranking and year.
- **Inputs:** Label, period, methodology, status, open and close dates, evidence years, notes; a target year for "Start another year".
- **Processing:** Status runs Draft, Active, Closed, Archived. The active edition drives ranking pages and readiness. "Start another year" clones the methodology as a Draft with dates moved and no facts.
- **Outputs:** Edition records; an audit entry.
- **Validation:** Requires `rankings: manage`. Year 2000–2100; one edition per ranking per year; up to 10 evidence years. An edition holding values, links or cases cannot be deleted. Archived editions refuse changes, and Closed ones accept changes only with `rankings: manage`.

**FR-4.8.2 Methodology coverage. [Extend]** The system shall hold a loaded methodology for every tracked ranking.
- **Inputs:** Each body's published methodology and data templates.
- **Processing:** Builds a validated pack per edition with groups, indicators, weights, formulas, owners and guidance.
- **Outputs:** Editions ready for use. Currently loaded: THE Impact 2026 and 2027, UI GreenMetric 2026, QS Sustainability 2027, WURI 2026 and QS by Subject 2026 (6 editions, 969 indicators).
- **Validation:** Every pack passes FR-4.8.3's checks.
- **To complete:** Load THE WUR, THE by Subject and QS WUR, then Asia editions, QS Stars, THE Interdisciplinary Science and AppliedHE, as the Office supplies their methodologies. Their reference folders are currently empty.

**FR-4.8.3 Import and export methodology packs. [Built]** The system shall move an edition as a JSON pack.
- **Inputs:** Pack file with its name, size and SHA-256.
- **Processing:** Validates the whole pack, then upserts it. Indicators missing from the pack are removed only if no facts refer to them.
- **Outputs:** Counts added, updated, removed and kept; an import log entry; a downloadable JSON on export.
- **Validation:** 8 MB at most. Codes match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$` and are unique. Formulas must parse and refer to codes in the pack. Shares are 0–1, options must exist, and aggregate and status must be known. The ranking must be tracked, and no other edition may cover the same ranking and year.

**FR-4.8.4 Maintain indicators. [Built]** The system shall let the Office edit an indicator's details and rules.
- **Inputs:** Name, reference, guidance, unit, owners, owner labels, evidence rules, roll-up, input type, score rule, feeds, tags, group, parent.
- **Processing:** Checks the change against the whole edition before saving.
- **Outputs:** The updated indicator; an audit entry.
- **Validation:** Input types are none, number, choice, picks, yesno, text, date, result and cases. Score rules are bands, choice, claim, ratio, external, dated and rubric. Formulas allow `+ − × ÷`, parentheses and `min`, `max`, `abs`, `round`, `sum`.

**FR-4.8.5 Enter the University's values. [Built]** The system shall record the Office's own figure per edition and indicator.
- **Inputs:** Value by input type, note (2,000 characters at most), draft or not-applicable flag.
- **Processing:** Saves the row and appends to its history. Statuses are Draft, For review, Validated, Needs revision and Not applicable.
- **Outputs:** An updated report and history.
- **Validation:** Requires `rankings: edit`. Number within min and max, whole where required, at most 1e15. Choices must exist. Text 4,000 characters at most. A policy's review date cannot precede its creation date. The edition must be writable.

**FR-4.8.6 Review values. [Built]** The system shall let the Office validate, return, reopen or mark a value not applicable.
- **Inputs:** Value ID, decision, note.
- **Processing:** Updates the status and history, and notifies the unit on return. Notes when someone validates their own entry.
- **Outputs:** An updated value; an audit entry.
- **Validation:** Requires `data: approve`. Returning needs a note.

**FR-4.8.7 Compute scores and readiness. [Built]** The system shall compute each edition's standing.
- **Inputs:** Catalogue, values, links, activities, benchmarks, cases.
- **Processing:**
  - Separates points into **claimed** (For review plus Validated) and **secured** (Validated with assessed links).
  - Reports each indicator's max, secured, claimed, open and lost points, its band and next band.
  - Readiness is the share of passing checks: value, validated, evidence, relevant, public, single, dates, period.
  - Aggregates by edition: sum (GreenMetric); THE Impact (SDG 17 × 0.22 plus the best three SDGs × 0.26 each); best per group (WURI); readiness only (QS Sustainability); results (QS by Subject).
  - University roll-up: the Office's row wins; otherwise sum, max or latest, and for answers any Yes, the union of picks, or the best choice.
- **Outputs:** Scorecard figures, indicator table and summaries for other modules.
- **Validation:** A missing input or division by zero yields no result rather than a misleading one.

**FR-4.8.8 Scorecard. [Built]** The system shall show every edition's standing on one page.
- **Inputs:** Active and draft editions.
- **Processing:** Orders by ranking and shows headline figure, readiness, items to go, state counts, top fixes, open data requests and action items.
- **Outputs:** Edition cards with actions: open indicators, take a snapshot, positioning brief, quarterly review, indicators CSV.
- **Validation:** Requires `rankings: view`; actions follow their own rights.

**FR-4.8.9 Indicators page. [Built]** The system shall list an edition's indicators with tabs: Indicators, Checks, and Cases and Results where the edition uses them.
- **Inputs:** Edition, indicator code, filters.
- **Processing:** Opens a drawer with formula, levels, answers per unit, checks, evidence links and history. "Worth most" lists fixes by points gained.
- **Outputs:** Table, drawer and checks list.
- **Validation:** Requires `rankings: view`.

**FR-4.8.10 Data checks. [Built]** The system shall flag likely errors.
- **Inputs:** Report and facts, plus the previous edition.
- **Processing:** Detects percentages over 100, negative results, division by zero, out-of-range values, unit slips (kWh versus kW, pesos versus dollars), indicators with no owner, offices missing from the Directory, year-on-year changes over 50%, folder links, private Drive links where public evidence is needed, evidence outside the period, and one link reused across many indicators.
- **Outputs:** Errors, warnings and notes.
- **Validation:** Advisory; does not block saving. Blocking applies only at final submission (FR-4.9.3).

**FR-4.8.11 Fixes worth most. [Built]** The system shall rank the fixes by the points each would add: a missing value, link, assessment or date, or the next band (60 fixes at most).

**FR-4.8.12 Evidence links. [Built]** The system shall link evidence to an indicator and let the Office assess it.
- **Inputs:** URL or evidence record, label, year, public flag; assessment of relevance (specific, general, not relevant), public and self-contained.
- **Processing:** Saves the link, audits it, and updates readiness.
- **Outputs:** Updated indicator readiness.
- **Validation:** URL normalized to `https`, 2,000 characters at most, no credentials. A unit may link only its own evidence. Year 1900–2100. Duplicates refused. Needs `evidence: submit` for a unit, or `rankings: edit`. The Office may remove a unit's link.

**FR-4.8.13 Data requests. [Built]** The system shall ask units for an edition's items and track what they owe.
- **Inputs:** Edition, title, memorandum, message, due date, reminder and escalation days, and units with their items (by ownership or chosen).
- **Processing:** Assigns a code (REQ-###) and notifies each unit. Standings show requested and submitted items per unit. The Office can change the due date, add or drop units, remind, close, reopen or remove a request.
- **Outputs:** Request cards and per-unit standing.
- **Validation:** Requires `rankings: manage`. Active or Draft editions only. Due date today or later. At least one unit with items; 200 units at most. Reminder days 1–60; escalation days 0–60. Removing a request keeps values already sent.

**FR-4.8.14 Letters. [Built]** The system shall draft request, follow-up and thank-you letters in the Office's wording, ready to copy, per unit and request.

**FR-4.8.15 Unit answers. [Built]** The system shall let a unit answer on Portal → Data requests, in tabs Requests and Activities.
- **Inputs:** For each item: value, note, evidence (link or the unit's record), and draft, send or not applicable.
- **Processing:** Saves under the unit, notifies the Office, and thanks the unit once when everything asked is sent.
- **Outputs:** Item states including Sent and Returned, with the Office's note.
- **Validation:** Requires `data: submit` in that unit. Validation follows FR-4.8.5. **Administrators never answer for a unit.**

**FR-4.8.16 Spreadsheet answers. [Planned]** The system shall let a unit fill requested values from a spreadsheet.
- **Inputs:** A CSV or XLSX file based on a downloaded request template.
- **Processing:** Reads the file in the browser, matches indicator codes, shows a preview with row problems, and saves confirmed rows as Draft.
- **Outputs:** Filled items; a list of rows not used.
- **Validation:** Each value passes FR-4.8.5's rules. Unknown codes are skipped and listed. Follows the `spreadsheet-values` flag until released.

**FR-4.8.17 Activity register. [Built]** The system shall keep a register of service learning, community development, advocacy, outreach, events, research and other activities.
- **Inputs:** Kind, academic year, title, unit, proponent, community, proposal and report references, SDGs, beneficiaries, partner, MOU link, dates, tags.
- **Processing:** Saves the activity, and shows totals by year, by kind and most active units. Feeds suggest indicator values, but nothing is filled in automatically.
- **Outputs:** A searchable register and suggested values.
- **Validation:** Year as `2025-2026`, with consecutive years. Title required (300 characters at most). End date not before start. SDGs 1–17. MOU `https`. 12 tags at most. Coordinators change only their own unit's activities. Duplicates refused.

**FR-4.8.18 WURI cases and reviews. [Built]** The system shall hold innovation cases and score them on a rubric.
- **Inputs:** Category, title, unit, abstract; each reviewer's scores and note.
- **Processing:** Stores one review per reviewer and computes the total. Rubric: Innovativeness 30, Implementability 30, Impact 40. The best reviewed case per category counts.
- **Outputs:** Case list with totals.
- **Validation:** Requires `rankings: edit`. The category must take cases and have a rubric. Title 300 and abstract 4,000 characters at most.

**FR-4.8.19 Published results. [Built]** The system shall record a body's published scores, ranks or bands on the Results tab, kept as benchmarks for later comparison.

**FR-4.8.20 Benchmarks and peers. [Built]** The system shall compare the University with peer institutions.
- **Inputs:** Peer name, country, band (Philippines, ASEAN, Aspirational, Other); ranking, year, metric, value or rank.
- **Processing:** Computes medians and gaps per band.
- **Outputs:** Gap matrix, figures and peers.
- **Validation:** Year 2000–2100. A value or rank is required. No duplicate peers. Removing a peer removes its figures.

**FR-4.8.21 Template counts (no personal data). [Built]** The system shall read personal-data files in the browser and keep only counts.
- **Inputs:** A file from the Registrar, HR, Health Service, FMO or Research, and a template profile.
- **Processing:** Counts rows in the browser using the profile's measures (count, distinct, sum, full-time equivalent). Only totals and breakdowns reach the server, which checks them again.
- **Outputs:** Totals and breakdowns; a log with the file's SHA-256, never its rows.
- **Validation:** Requires `rankings: manage`. Only the profile's measures and dimensions. Finite, non-negative numbers. Breakdown cells below the minimum (*default* 5) are suppressed again on the server.

**FR-4.8.22 Template profiles. [Built]** The system shall let the Office define a template without code.
- **Inputs:** Key, name, owner unit, description, kind (rows or pairs), headers, skip rules, measures, dimensions, minimum cell, pairs.
- **Processing:** Saves the profile. Files are matched to profiles by their headers.
- **Outputs:** A usable profile; earlier uploads keep their counts if removed.
- **Validation:** Key: lowercase letters, digits and hyphens, 2–48 characters. A rows profile needs headers and a measure. A pairs profile needs a label. Up to 20 measures, 6 dimensions and 40 pairs. Minimum cell 1–50.

**FR-4.8.23 File importers. [Built]** The system shall import the Office's working files.
- **Inputs:** THE data-collection workbook, activity register, benchmark tables, WURI case documents, GreenMetric evidence documents.
- **Processing:** Parses files in the browser and sends sheets or text. Workbook data lands as a unit's For review values and links. Registers are deduplicated, and benchmark rows naming the University become its own figures. GreenMetric documents only produce suggestions for the Office to confirm.
- **Outputs:** Counts added and skipped, unplaced rows and unknown units; a log entry.
- **Validation:** 60 MB per file. Zip archives: 4,000 entries, 64 MB per entry, 256 MB overall. Sheets sent: 60 sheets, 30,000 rows, 80 columns, 2,000 characters per cell. Archived editions refuse imports. A WURI abstract is checked against 300 words. 150 evidence files or 100 case files per batch.

**FR-4.8.24 Unit name aliases. [Built]** The system shall map names used in files to Directory units, so later imports match.
- **Inputs:** Alias and unit.
- **Processing:** Stores the alias in capitals, up to 60 characters.
- **Outputs:** An updated list; an audit entry.
- **Validation:** Requires `rankings: manage`. The unit must be active.

**FR-4.8.25 Action items. [Built]** The system shall track improvement actions per edition.
- **Inputs:** Action, indicator, owner unit, due date, status (Not started, On track, At risk, Complete), progress, note.
- **Processing:** Saves the action and audits it.
- **Outputs:** Action lists on the Scorecard and in reports.
- **Validation:** Action text required, 300 characters at most. Progress 0–100, set to 100 when Complete.

**FR-4.8.26 Snapshots. [Built]** The system shall freeze an edition's summary manually and weekly, for "since last week" and quarterly comparisons.

**FR-4.8.27 Analytics exports. [Built]** The system shall export indicators (CSV), a positioning brief (Markdown), a quarterly review (CSV), a gap matrix (CSV) and methodology packs (JSON). Requires `rankings: export`; every export is rate-limited and audited.

**FR-4.8.28 Reminders and escalation. [Built]** The daily job shall remind units that owe items every `remindDays`, tell the Office when a unit is `escalateDays` past due, and take weekly snapshots (Specialist reminds, Director acts).

**FR-4.8.29 Quarterly review pack. [Planned]** The system shall produce a formatted quarterly review for Deans and leadership.
- **Inputs:** Edition or college; snapshot about a quarter old.
- **Processing:** Lays out movement, actions, risks and opportunities.
- **Outputs:** A PDF, in addition to today's CSV.
- **Validation:** Requires `rankings: export`; audited and watermarked per FR-4.17.3.

**FR-4.8.30 Target setting and what-if. [Planned]** The system shall let the Office set targets and model scenarios.
- **Inputs:** Target rank or score per indicator; hypothetical values.
- **Processing:** Recomputes the edition on a private copy of the facts without saving any value.
- **Outputs:** Projected score and the distance to target.
- **Validation:** Scenarios are labelled as projections and never mix with claimed or secured points. THE's normalised ratios project only from peer benchmarks.

**Scaling provisions**
- Add new rules, aggregates, feeds and importers through the documented extension points, with one small function each.
- Move report computation to a background worker with a shared cache as indicators and units grow. Summaries are held per server instance for 60 seconds today.
- Paginate facts per edition rather than loading them whole.
- Add a pack library so methodology updates can be compared with the previous year before activation.
- Add subject-level roll-ups for By Subject rankings across colleges.

---

## 4.9 Final Submission Management

Covers the last steps of the Office's data-gathering process: compile, Director approval, upload to the ranking body's portal, and record the result. Ranking bodies are assumed not to offer an authenticated submission interface, so a person uploads to the portal and the Hub records it.

**FR-4.9.1 Submission template export. [Planned]** The system shall output an edition's validated data in the ranking body's own template.
- **Inputs:** Edition; a template mapping from indicator codes to the body's cells or fields.
- **Processing:** Fills the template with University values, with evidence links in the body's expected columns.
- **Outputs:** An XLSX or CSV matching the body's portal view; a list of cells left blank.
- **Validation:** Only Validated values by default. Requires `rankings: export`. Audited.

**FR-4.9.2 Submission package. [Planned]** The system shall compile what is being submitted for one edition.
- **Inputs:** Edition; selected evidence and values.
- **Processing:** Gathers the values, the evidence index and the narrative texts as one versioned package.
- **Outputs:** A package with a version number and contents list.
- **Validation:** Requires `rankings: manage`. A changed value after compiling marks the package out of date.

**FR-4.9.3 Pre-submission check. [Planned]** The system shall check a package before it goes for approval.
- **Inputs:** Package; the edition's readiness and data checks.
- **Processing:** Blocks on data-check errors and on items without required evidence. Lists warnings for private links, folders and unassessed evidence.
- **Outputs:** A pass or a list of what to fix, each linked to the indicator.
- **Validation:** Errors block unless the Director records an override with a reason.

**FR-4.9.4 Director approval. [Planned]** The system shall route the package to the Director for confirmation through a new "final submission" approval workflow.
- **Inputs:** Package; Specialist's note.
- **Processing:** Follows FR-4.24.2, with separation of duties always on.
- **Outputs:** An approved or returned package, with a note.
- **Validation:** The person who compiled the package cannot approve it. Return needs a note.

**FR-4.9.5 Record the portal submission. [Planned]** The system shall record that data was uploaded to the body's portal.
- **Inputs:** Package; date and time; who uploaded; portal reference; receipt file.
- **Processing:** Closes the edition, moves included evidence to the "Included in final submission" stage, and notifies contributing units.
- **Outputs:** A submission record; updated evidence stages.
- **Validation:** Requires an approved package. A receipt or reference is required. Audited.

**FR-4.9.6 Record results and close the loop. [Planned]** The system shall connect published results to the evidence behind them.
- **Inputs:** Published scores and ranks (FR-4.8.19).
- **Processing:** Compares results with claimed and secured points, moves evidence to "Result achieved" where it applies, and feeds merit (FR-4.12.4).
- **Outputs:** A variance report by indicator; notices to units.
- **Validation:** Requires `rankings: edit`. Corrections are versioned.

**FR-4.9.7 Corrections to a submitted cycle. [Planned]** The system shall let the Office reopen a closed edition for a body's correction window, with a reason, and keep the original package unchanged.

**Scaling provisions**
- Add direct integrations where a ranking body offers an authenticated API, behind the same approval step.
- Add a template mapping per body, so a new ranking needs configuration only.
- Keep packages as an archive of what was submitted each year, for accreditation and audit.

---

## 4.10 Evidence Contributions and Validation

**FR-4.10.1 Submission table. [Built]** The system shall list a unit's submissions on Submit evidence, with search and status tabs, and open each row's record.

**FR-4.10.2 Evidence composer. [Built]** The system shall let a Coordinator file evidence in tabs: Overview, Narrative, Evidence, References.
- **Inputs:** Title, type, reporting period, description, measurable result, beneficiaries, impact level (1–5), SDGs, ranking indicators; files with a kind; links; background; how verified; references.
- **Processing:** Issues signed upload URLs, confirms each file in storage and reads its real size, then assigns a reference and notifies the Office. Failed submits jump to the tab with the first problem and show counts of what each tab needs.
- **Outputs:** A record (EV-####) with status For review; a toast and audit entry.
- **Validation:**
  - Title at least 4 characters (stored up to 160). Type from: Operational data, Research output, Policy, Narrative and outcomes, Financial data, Teaching and course data, Innovation or intellectual property.
  - Period must exist and be accepting. The unit must be active and in the person's scope.
  - Description 4,000 characters at most (24,000 with formatting). Background 600. Verified-by 160.
  - Result and beneficiaries required (200 each). At least one SDG, each 1–17.
  - At least one file or link. Links: 10 at most, full web addresses, label 80. References: 20 at most, each with a title (300), source (160) and optional link.
  - Files: *default* 10 at most, 25 MB each, PDF, XLSX, CSV, DOCX, PNG or JPG. File kinds: Report, Survey copy, Photo, Attendance, Certificate, Data, Agreement, Other. No file may be attached twice.
  - At least one active indicator mapping.

**FR-4.10.3 Local draft. [Built]** The system shall keep an unfinished submission on the device, including links and references, and offer to keep it when closing. Files must be attached again.

**FR-4.10.4 Server drafts. [Planned]** The system shall save drafts on the server, so a colleague or another device can continue them, with uploaded files retained.

**FR-4.10.5 Automatic ranking matching. [Planned]** The system shall suggest every ranking that could reuse a piece of evidence.
- **Inputs:** Type, SDGs, title, description; indicator tags and owners from the analytics catalogue.
- **Processing:** Scores likely indicators by rule and pre-selects them for the Coordinator to confirm.
- **Outputs:** Suggested mappings with the reason for each.
- **Validation:** Nothing maps without the Coordinator's confirmation, and reviewers still decide. Follows the `smart-matching` flag until released.

**FR-4.10.6 Validation queue. [Built]** The system shall give reviewers tabs Submissions and Analytics.
- **Inputs:** Search and status filter.
- **Processing:** Lists records within the reviewer's unit and ranking scope, with a live count in the sidebar. Shows a contribution pipeline by stage.
- **Outputs:** A review table and pipeline.
- **Validation:** Requires `evidence: view`.

**FR-4.10.7 Contribution record. [Built]** The system shall show a record in a modal with tabs Overview, Narrative, Evidence, References: stage track, revision callout, result, beneficiaries, evidence strength, SDGs, counts toward, notes, and files filtered by kind. Attachments download only for people who may see the record.

**FR-4.10.8 Review evidence. [Built]** The system shall let a reviewer accept a record or request revision.
- **Inputs:** Decision; note.
- **Processing:** Sets Validated or Needs revision, adds the comment, audits the decision, and notifies the unit.
- **Outputs:** An updated record; the unit is told how many rankings it counts in.
- **Validation:** Requires `evidence: approve` covering the record. **A submitter cannot decide their own evidence.** A revision note needs at least 5 characters (1,000 at most).

**FR-4.10.9 Maintain mappings. [Built]** The system shall let a reviewer add or remove ranking indicators on a record.
- **Inputs:** Mapping to add or remove.
- **Processing:** Updates the mapping and audits it.
- **Outputs:** The updated record.
- **Validation:** Added mappings must be active. The last mapping cannot be removed.

**FR-4.10.10 Respond and resubmit. [Built]** The system shall let the unit answer a revision request from the record.
- **Inputs:** Reply; optional corrected file.
- **Processing:** Appends the reply and file to the same record, returns it to For review and notifies the Office.
- **Outputs:** The same reference, back in the queue with its history kept.
- **Validation:** Status must be Needs revision. Reply at least 5 characters. File limits as in FR-4.10.2; the total file count is respected.

**FR-4.10.11 Evidence stages. [Extend]** The system shall track each record through Received, Under review, Accepted, Included in final submission and Result achieved.
- **Inputs:** Review decisions; submission and result records.
- **Processing:** Moves the stage on each event.
- **Outputs:** A stage track on the record and the dashboards.
- **Validation:** A stage cannot be skipped except by the recorded events.
- **To complete:** The last two stages are set by FR-4.9.5 and FR-4.9.6.

**FR-4.10.12 Reuse across rankings. [Extend]** The system shall let one validated record count in several rankings, and link into Data requests as evidence (FR-4.8.12). Reuse insights follow the `reuse-insights` flag.
- **To complete:** Release the flag by default once reviewers confirm the figures.

**FR-4.10.13 Retention of evidence. [Planned]** The system shall retain evidence by its dataset's retention rule (FR-4.23.6) and flag records approaching the end.

**Scaling provisions**
- Support resumable uploads and a higher file-size ceiling through direct-to-storage transfers, which the design already uses.
- Add virus scanning on upload before a file becomes downloadable.
- Add content search over extracted text from PDF and Word evidence.
- Add bulk review actions and reviewer assignment as volumes grow.
- Add automatic link-health checks, so dead evidence links are flagged before submission.

---

## 4.11 Assistance Requests

**FR-4.11.1 Request assistance. [Extend]** The system shall let a unit's contributor ask the Office for help, with quick answers and the Coordinator's details alongside.
- **Inputs:** Topic, related requirement and ranking, urgency, message, optional attachment.
- **Processing:** Assigns a reference, stores the request and notifies the Office.
- **Outputs:** A reference (AR-####) and a toast.
- **Validation:** Must contribute for the unit. Topic required. Message at least 10 characters. The `assistance` feature must be on.
- **To complete:** Store the message, which is validated and then discarded today. Add attachments.

**FR-4.11.2 Office assistance queue. [Planned]** The system shall give the Office a queue of requests.
- **Inputs:** Filters by status, urgency, unit and owner.
- **Processing:** Lets staff assign an owner and set a status: Open, In progress, Waiting on unit, Resolved, Closed. Urgent requests sort first.
- **Outputs:** A queue with counts in the sidebar.
- **Validation:** Requires a new assistance permission. Status changes are audited.

**FR-4.11.3 Conversation. [Planned]** The system shall keep replies and files on the request and notify each side.
- **Inputs:** Reply text; file.
- **Processing:** Appends to the thread and sends a notice and email.
- **Outputs:** A dated thread visible to the unit and the Office.
- **Validation:** Reply at least 2 characters. Files follow the upload limits. Closed requests accept no replies until reopened.

**FR-4.11.4 Service targets. [Planned]** The system shall flag requests past a response target (*default* 3 working days, 1 for urgent) and include them in the Office's to-do list.

**FR-4.11.5 Resolution and satisfaction. [Planned]** The system shall record the resolution and ask the unit for a one-question rating.

**Scaling provisions**
- Turn frequent answers into Knowledge Center FAQ entries from the resolved thread.
- Route topics to named Office staff automatically.
- Report common topics per cycle to improve guidance.

---

## 4.12 Units, Honours and Recognition

**FR-4.12.1 Unit participation. [Built]** The system shall let the Office compare units in tabs Faculty/Colleges, University Offices and Research Centers.
- **Inputs:** Category and search.
- **Processing:** Ranks active units by validated evidence, then rankings served, completion and name. Rank is computed before search, so filtering never changes a position.
- **Outputs:** A leaderboard and unit cards.
- **Validation:** Requires `units: view`. A unit with no validated evidence has no rank. Tied units share a rank.

**FR-4.12.2 Unit profile. [Built]** The system shall show one unit in tabs: Overview, Submissions, Recognitions, History, Account settings.
- **Inputs:** Unit slug.
- **Processing:** Overview shows open items, revisions requested, deadlines, accepted evidence, reuse insights, institutional outcomes and indicators owned. Submissions filter by status. History shows merit by cycle. Settings show account details and coordinators.
- **Outputs:** A tabbed profile, as a modal or its own page.
- **Validation:** Scope-limited. Settings need directory rights. Archived units show a warning.

**FR-4.12.3 Unit emblems. [Built]** The system shall show a unit's official University arms or uploaded logo everywhere the unit appears. Logo: PNG or JPG up to 2 MB; never redraws official seals.

**FR-4.12.4 Merit. [Built]** The system shall reward units from validated evidence only.
- **Inputs:** The unit's validated evidence in a reporting cycle.
- **Processing:** Each record earns 100 for validation; +50 for each further ranking; +25 per impact level above 1; +40 if accepted first time; +60 if a result was achieved.
- **Outputs:** Merit per record and per cycle.
- **Validation:** Merit never grows with the number of files. A unit is measured against its own record for honours.

**FR-4.12.5 Honours. [Built]** The system shall award a season honour by merit in each cycle: Matriculant (0), Cum Laude (200), Magna Cum Laude (600), Summa Cum Laude (1,200), Laureate (2,400), with progress, first-pass rate and steel, gold and onyx medals. Earned achievements are kept.

**FR-4.12.6 Recognition wall. [Extend]** The system shall show recognition in the workspace in tiles: Awards, Moved up, Top contributors, Evidence champions, Innovation leaders, Sustainability partners, Archive.
- **Inputs:** Governed data; `recognition-internal` feature.
- **Processing:** Summarizes available data and links to unit profiles.
- **Outputs:** A Dashboard tab.
- **Validation:** Empty tiles show an empty state.
- **To complete:** Source awards from FR-4.12.7 instead of presentation data.

**FR-4.12.7 Awards workflow. [Planned]** The system shall run cycle awards from nomination to publication.
- **Inputs:** Award definition, criteria, cycle; nominations with reasons and linked validated evidence; evaluator scores.
- **Processing:** Runs Draft, Nominating, Evaluating, Approved, Published. Suggests candidates from merit, and approval uses FR-4.24.
- **Outputs:** Winners on the Recognition wall and public page; a citation for each; notices to units.
- **Validation:** Evaluators cannot score their own unit. Only validated evidence counts. Publishing requires approval.

**FR-4.12.8 Certificates. [Planned]** The system shall generate a downloadable certificate per award and honour, using the official seal files only.

**Scaling provisions**
- Add individual recognition for coordinators, with their consent.
- Add new award types through configuration.
- Extend units to other UST campuses through the Directory hierarchy.

---

## 4.13 Publications

Covers Stories & News, Research Articles, and Reports & Insights. States are Draft, In review, Published and Unpublished.

**FR-4.13.1 Post manager. [Built]** The system shall list posts in a table with tabs Published and Unpublished, search, sorting and pages, and row actions by right: edit, view live, approve, return, send, unpublish, move to drafts, delete.

**FR-4.13.2 Compose a post. [Built]** The system shall let authorized users write a story in a publishing-style composer: settings beside the document, with panels for images, thumbnail, SDGs, hashtags and analytics.
- **Inputs:** Title, subtitle, rich text (size, bold, italic, underline, strikethrough, colour, highlight, superscript, subscript, links), photos with alt text, thumbnail, layout (Cover, Feature, Side by side, Essay, Banner, Gallery first, Magazine, Alternating), themes, hashtags, SDGs.
- **Processing:** Compresses pictures in the browser, cleans rich text on the server, assigns an ID (PO-####) and a free address, and audits which parts changed. Pictures no longer used are released after commit.
- **Outputs:** A saved draft and a full preview of the public layout.
- **Validation:** Title 4–140 characters. Subtitle 220. Body 20,000 characters (120,000 with formatting). Photos 20. Themes 3, from the list. Hashtags 10 (40 characters; letters, numbers, underscores). Alt text 240. Pictures JPG or PNG up to 2 MB.

**FR-4.13.3 Publish a post. [Built]** The system shall publish Office posts directly or through the publication workflow.
- **Inputs:** Post ID.
- **Processing:** Follows FR-4.24.3; waiting posts show "Awaiting approval". On publishing, notifies the unit.
- **Outputs:** A live post or a waiting item; a toast.
- **Validation:** Requires `posts: approve`, text or photos, and at least one SDG. Items already pending are refused.

**FR-4.13.4 Document manager. [Built]** The system shall list research articles and reports in tables with search and row actions.

**FR-4.13.5 Enter a research article or report. [Built]** The system shall catalogue documents in a form with a preview and a "to publish" checklist.
- **Inputs:** Kind, title, authors, venue, type, abstract, issue date, DOI, link, PDF, SDGs, keywords, unit, featured flag, cover colour for reports (Night, Gold, Stone, Onyx).
- **Processing:** Assigns an ID (DOC-####). Featuring a document removes the mark from the previous one of that kind.
- **Outputs:** A draft record. A PDF reaches public storage only while published.
- **Validation:** Title 4–220. Authors 30 (120 characters each). Venue 160. Type from the list. Date from 1900 to today. DOI as printed; link `https`. PDF up to 25 MB. Keywords 10 (40 characters). Abstract 4,000. **To publish:** at least one author, a summary of at least 40 characters, and a DOI, link or PDF.

**FR-4.13.6 Unit publications. [Built]** The system shall let a Coordinator manage their own unit's items in the Portal.
- **Inputs:** Item fields as above.
- **Processing:** Lists only the unit's items and files new ones under the unit. "Send to the Office" puts an item In review.
- **Outputs:** Item lists; an Office notice.
- **Validation:** A unit cannot publish, unpublish, feature or change another unit's items. It cannot change a live item. A waiting item must first move back to drafts. **Nothing from a unit goes live without the Office.**

**FR-4.13.7 Office review of unit items. [Built]** The system shall let the Office approve or return a unit's item, marked To review.
- **Inputs:** Item; decision; note on return.
- **Processing:** Approval publishes or opens the workflow. Return moves the item to Draft and notifies the unit with the note.
- **Outputs:** A published, waiting or returned item; an audit entry.
- **Validation:** Requires `posts: approve`. Return note 5–600 characters. Incomplete content cannot be approved.

**FR-4.13.8 Unpublish. [Built]** The system shall remove a live item from the public site (`posts: approve`; live items only; audited). A public copy of its pictures or PDF is withdrawn.

**FR-4.13.9 Delete. [Built]** The system shall delete a post or document, withdrawing any waiting request and releasing its media (`posts: delete`; units only for their own non-live items; audited).

**FR-4.13.10 Older stories. [Built]** The system shall turn one of the Hub's earlier stories or a past proposal into a post the first time the Office edits it, keeping its address and author.

**FR-4.13.11 Audience analytics. [Built]** The system shall show a post's total views, recent views and daily counts to people with `posts: view`.

**FR-4.13.12 Story drafting help. [Planned]** The system shall suggest a story's structure from linked evidence.
- **Inputs:** One or more validated evidence records.
- **Processing:** Proposes a title, challenge, response, outcome and SDGs from their fields, which the author edits. Any AI assistance is optional and labelled.
- **Outputs:** A draft in the composer.
- **Validation:** Only evidence the author may see. Nothing publishes automatically. Follows the `story-drafting` flag until released.

**FR-4.13.13 Scheduled publishing. [Planned]** The system shall publish approved items at a chosen date and time, and allow cancelling before then.

**FR-4.13.14 Version history. [Planned]** The system shall keep earlier versions of an item, compare them, and restore one as a draft.

**Scaling provisions**
- Add full-text search with a search index as the archive grows.
- Add image variants and a CDN pipeline for large galleries.
- Add newsletter digests of new publications to subscribers, with opt-in and unsubscribe.
- Register DOIs for the Office's own reports through a registration agency.
- Add multi-language versions of an article.

---

## 4.14 Workspace and Knowledge Center

Pages: Working Documents, Library, Digital Forms (section 4.15), Archives and Knowledge Center, as sidebar children. Each has its own permission.

**FR-4.14.1 File shelves. [Built]** The system shall store a unit's working files and the Office's shared library in nested folders.
- **Inputs:** Owner, shelf (Working or Library), folder, files.
- **Processing:** Issues signed upload URLs, reads the real size from storage, assigns IDs (WS-####) and audits.
- **Outputs:** Folder cards, a full-size folder window and file lists. Files always download, in a sandbox.
- **Validation:** Files must be in a folder. 20 files per batch. Type and size follow the upload settings. Folder name up to 48 characters, unique among siblings. 5 levels deep; 120 folders per shelf. A folder cannot go inside itself. Unit files need `evidence: submit`; shared files need `knowledge: edit`.

**FR-4.14.2 Organize files. [Built]** The system shall rename and move files and folders within the same owner.
- **Inputs:** Item; new name or folder.
- **Processing:** Applies the change and audits it.
- **Outputs:** An updated tree and a toast.
- **Validation:** Name required (120 characters at most). The destination must belong to the same owner and shelf.

**FR-4.14.3 Archive, restore and delete. [Built]** The system shall provide reversible archiving and permanent deletion.
- **Inputs:** Up to 100 file IDs.
- **Processing:** Archives keep the original shelf. Deletion removes the stored file after commit.
- **Outputs:** An Archives view and toasts.
- **Validation:** Only an archived file can be deleted. A folder can be deleted only when empty, including of archived files.

**FR-4.14.4 Working Documents. [Built]** The system shall track externally edited documents as links, in a sortable, searchable table with an editor in tabs Details, Links and Remarks.
- **Inputs:** Title, due date, rankings, SDGs, authors, status (Draft, In progress, For review, Final), links, remarks.
- **Processing:** Saves the entry (WD-####), shows what each link opens, and audits status changes.
- **Outputs:** A table and editor.
- **Validation:** Title up to 160 characters. Valid date. 1–10 `https` links. Rankings 12. Authors 12 (80 characters each). Remarks 5,000. Removing takes up to 100 at a time. The Hub never edits the linked document or its sharing.

**FR-4.14.5 Knowledge Center. [Built]** The system shall provide guidance with one shared search over tabs Dictionary, Methodologies, Evidence, Resources and FAQ.
- **Inputs:** Tab and search term.
- **Processing:** Shows a deadline countdown and submission calendar, term definitions with linked terms, methodology weights, what reviewers check, the evidence strength ladder, what counts and what does not, templates, training, policies, good practices and questions. Match counts appear on each tab.
- **Outputs:** Guidance content, with routes to Request assistance or the Office's email.
- **Validation:** Requires `knowledge: view`, which Student Organizers do not have by default.

**FR-4.14.6 Knowledge Center editing. [Planned]** The system shall let the Office edit guidance on screen.
- **Inputs:** FAQ, training, policy and good-practice entries; files.
- **Processing:** Saves entries as drafts, publishes them with an audit entry, and stores them in the reference tables.
- **Outputs:** Updated content on the workspace and public versions.
- **Validation:** Requires `knowledge: edit`. Public visibility is chosen per entry. Dictionary terms follow FR-4.23.5.

**FR-4.14.7 File versions. [Planned]** The system shall keep earlier versions of a replaced Workspace file, and let a writer restore one.

**FR-4.14.8 Training tracking. [Planned]** The system shall record which Coordinators completed each training item and show completion per unit.

**Scaling provisions**
- Add document preview in a sandboxed viewer.
- Add full-text search across Library files.
- Add storage quotas and usage per unit. Object storage itself has no practical limit.
- Add Google Drive picker links for Working Documents, using the person's own token.

---

## 4.15 Digital Forms

A repository of electronic forms. Each has its details, its own responder link, a table of responses and analytics. Form kinds: Survey, Registration Form, Application Form, Proposal Form, Evaluation Form, Terminal Report. A form is held by the Office, a unit or a Student Organizer.

**FR-4.15.1 Forms shelf. [Built]** The system shall list forms on the Digital Forms page.
- **Inputs:** Holder tab (the Office sees Office, Units and Student Organizers), search.
- **Processing:** Shows the viewer's forms with the Office's open forms beside a unit's own. Row actions by right: open, edit questions, copy responder link, take or close responses, duplicate, delete draft.
- **Outputs:** A list of forms with status and response counts.
- **Validation:** The Office sees unit and Student forms only once out of draft.

**FR-4.15.2 Forms Builder. [Built]** The system shall let authorized users build a form without code.
- **Inputs:** Title, description, kind, steps, questions from modules and presets, conditions, sign-off stages, office-only fields.
- **Processing:** Provides a palette, a canvas with steps as pill tabs, and an inspector. Supports click to add, drag and drop, move, duplicate and remove. Question keys follow the label while new, then stay fixed. Presets fit themselves to the form: a field the form already has is reused, and any other clash is renamed. Removing a question removes what reads it and names what still depends on it. The header shows the question count or "Needs a fix".
- **Outputs:** A draft form with a unique responder link (`/f/<code>`) and an ID (FM-####).
- **Validation:** No emoji in form details or questions. Schema limits: 20 steps, 300 questions, 60 per step, 60 options, 12 columns, 10 sign-offs, 30 office fields, 400 KB. A condition may refer only to an earlier question. Unknown types and repeated keys are refused.

**FR-4.15.3 Question modules. [Built]** The system shall provide these question types, each with its own input, checks, read-back and analytics.

| Module | Asks for | Main options | Checks |
|---|---|---|---|
| Short answer | One line | Plain, email or phone; length (160); email domain; capitals for names | Required, length, format, domain, letters only for names |
| Paragraph | A few lines | Length (3,000), sentence limit | Required, length, sentences |
| Choice | One or several options | Options, multiple, min, max, Others, cards or chips | Required, min, max, words for Others |
| Yes or no | Yes or no | Labels | Required |
| University unit | A unit from the Directory | Sections | Must be a listed unit |
| SDGs | Goals, with official tiles | Min, max | Required, min, max |
| Date | A day | Min, max | Required, range |
| Dates | Rows mixing date ranges and single dates | None | Each day required; ranges ordered |
| Number | A number | Min, max, unit | Required, range |
| Amount | Pesos | Max | Required; centavos rounded |
| Link | An `https` link, showing what it opens | Placeholder | `https` only, no credentials |
| People | People, each name in parts | Phone or email, min, max, domain, one per role | Names, phones, emails, domain, counts |
| Rows | Rows of the same questions | Columns, min, max (30), fixed or numbered rows | Row count, each shown cell |
| Counts | Numbers by group, with total | Rows, total | Total above zero when required |
| Budget | Quantity × rate × days, paid from a source | Sources, categories, per-part, fixed lines, theoretical | A line with an amount; recipients; locked rates forced on the server |
| Budget summary | One source added up by category | Budget, source, payee | Payee for every category when required |
| Declarations | Statements to tick | Statements | All ticked when required |
| Note | Words between questions | Text | None |
| File upload | Files attached to an answer (**Planned**, FR-4.15.15) | Kinds, number, size | Type, size, count |

**FR-4.15.4 Presets. [Built]** The system shall offer ready-made questions in groups: Who, What, Where and when, Money, Safety, Sign, Review. They include organizations, affiliation, contact persons, officers, program areas, target SDGs, sentence-limited paragraphs, expected results, participants, phases, project flow, per-phase budget, CSF summary, volunteer counterpart, emergency contact, resource speakers, declarations, e-signature, approval chain and office use. A form copies its presets when built, so later changes never alter a live form.

**FR-4.15.5 Form templates. [Extend]** The system shall provide complete templates.
- **Inputs:** Template selection in the Builder.
- **Processing:** Starts a draft from the template. The Community Development Project Proposal (S040-00-FO21 rev06, FM-0001) has eight steps and a five-stage review, with fixed rates for meals, snacks and volunteers.
- **Outputs:** A ready draft, with its own reference prefix such as CDP.
- **Validation:** A template must pass the schema check.
- **To complete:** Add the Terminal Report template, plus standard Evaluation and Registration templates. Student Organizers cannot file terminal reports until the Office issues one.

**FR-4.15.6 Form details. [Built]** The system shall keep a form's details, editable in its window.
- **Inputs:** Title, description, form number, issuing unit, closing day, reference prefix.
- **Processing:** Saves and audits changes.
- **Outputs:** A form window with tabs Details, Responses and Analytics, and a QR share card.
- **Validation:** Title 160. Description 300. Form number 80. Prefix 1–6 letters. A unit's form names only its own unit or one within it as issuer. A Student's form names no issuer. A form's kind must be allowed for its holder: the Office any; a unit surveys, registrations, applications and evaluations; a Student evaluations and registrations.

**FR-4.15.7 Form lifecycle. [Built]** The system shall control a form's status.
- **Inputs:** Open, close or reopen; duplicate; delete.
- **Processing:** Runs draft → open → closed ↔ open. Duplicate makes a new draft with a new link and no responses.
- **Outputs:** Updated status; an audit entry.
- **Validation:** A form never returns to draft. Questions and kind change only in draft. Only a draft can be deleted. A form needs a question to open. **Evaluation and Registration forms are fixed once published:** the page asks first, and afterwards there are no changes or deletion.

**FR-4.15.8 Data privacy step. [Built]** The system shall show a data privacy notice as Step 0 of every form.
- **Inputs:** Two statements to agree to.
- **Processing:** Shows what is collected, who uses it, three promises and the respondent's rights. Names a unit or student organization among the users where it holds the form. Keeps the consent's version with the response.
- **Outputs:** Access to the form's other steps.
- **Validation:** No step opens until both are ticked. A changed notice version asks again.

**FR-4.15.9 Answer a form. [Built]** The system shall collect a response through the form's link, with no account needed.
- **Inputs:** Consent; answers per step; a hidden trap field.
- **Processing:** Shows numbered questions, a progress ring and step rail, and only applicable steps. Keeps a draft on the device. Removes what pointed at a removed row, and moves later references up. Rebuilds answers on the server by the same rules, dropping unknown and hidden fields and forcing locked rates and sources. Numbers the response per form.
- **Outputs:** A receipt with a reference (such as CDP-0001).
- **Validation:** The form must be open and not past its closing day. Answers 300 KB at most. Names in capitals, letters only, in parts. No emoji anywhere. Emails must match any required domain. **Limits:** 20 per network per form per hour; 600 per form per hour; nothing is sent if the counter is unreachable. Forms using team copies refuse direct responses.

**FR-4.15.10 Rights by holder. [Built]** The system shall apply separate rights to edit, delete, change status, publish to portal, duplicate, read, review, export and remove responses.
- **Inputs:** The viewer's grants; the form's holder.
- **Processing:** The Office runs its own forms and reads others' once out of draft. Coordinators run their unit's forms. A Student runs only their own. The Office may close and reopen any published form.
- **Outputs:** The actions offered and enforced on the server.
- **Validation:** Only the Office removes responses from fixed forms. Student forms have no sign-offs. The Office never acts for a unit.

**FR-4.15.11 Record sign-offs. [Built]** The system shall record sign-offs in order, plus office-only fields.
- **Inputs:** Stage, decision (approved, returned, declined), signatory name, day, note; office fields.
- **Processing:** Walks applicable stages in order and updates status: Submitted, In review, Approved, Returned or Declined. Saves only over the version that was read.
- **Outputs:** Review history and status; an audit entry.
- **Validation:** Requires the `review` right. Only the next stage can be recorded and only the latest undone. Name letters only, 80 characters at most. Day today or earlier. Note 600 at most, required to return or decline, no emoji. A concurrent change is refused.

**FR-4.15.12 Named signatory approval. [Planned]** The system shall let each named signatory approve for themselves.
- **Inputs:** Signatory's email set on the stage; a secure single-use link; Google identity; decision and note.
- **Processing:** Notifies the signatory, verifies their identity, and records the decision with verified identity and time. Moves to the next stage and notifies them. Reminds after a set period. An authorized reviewer can still record a decision on someone's behalf, shown as "Recorded by".
- **Outputs:** A verified signature in the review history.
- **Validation:** The signed-in email must match the stage's email. Links expire after 14 days (*default*) and work once. Grants no Hub account.

**FR-4.15.13 Responses and analytics. [Built]** The system shall list responses and summarize them per question.
- **Inputs:** Search and filters.
- **Processing:** Computes bars, totals, averages, ranges and months by module.
- **Outputs:** A responses table with configured columns, a response view, and analytics cards.
- **Validation:** Requires the `read` right. Incomplete copies appear in the table but are excluded from analytics and CSV.

**FR-4.15.14 Export and remove responses. [Built]** The system shall export responses as CSV and delete test or duplicate responses.
- **Inputs:** Form; up to 200 response IDs for removal.
- **Processing:** Audits every export and removal.
- **Outputs:** A CSV file; a toast.
- **Validation:** Requires the `export` or `clear` right; rate-limited. Draft copies are not removed by this function.

**FR-4.15.15 File upload question. [Planned]** The system shall let a question collect files.
- **Inputs:** File kinds, maximum number and size set in the Builder; files from the respondent.
- **Processing:** Uploads to private storage through signed URLs, tied to the response, and scans them. Files download only for people with the `read` right.
- **Outputs:** A file list in the response and CSV.
- **Validation:** Follows upload settings. Unsubmitted files are swept. Rate-limited per network. Excluded from anonymous forms by default unless the owner turns it on.

**FR-4.15.16 Edit a sent response. [Planned]** The system shall let a respondent correct a returned response.
- **Inputs:** Response's secure link or verified identity; changed answers.
- **Processing:** Reopens only a Returned response, keeps the previous version, and re-enters the review from the first stage or the returning stage, as the form sets.
- **Outputs:** An updated response under the same reference, with version history.
- **Validation:** Full answer rules apply again. Responses that are Approved or Declined stay fixed.

**FR-4.15.17 Response arrival alerts. [Planned]** The system shall notify the people who run a form when a response arrives, immediately or as a daily summary, per form.

**FR-4.15.18 Official form PDF. [Planned]** The system shall generate a PDF of a response in the paper form's layout, with reference, control number, sign-offs and a verification QR code. Requires the `read` right; audited.

**FR-4.15.19 People lookup. [Built]** The system shall help a verified University responder find a person's UST email and photo.
- **Inputs:** Name parts or search text.
- **Processing:** Searches Hub accounts and the Workspace directory, using the responder's own encrypted Google token.
- **Outputs:** Matching people, to fill a person's card.
- **Validation:** Verified UST responders only. Allowed domains only. 40 lookups per person and 80 per network per minute.

**FR-4.15.20 Form identity. [Built]** The system shall show on every form page the account it knows the person by, in the hero. A Hub session always wins over a form-only Google sign-in, which lasts 7 days, applies only to form pages and grants no Hub access.

**FR-4.15.21 Feed to analytics. [Planned]** The system shall let a form's published responses feed the activity register and analytics, such as evaluation counts and registrations, through a field mapping set by the Office, with counts only where personal data is involved.

**Scaling provisions**
- Add new modules through the documented seven-step extension. Responses sit outside the governance store, so a busy form never affects it.
- Partition responses by form or year as volume grows.
- Add conditional branching across several questions and calculated fields.
- Add reusable organization-level question banks.
- Add payment or fee tracking for registrations if the University requires it.
- Add accessibility and multi-language versions of a form.

---

## 4.16 Student Portal and Team Copies

Pages: Dashboard, Assignments, Project Proposals, Evaluation Forms, Registrations, Terminal Reports.

**FR-4.16.1 Assignments. [Built]** The system shall show a Student Organizer the surveys published to them, in To answer and answered views.
- **Inputs:** Published open surveys from the Office or a unit.
- **Processing:** Links the response to the Student's account.
- **Outputs:** A list sorted by closing day.
- **Validation:** One answer per Student per survey. Closed unanswered surveys leave the list. Answered ones stay as history.

**FR-4.16.2 Own evaluation and registration forms. [Built]** The system shall let a Student build and publish their own, using the Forms Builder without sign-offs, fixed once published (FR-4.15.7).

**FR-4.16.3 Publish to the Student Portal. [Built]** The system shall let the Office publish proposals, terminal reports and surveys, and a Coordinator publish their unit's surveys. Audited; other kinds are refused; Students see an item only while it takes responses.

**FR-4.16.4 Build a team copy. [Built]** The system shall let a Student create a project's copy of a published proposal or terminal report form.
- **Inputs:** Form, copy name, access (anyone with the link, or named people), members.
- **Processing:** Creates a draft response with the form's next reference, a 128-bit link token and the owner.
- **Outputs:** An editable link and QR code to forward; the copy in the Student's list.
- **Validation:** Students only. The form must be open on the Portal. Name up to 80 characters. Up to 30 members with valid emails. 20 copies per network per form per hour; 40 per account per day. A form's own link never starts a copy.

**FR-4.16.5 Collaborate live. [Built]** The system shall let admitted people fill in a copy together.
- **Inputs:** Typed changes; presence.
- **Processing:** Broadcasts changes in real time, at most every 120 ms, and shows who is on which question with a coloured flag and faces on the step rail. Saves by question after a pause: 3 seconds while live, 1 second when not, at least every 10 seconds, and at once when the tab is hidden. Falls back to polling (every 15 seconds live, every 4 seconds otherwise) if the channel drops. Each device agrees to the privacy notice itself.
- **Outputs:** Live answers, presence, a saved state and a "Live" light.
- **Validation:** Every save, pulse and send checks access. For the same question, the last save wins. Sent copies refuse changes.

**FR-4.16.6 Control access. [Built]** The system shall let the owner rename a copy and change sharing.
- **Inputs:** Name, access, members.
- **Processing:** Changing who can open a copy moves it to a new live channel, so someone removed is left on one no page uses.
- **Outputs:** Updated sharing.
- **Validation:** Owner only. Private copies admit only the owner and added people, proved by Hub account or Google. Copy pages send no referrer outside the Hub and are not indexed.

**FR-4.16.7 Replace a copy's link. [Built]** The system shall let the owner replace a compromised link. The old link and QR code stop working, and answers and reference stay.

**FR-4.16.8 Request access to a private copy. [Built]** The system shall let a recognized person ask the owner for access.
- **Inputs:** Request; owner's Allow or Decline.
- **Processing:** Adds the request to the owner's Share sheet, with a count and a toast.
- **Outputs:** Added member or dropped request.
- **Validation:** One request per email; 20 waiting; 20 per person per hour.

**FR-4.16.9 Send a copy and track it. [Built]** The system shall turn a completed copy into a submitted response.
- **Inputs:** Privacy consent; saved answers.
- **Processing:** Flushes pending changes, validates all answers, and converts only the version it checked.
- **Outputs:** The same reference as a received response. Open pages switch to a receipt showing sign-off standing and any note.
- **Validation:** Rules and limits as in FR-4.15.9. A teammate's change during sending asks them to check and send again. A copy cannot be sent twice.

**FR-4.16.10 Resend a returned copy. [Planned]** The system shall reopen a Returned copy for its team, keep the sent version, and resend it under the same reference, following FR-4.15.16.

**FR-4.16.11 Remove abandoned copies. [Planned]** The system shall let the owner or the Office remove an unsent copy, and flag copies untouched for 90 days (*default*) before removal after notice. Removal is audited, and references are not reused.

**FR-4.16.12 Copy edit history. [Planned]** The system shall show who changed which question and when, and let the owner restore an earlier answer.

**FR-4.16.13 Proposal-to-report link. [Planned]** The system shall start a Terminal Report copy from an approved proposal, carrying its project name, team and budget forward, and show their pairing in both records and the activity register.

**Scaling provisions**
- Use conflict-free merging for simultaneous typing in the same paragraph, which today resolves to the last save.
- Add comments on questions for teams.
- Extend the Portal to other student-facing work, such as organization accreditation documents.
- Hand the role to a successor when a Secretary's term ends, transferring ownership of open copies.
- Move Supabase Realtime channels to dedicated capacity for campus-wide deadline days.

---

## 4.17 Reports

**FR-4.17.1 Build a report. [Built]** The system shall produce filtered management reports on screen.
- **Inputs:** Report type; filters for ranking, cycle, unit, indicator, SDG, status, quality and plan status.
- **Processing:** Filters to the viewer's scope and shows the report's columns.
- **Outputs:** An on-screen report.
- **Validation:** Requires `reports: view` and the `reports` feature.

**FR-4.17.2 Report types. [Extend]** The system shall provide:

| Report | Content | Datasets |
|---|---|---|
| Executive Reports | Positions, readiness and top risks for leadership | Results, Indicators |
| Management Review | Quarterly action-plan progress and decisions needed | Indicators |
| Ranking Performance | Current, previous, direction, readiness, pending | Results, Indicators |
| Evidence Readiness | Evidence by status and quality | Evidence |
| Unit Participation | Assigned, completed, validated, revisions, rankings served | Evidence |
| Risk and Opportunity | Critical gaps and main opportunities by ranking | Indicators |
| Action Plan Progress | Action, KPI, owner, timeline, progress, status | Indicators |
| Custom Report Builder | Any combination of filters | Evidence |

- **To complete:** Source figures from the engine's action items and summaries where sample lists remain.

**FR-4.17.3 Export a report. [Built]** The system shall export reports under data-classification rules.
- **Inputs:** Report, cycle, row count, datasets.
- **Processing:** Checks each dataset's classification and export policy, and adds a watermark where required.
- **Outputs:** A CSV file, or a prompt to request data access.
- **Validation:** Blocked or Restricted data is refused and raises an alert. *Default:* Confidential needs an approved Export grant or `governance: manage`. Four or more exports in ten minutes raise an alert. Audited.

**FR-4.17.4 Governed PDF. [Planned]** The system shall generate report PDFs on the server, in place of the browser's print function.
- **Inputs:** Report and filters.
- **Processing:** Applies the same checks as FR-4.17.3, stamps the watermark, the viewer's name and the date, and audits the export.
- **Outputs:** A branded PDF with cover page and tables.
- **Validation:** Refused where CSV export would be. Print styles carry a classification footer, and browser printing of Confidential reports is discouraged with a notice.

**FR-4.17.5 Report release. [Built]** The system shall record a report's approved release outside the Office.
- **Inputs:** Report, cycle, justification.
- **Processing:** Opens a publication request, or releases directly under the approval fallback (FR-4.24.3).
- **Outputs:** A request or a released-report record, listed to guests under Shared with you.
- **Validation:** Requires `reports: create`. Justification at least 10 characters when approval applies.

**FR-4.17.6 Publish a released report. [Planned]** The system shall turn an approved report into a Reports & Insights draft with one action, so release and public publication connect.

**FR-4.17.7 Scheduled reports. [Planned]** The system shall generate chosen reports on a schedule and send them to named recipients with permission, by a secure link.

**Scaling provisions**
- Add saved report definitions per person and shared ones per unit.
- Run large reports in the background and notify when ready.
- Offer a read-only data feed for the University's business intelligence tools.

---

## 4.18 Notifications and Email

**FR-4.18.1 In-app notifications. [Built]** The system shall notify the Office, a unit or an account of workflow events.
- **Inputs:** Event; template with placeholders.
- **Processing:** Fills the template and posts a notice with a link. Filters by recipient and preference.
- **Outputs:** A bell inbox with unread state and links; "mark read".
- **Validation:** Disabled templates produce nothing. Email-only templates produce no in-app notice. Recipients see only notices addressed to them.

**FR-4.18.2 Email delivery service. [Planned]** The system shall send email through a transactional mail provider.
- **Inputs:** Event; template; recipient; preference.
- **Processing:** Queues each message in the same commit as its event, sends with retries and backoff, records delivered, bounced and failed states, and honours preferences. Sends from a verified University domain with SPF, DKIM and DMARC.
- **Outputs:** Sent email with a link back to the Hub; a delivery log for administrators.
- **Validation:** Required notices (account and security) ignore preferences. Hard bounces stop further sends and alert the Office. Emails carry no sensitive record content, only a summary and a link. Rate-limited per recipient.

**FR-4.18.3 Event emails. [Planned]** The system shall email on these events:

| Event | Template | To |
|---|---|---|
| Account invited; invitation re-sent | Invitation | The person |
| Access request received; decided | Receipt; Decision | The applicant |
| Account suspended | Account suspended | The person |
| New device; factor changed | Security notice | The person |
| Evidence accepted or returned | Evidence accepted; Revision requested | The unit |
| Request decided | Request decision | The requester |
| Deadline approaching | Deadline reminder | The unit and Office |
| Data requested, reminded, returned, escalated | Data request templates | The unit or Office |
| Assistance reply | Assistance | The unit or Office |
| Form sign-off due; form response arrived | Forms | Signatory; form runners |

- **Validation:** The message must be sent before any screen says it was sent. Screens stating "sent" are corrected if delivery fails.

**FR-4.18.4 Digests. [Planned]** The system shall offer a daily or weekly email summary in place of single emails, per person.

**FR-4.18.5 Outcome messages. [Built]** The system shall report every outcome as a top-right toast that closes after 8 seconds, pauses on hover or focus, stacks up to four, and restarts rather than repeats. A message arriving with a redirect is shown once, and its URL parameter is removed.

**FR-4.18.6 Notice retention. [Extend]** The system shall keep notices for a set period. It keeps the newest 300 overall today.
- **To complete:** Move to a per-recipient store with pagination and a configurable retention period, so one busy recipient cannot crowd out another.

**Scaling provisions**
- Add browser push and Google Chat channels through the same preferences.
- Keep notices in a dedicated table, outside the governance store, as volume grows.

---

## 4.19 Workspace Shell and Search

**FR-4.19.1 Navigation. [Built]** The system shall provide a permanent sidebar with permitted pages, expandable children for Rankings, Analytics, Publications, Workspace and Administration, live counts, and a mobile menu.
- **Inputs:** Viewer's permissions, feature switches.
- **Processing:** Shows only permitted rows, and a server gate re-checks each page.
- **Outputs:** Sidebar, icon-only rail remembered per browser, breadcrumbs, and an About link at the foot.
- **Validation:** A blocked page shows an access message, not its data.

**FR-4.19.2 Reporting cycle selector. [Extend]** The system shall let the viewer select a reporting cycle in the top bar and sidebar.
- **Inputs:** Cycles within the viewer's scope.
- **Processing:** Lists non-archived cycles.
- **Outputs:** The selected cycle.
- **Validation:** Respects year scope.
- **To complete:** Make every dashboard and table filter by the selection and remember it per person.

**FR-4.19.3 Workspace search. [Built]** The system shall search permitted content from a palette (⌘K or `/`).
- **Inputs:** Query.
- **Processing:** Searches pages, rankings, indicators, dictionary terms, stories, units and evidence, best matches first.
- **Outputs:** Grouped results and a link to search the dictionary.
- **Validation:** Only permitted content. Never takes keystrokes from another field.

**FR-4.19.4 Content tabs and search fields. [Built]** The system shall use one shared tab strip and search field, with the search on the far right, count badges, arrow-key navigation, and `/` and Esc hints. Unit categories are always Faculty/Colleges, University Offices and Research Centers.

**FR-4.19.5 Light and dark themes. [Built]** The system shall offer a theme switch, following the system setting at first and remembered per browser.

**FR-4.19.6 Fast page changes. [Built]** The system shall show page skeletons at once and reuse a recently visited tab from memory for 30 seconds. Any change clears this cache.

**FR-4.19.7 Pickers and field messages. [Built]** The system shall use its own dropdowns, date pickers and number steppers, and its own validation messages, the same in Chrome, Safari, Firefox and Edge on desktop and phone.
- **Inputs:** Native constraints or custom messages per field.
- **Processing:** On a failed submit, marks each failing field with a red edge, shake and warning triangle, focuses the first, and reads its message. Clicking or focusing a flagged field clears its warning, and submitting rechecks it.
- **Outputs:** Field feedback and a tooltip on the triangle.
- **Validation:** Browser validation bubbles never show. Messages say what to do.

**FR-4.19.8 Accessibility and motion. [Built]** The system shall honour reduced-motion preferences, keep keyboard and screen-reader support on shared controls, and use a branded cursor with custom shapes for clickable items.

**FR-4.19.9 Empty and loading states. [Built]** The system shall show illustrated empty states and handle absent data on every screen.

**FR-4.19.10 Guided tours. [Planned]** The system shall offer a short first-use tour per role, which can be dismissed and reopened from Support.

**Scaling provisions**
- Add a server-side search index for evidence and documents. The palette's index is built in the browser today, which limits its size.
- Add pinned pages and recent items per person.
- Offer an installable mobile app form of the workspace.

---

## 4.20 Administration Overview

The Administration console has sections: Overview, Accounts, Roles & Permissions, Directory, Data Governance, Privacy & Security, Audit Logs, Workflows, System Configuration, Backup & Recovery. Only University-wide Administrators hold these by default.

**FR-4.20.1 Console overview. [Built]** The system shall summarize the Hub's health.
- **Inputs:** Accounts, requests, alerts, backups, audit trail.
- **Processing:** Computes active accounts and invitations, items to approve, security alerts, last backup, a to-do list, activity over 14 days with denied actions, and status indicators (Hub online, Google sign-in, backups current, audit log verified).
- **Outputs:** An overview page.
- **Validation:** Shows only sections the viewer may see.

**FR-4.20.2 Health checks. [Planned]** The system shall show real status for sign-in, database, storage, mail, the daily job and the deadline sources, in place of fixed labels, and alert on failure.

**Scaling provisions**
- Send operational alerts to more channels (the alert webhook already accepts Slack, Google Chat and Discord).
- Add charts of usage and capacity for planning.

---

## 4.21 Accounts

Tabs: Accounts and Access Requests, with search and filters by role, unit and affiliation.

**FR-4.21.1 Invite an account. [Extend]** The system shall let an Administrator create an account, using the same fields and rules as FR-4.3.1, in three steps.
- **Inputs:** Person's details, role, unit, scope, end date.
- **Processing:** Creates a Pending Invitation with its assignment, and emails the invitation. The account activates at first sign-in.
- **Outputs:** A new account, a toast and an email.
- **Validation:** The email must have no account. Outside people become External and need `accounts: manage`, guest sign-in on, and a future end date. The inviter cannot grant beyond their own authority. Students hold no unit scope.
- **To complete:** Send the email (FR-4.18.3). No email leaves the system today, though the screen says "Invitation sent". "Re-send" updates a date only.

**FR-4.21.2 Bulk invitations. [Planned]** The system shall invite many people from a spreadsheet.
- **Inputs:** A CSV or XLSX with the invitation fields.
- **Processing:** Validates each row by FR-4.21.1, previews rows and problems, then creates accepted rows.
- **Outputs:** Counts created and skipped; a downloadable problem list.
- **Validation:** 500 rows per file. Each row passes the single-invite rules. Audited per account.

**FR-4.21.3 Re-send or cancel an invitation. [Extend]** The system shall re-send a pending invitation or cancel it with a reason. Only pending invitations can be re-sent.
- **To complete:** Re-sending sends the email.

**FR-4.21.4 Account status. [Built]** The system shall suspend, reactivate or deactivate an account.
- **Inputs:** Account, status, reason.
- **Processing:** Ends the account's sessions when it is not Active. Reactivating restarts the inactivity clock.
- **Outputs:** Updated status; an audit entry.
- **Validation:** Not your own account. Reason at least 5 characters (300 at most) except when activating. The last active University-wide Administrator cannot be removed. Pending accounts activate only by signing in.

**FR-4.21.5 Update and transfer. [Built]** The system shall edit an account and move it to another unit.
- **Inputs:** Name or title; destination unit and whether to move scopes.
- **Processing:** Transfers keep earlier submissions with the old unit and remove coordinator designations there.
- **Outputs:** Updated account; an audit entry.
- **Validation:** Name at least 3 characters. The destination must be active and within the actor's units.

**FR-4.21.6 Session control. [Built]** The system shall revoke an account's sessions and force re-authentication. Both are audited.

**FR-4.21.7 Role assignments. [Built]** The system shall add and remove assignments.
- **Inputs:** Account, role, scope, end date, note.
- **Processing:** Raising an active account above its tier goes through the privilege-escalation workflow when that applies.
- **Outputs:** A new assignment or a request.
- **Validation:** Valid units, datasets and cycles. Future end date. External accounts hold only External, which needs an end date. No duplicates. You cannot change your own roles. The last Administrator is protected.

**FR-4.21.8 Access Requests tab. [Built]** The system shall list applicants with domain evidence, keep the list live while open, and let approvers mark a request under review, confirm its unit, and decide (FR-4.24.2).

**FR-4.21.9 Inactive account review. [Extend]** The system shall flag accounts idle past the policy (*default* 90 days) and let an administrator keep them active, which is recorded.
- **To complete:** Warn the person by email, and suspend automatically after a further configurable period if nobody acts.

**FR-4.21.10 Expiry notice. [Planned]** The system shall warn a person and their sponsor 14 days before temporary access ends.

**Scaling provisions**
- Sync accounts and unit moves from the University's HR or directory data, so leavers are found automatically.
- Add account search and paging on the server as numbers grow.

---

## 4.22 Organizational Directory

Tabs follow the unit categories Faculty/Colleges, University Offices and Research Centers. Units are never deleted, so their history stays.

**FR-4.22.1 Create a unit. [Built]** The system shall add units to the hierarchy.
- **Inputs:** Name, code, kind, parent, emails, logo, justification.
- **Processing:** Creates the unit or, when approval applies, opens a request.
- **Outputs:** A unit or request; an audit entry.
- **Validation:** Name at least 3 characters (120 at most). Code matches `^[A-Z0-9][A-Z0-9-]{1,15}$` and is unique. Parent must be active. Up to 6 valid emails. Logo PNG or JPG up to 2 MB.

**FR-4.22.2 Update a unit. [Built]** The system shall edit names, codes, emails and logos, keeping a change history on the unit.

**FR-4.22.3 Coordinators. [Built]** The system shall add and remove a unit's coordinators one at a time, preserving another administrator's concurrent changes. Deactivated accounts cannot be coordinators, and archived units must be reactivated first.

**FR-4.22.4 Move, archive and reactivate. [Built]** The system shall restructure units.
- **Inputs:** Unit; new parent; reason.
- **Processing:** Archiving includes units beneath and warns of remaining people.
- **Outputs:** An updated hierarchy; an audit entry.
- **Validation:** Requires directory management rights. The University root cannot be moved or archived. A unit cannot move beneath itself. Reason at least 5 characters. A parent must be active first.

**FR-4.22.5 Merge units. [Built]** The system shall merge one unit into another.
- **Inputs:** Unit, target, reason.
- **Processing:** Moves child units and people to the target and keeps earlier submissions credited to the merged unit.
- **Outputs:** An archived unit with its history; an audit entry.
- **Validation:** Not into itself or beneath itself. Reason at least 5 characters. Merged units cannot be reactivated.

**FR-4.22.6 Complete office list. [Planned]** The system shall add offices that indicators name but the Directory lacks, including the Sustainability Office, Campus Security, UST Hospital, CCPET and Legal & Compliance, and convert their owner labels to real owners on indicators.

**Scaling provisions**
- Support other UST campuses as branches of the hierarchy, each with scoped administrators.
- Sync with an official University unit list when one is available.
- Support effective dates, so a reorganization can be scheduled.

---

## 4.23 Data Governance

Tabs: Datasets, Quality, Dictionary. Thirteen datasets are registered, including Published ranking results, Evidence submissions, Indicator values, Reputation survey contacts, Student and staff data, and Digital form responses.

**FR-4.23.1 Dataset registry. [Built]** The system shall record each dataset's owner, steward, classification, retention, export policy and versions.
- **Inputs:** The field changes; justification.
- **Processing:** Increments the version with a note. Restricted forces export to Blocked; Confidential moves Allowed to Approval required. Changing a dataset with a public surface shows or hides it on the website.
- **Outputs:** Version history; an audit entry.
- **Validation:** Reclassifying needs `governance: manage` and a justification of at least 10 characters. Locked datasets cannot be reclassified. Personal data cannot be Public. Restricted is never exported. Stewards and owners must be active. Retention 1–50 years.

**FR-4.23.2 Quality rules. [Extend]** The system shall run data checks and show failures with records to fix.
- **Inputs:** Rule toggles; run command.
- **Processing:** Runs nine rules: reporting period in the cycle window, attached source, stated beneficiaries, indicator mapping, no duplicates, replication guidance, twelve monthly meter readings, staff as full-time equivalents, and tracer responses within 12 months.
- **Outputs:** Passing, Warning, Failing or Off status.
- **Validation:** Requires governance rights.
- **To complete:** Read the period window from the current cycle; it is fixed to 2025 in code. Feed the three "external" rules from real data sources (FR-4.31).

**FR-4.23.3 Duplicate resolution. [Built]** The system shall flag near-identical evidence titles from the same unit (similarity of at least 0.86) and let a steward merge or dismiss them.
- **Inputs:** Pair; decision; record to keep.
- **Processing:** Merging marks the other record Not applicable and adds a comment.
- **Outputs:** A recorded decision; an audit entry.
- **Validation:** The pair must still be a likely duplicate.

**FR-4.23.4 Data access requests. [Built]** The system shall let a person request temporary dataset access.
- **Inputs:** Dataset, access type (View or Export), end date, justification.
- **Processing:** Opens a data-access approval request. Approval creates a time-limited grant.
- **Outputs:** A request reference and, once approved, a grant.
- **Validation:** Future end date, 90 days at most. Justification at least 10 characters. Restricted data can never be exported. Only for oneself unless the requester has `governance: edit`.

**FR-4.23.5 Data dictionary. [Built]** The system shall maintain term definitions, units of measure, stewards and datasets. Definition 10–600 characters; unit of measure up to 40.

**FR-4.23.6 Retention enforcement. [Extend]** The system shall act on each dataset's retention rule.
- **Inputs:** Retention years and action (Archive, Review or Dispose); the daily job.
- **Processing:** Lists what is past retention, notifies the steward, and carries out the action once approved through the destructive workflow. Archive moves data to cold storage. Dispose removes it and writes a disposal record. Legal hold pauses disposal.
- **Outputs:** A retention queue; disposal certificates.
- **Validation:** Disposal always needs a second approver. Published results and audit records are exempt by default.
- **To complete:** Only the listing exists today. Add notices, actions, legal hold and disposal records.

**FR-4.23.7 Data lineage. [Planned]** The system shall show, for any reported figure, the value, its source file or person, its evidence and its review history.

**Scaling provisions**
- Add new datasets and rules through configuration.
- Schedule quality runs daily and trend failures over time.
- Connect to a University data catalogue if one is established.

---

## 4.24 Approval Workflows

Tabs: Waiting for you, All requests, Settings. Workflows: account access, privilege escalation, new units, data access, publication (two steps by default), destructive backup operations, and final submission (FR-4.9.4).

**FR-4.24.1 Configure a workflow. [Built]** The system shall let managers set a workflow's on/off state, response time, separation of duties and steps.
- **Inputs:** Enabled, days, separation, steps.
- **Processing:** Saves the change and audits it.
- **Outputs:** Updated workflow.
- **Validation:** 1–30 days. 1–5 named steps. Destructive operations can never be switched off or lose separation of duties.

**FR-4.24.2 Decide a request. [Built]** The system shall let approvers review, approve or reject step by step.
- **Inputs:** Request, decision, note, unit (for an account without one).
- **Processing:** Advances steps. On final approval, re-validates and applies the change. Rejection returns a waiting item to its earlier state.
- **Outputs:** Applied change; requester notified; an audit entry.
- **Validation:** The requester cannot approve with separation on. One person cannot approve two steps. Rejection needs a note. Closed requests cannot be decided again. If the change no longer applies, it is refused with the reason.

**FR-4.24.3 Approval fallback. [Built]** The system shall apply a change directly when its workflow is off or too few other approvers exist, and state this in the audit entry. Destructive operations and the Office's review of a unit's publication do not fall back. Production should keep at least three University-wide Administrators so that two-person control always applies.

**FR-4.24.4 Open or withdraw a request. [Built]** The system shall let eligible users open requests (justification at least 10 characters) for a dataset, a role or an account, and let the requester or a manager withdraw pending ones.

**FR-4.24.5 Overdue requests. [Planned]** The system shall flag requests past their response time, remind approvers, and escalate to the Director.

**FR-4.24.6 Named approvers. [Planned]** The system shall let a step name who may decide it, such as Ranking Specialist or Director, in addition to any University-wide Administrator.

**Scaling provisions**
- Add new workflow kinds by adding a request kind and its apply step.
- Add parallel approvals where several offices must agree.
- Add delegation during an approver's absence.

---

## 4.25 Privacy and Security

Tabs: Sign-in, Access reviews, Privacy, Alerts and incidents, Data protection. These settings support University policies and the Data Privacy Act of 2012.

**FR-4.25.1 Security policy. [Extend]** The system shall store and apply sign-in, session, lockout, inactivity, export, sharing and privacy-contact settings.
- **Inputs:** Policy section values.
- **Processing:** Saves the policy, audits it and raises a low-severity alert. Each setting takes effect at once.
- **Outputs:** Updated policy.
- **Validation:** Idle 5–240 minutes. Absolute 1–24 hours. Warning shorter than idle. Lockout 3–20 failures in 5–120 minutes. Inactivity 30–365 days. Restricted must stay blocked. Breach escalation 1–72 hours. At least one valid sign-in domain. Turning second factors off, or changing sign-on, needs `security: manage`.
- **To complete:** Enforce second factors (FR-4.2.2), lockout (FR-4.2.3) and the external-links sharing setting. Only the guest-downloads message reads the sharing settings today.

**FR-4.25.2 Access reviews. [Built]** The system shall run access recertification.
- **Inputs:** Name, population (privileged, external, all), due date; Keep or Revoke per account.
- **Processing:** Completion suspends revoked accounts and ends their sessions.
- **Outputs:** A completed review; an audit entry.
- **Validation:** Future due date. Nobody recertifies their own access. All decisions are required before completion.

**FR-4.25.3 Scheduled access reviews. [Planned]** The system shall start reviews on a schedule (*default* quarterly for privileged and external accounts) and remind reviewers.

**FR-4.25.4 Privacy impact assessments. [Built]** The system shall record assessments (PIA-##) by dataset, risk (Low, Medium, High), status (Draft, In review, Approved), owner and measures. Safeguards at least 10 characters.

**FR-4.25.5 Data subject requests. [Extend]** The system shall log and fulfil data subject requests.
- **Inputs:** Type (Access, Correction, Erasure or blocking, Objection, Portability), subject description, date received; status, note.
- **Processing:** Sets a response date 30 days after receipt. Fulfilment tools find the person's data across accounts, access requests and form responses, produce an export, and carry out correction or erasure after approval.
- **Outputs:** A register (DSR-###), an export file and a completion record.
- **Validation:** Received date not in the future. Subject described without naming them. Erasure respects retention duties and legal holds, and leaves an audit record without the personal data.
- **To complete:** The register exists. Add the search, export and erasure tools, and reminders before the due date.

**FR-4.25.6 Alerts. [Built]** The system shall raise, acknowledge and resolve alerts by severity. Kinds: Suspicious sign-in, Repeated failed sign-ins, Unusual export, Privilege change, Policy change.

**FR-4.25.7 Incidents. [Built]** The system shall log incidents with a status timeline.
- **Inputs:** Title, severity (Low to Critical), personal-data flag, note; status updates; escalated-to.
- **Processing:** An incident involving personal data raises an alert naming the escalation deadline. Statuses run Reported, Investigating, Escalated, Contained, Closed.
- **Outputs:** A register (INC-###) and timelines.
- **Validation:** Title at least 6 characters. Timeline note at least 3 characters.

**FR-4.25.8 Breach notification support. [Planned]** The system shall draft notices to the National Privacy Commission and affected people from an incident's details, and track the 72-hour clock.

**FR-4.25.9 Secret key management. [Extend]** The system shall track secrets and their rotation.
- **Inputs:** Key record; rotation confirmation.
- **Processing:** Warns before a key's rotation date (*default* 180 days), lists the steps, and verifies that the new secret works before recording the rotation. Rotates automatically where a provider allows it.
- **Outputs:** Rotation record; an alert when overdue.
- **Validation:** Requires `security: manage`. Secret values are never stored or shown.
- **To complete:** Today this only updates a date. The real credential does not change.

**FR-4.25.10 Encryption and data protection display. [Built]** The system shall show encryption at rest and in transit and where secrets are kept, under Data protection.

**Scaling provisions**
- Connect alerts to a security monitoring service.
- Add IP allowlists for administrator access.
- Add periodic third-party penetration testing and record results as assessments.

---

## 4.26 Audit Trail

**FR-4.26.1 Record events. [Built]** The system shall record governed actions in an append-only, hash-chained log.
- **Inputs:** Every command and sign-in; time, actor, role, action, category, resource, outcome, detail.
- **Processing:** Seals each entry with the previous hash when a change commits. Records access denials. Database rules refuse updates and deletes. Categories: Account, Access, Session, Data, Approval, Export, Directory, Security, Configuration, Backup.
- **Outputs:** Sealed entries.
- **Validation:** Entries cannot be edited. Ordinary invalid input is not logged.

**FR-4.26.2 Search the log. [Built]** The system shall search by names or actions and filter by category, period (any, 24 hours, 7 days, 30 days) and outcome.

**FR-4.26.3 Verify the chain. [Built]** The system shall check the chain and report where it breaks, and show the result on the Overview. The chain head is also anchored periodically outside the database.

**FR-4.26.4 Export the log. [Built]** The system shall export entries as CSV, requiring `audit: export`, 10,000 entries at most, neutralizing spreadsheet formula characters and auditing the export.

**FR-4.26.5 Scheduled verification. [Planned]** The daily job shall verify the chain and raise a critical alert on any break.

**FR-4.26.6 Audit retention and archive. [Planned]** The system shall move old entries to verified cold storage by the access dataset's retention rule, keeping the chain checkable.

**Scaling provisions**
- Page and index the log by month as it grows.
- Stream entries to an external security log.

---

## 4.27 System Configuration

Tabs: Rankings, Calendar, Workspace, Notifications, Features.

**FR-4.27.1 Ranking bodies. [Built]** The system shall add and enable bodies. A switched-off body's rankings leave the workspaces and public site, its evidence stops counting toward readiness, and nothing is deleted. Name at least 3 characters, short name at least 2, `https` website, unique name. New bodies start as planned.

**FR-4.27.2 Rankings. [Built]** The system shall set each ranking as tracked or public and set its deadline (see FR-4.7.6).

**FR-4.27.3 Cycles and academic years. [Built]** The system shall manage reporting cycles (Current, Open, Closed, Archived) and academic years, written as `2027–2028`. Cycles span consecutive years and are unique. A Current cycle cannot be changed until another is made current.

**FR-4.27.4 Reporting periods. [Built]** The system shall manage periods and whether they accept evidence. Label 4–60 characters and unique; note up to 120. At least one period must stay open.

**FR-4.27.5 Upload limits. [Built]** The system shall set upload rules. 1–200 MB per file; 1–50 files; types from PDF, XLSX, XLS, CSV, DOCX, DOC, PPTX, PNG, JPG, JPEG, ZIP, TXT.

**FR-4.27.6 Notification templates. [Built]** The system shall edit templates with a preview and switch them on or off. Subject required (160 characters at most); body 10–1,000 characters.

**FR-4.27.7 Dashboard defaults. [Built]** The system shall set the Office's opening view, clock display and deadline warning (3–90 days).

**FR-4.27.8 Feature switches. [Built]** The system shall switch these on or off: Evidence submission, Assistance requests, Report builder, Recognition wall, public Publications, public Recognition, public Knowledge Center.

**FR-4.27.9 Feature flags. [Extend]** The system shall stage new features as Off, Selected (named people or units) or Everyone. A Selected flag must name someone. Flags: Automatic ranking matching (FR-4.10.5), Spreadsheet upload (FR-4.8.16), Evidence reuse insights (FR-4.10.12), Story drafting help (FR-4.13.12).
- **To complete:** Only reuse insights changes behaviour today. The others take effect when their features are built. Rename "Spreadsheet upload in Submit data" to match Data requests.

**FR-4.27.10 Site notice. [Built]** The system shall set a notice across the public site and workspaces. 240 characters at most, and at least 6 to switch on.

**FR-4.27.11 Reference data management. [Planned]** The system shall let the Office edit reference data on screen: ranking frameworks and indicators, deadline sources, dictionary terms, lists (article types, insight types, story themes), office profile and site photographs. These live in database tables and are changed by migration today.

**Scaling provisions**
- Add configuration export and import between environments.
- Keep a history of settings with one-step rollback.

---

## 4.28 Backup and Recovery

**FR-4.28.1 Scheduled backups. [Built]** The system shall keep the recovery point objective automatically.
- **Inputs:** Objectives (*default* 60 minutes recovery point, 240 minutes recovery time).
- **Processing:** A change made more than the objective after the last point triggers a backup; a full backup is taken when the last one is a day old. Expired points are removed.
- **Outputs:** Recovery points (RP-####), with an alert on the Overview if a backup is due.
- **Validation:** Written to private storage with a checksum.

**FR-4.28.2 Manual backup. [Built]** The system shall create a recovery point on request. Requires `backup: manage`.

**FR-4.28.3 Verify a recovery point. [Built]** The system shall test a point's integrity and record the result (RT-###). Failed points cannot be tested; a mismatch records a failure.

**FR-4.28.4 Retention settings. [Built]** The system shall set retention. Daily points 7–365 days (*default* 35); monthly copies 1–120 months (*default* 12); off-site copy on or off.

**FR-4.28.5 Restore or delete. [Built]** The system shall perform these only after a second Administrator approves.
- **Inputs:** Operation, point, justification.
- **Processing:** Opens a destructive request; approval schedules the operation.
- **Outputs:** A request and, once approved, the operation.
- **Validation:** Justification at least 10 characters. Only completed, restorable points can be restored. One pending request per point.

**FR-4.28.6 Complete coverage. [Planned]** The system shall bring everything into its recovery plan.
- **Inputs:** Form responses, analytics tables, uploaded files, audit trail.
- **Processing:** Adds these to recovery points or a coordinated database and storage backup. Copies off-site to a second provider or region. Runs on a timed job, so backups happen even when nobody makes a change.
- **Outputs:** A recovery point covering the whole system; a coverage statement on the Backup page.
- **Validation:** Restore must never reduce audit entries. A restore test must prove each part. Today points cover the governance store only.

**FR-4.28.7 Recovery runbooks. [Extend]** The system shall list recovery procedures with owner and steps.
- **To complete:** Write the procedures, and hold a timed restore drill at least twice a year with the result recorded.

**Scaling provisions**
- Add point-in-time recovery on the database plan.
- Add a warm standby if the University requires a shorter recovery time.

---

## 4.29 Automation and Common Services

**FR-4.29.1 Daily job. [Built]** The system shall run a daily round at 22:00 UTC (06:00 Manila).
- **Inputs:** A scheduled request with a bearer secret.
- **Processing:** Runs the deadline check, then analytics reminders, escalations and weekly snapshots. One failing does not stop the other.
- **Outputs:** A JSON summary; findings and notices; audit entries.
- **Validation:** Refused with 401 unless the secret matches, compared in constant time.

**FR-4.29.2 Housekeeping. [Built]** Before each governed change, the system shall expire assignments, data grants, sessions and challenges, redact closed requests' personal data, and remove expired recovery points. Each removal is audited.

**FR-4.29.3 Command control. [Built]** Every change shall pass one server check.
- **Inputs:** A command from the browser, treated as untrusted.
- **Processing:** Checks session, form and size, rate limit, stored files and authorization. Applies the change in one database transaction, with a retry if another server committed first, seals the audit and re-renders affected pages.
- **Outputs:** A result with a message and, where relevant, a request ID.
- **Validation:** Known command types only. Plain JSON, 512 KB at most, depth 12. Prototype keys refused. Per account per minute: 120 commands, 30 uploads, 10 exports.

**FR-4.29.4 File storage and delivery. [Built]** The system shall keep uploads in private storage and serve files by the rule for each kind.
- **Inputs:** A `/media/...` path.
- **Processing:** Reference pictures are open. Post pictures, logos and PDFs are copied to public storage only while published or in use, and otherwise limited to people with rights. Evidence and Workspace files go only to permitted viewers. Abandoned uploads are swept at most hourly; released files stay for the backup retention period.
- **Outputs:** A picture, or a sandboxed download.
- **Validation:** Anything not permitted returns 404. Only images display inline. Uploads use signed, single-object URLs, and the server re-reads each file's size.

**FR-4.29.5 Rate limiting. [Built]** The system shall limit actions across all server instances, using a hashed client key so no address is stored. Unauthenticated forms stop if the counter is unreachable; everyday actions continue.

**FR-4.29.6 Security headers. [Built]** The system shall send a per-request Content Security Policy, HSTS in production, and frame, content-type, referrer and permissions headers. A first gate turns away workspace requests with no session cookie.

**FR-4.29.7 Operational alerts. [Built]** The system shall report failures (store saves, recovery points, public media copies, audit anchor, unhandled errors) to the server log and an optional webhook, once per ten minutes per event, with no personal data.

**FR-4.29.8 Presentation mode. [Built]** The system shall show sample data only when `NEXT_PUBLIC_DEMO_DATA` is set. It must be off in production.

**FR-4.29.9 Retire superseded functions. [Planned]** The system shall remove server commands and switches that no screen uses, after confirming no data depends on them.
- **Scope:** `data.submit` and the "Reporting-period data entry" switch, replaced by Data requests. `story.propose`, `innovation.propose` and their switches, replaced by Unit Publications and WURI cases. These screens were deliberately removed.
- **Validation:** Existing records stay readable. Temporary preview pages, such as `/zz-preview-posts`, are deleted before release.

**Scaling provisions**
- Move the daily job's steps onto a job queue with retries, because the job has a 60-second limit today.
- See section 4.32 for system-wide capacity.

---

## 4.30 Reputation Survey Contacts

The dataset "Reputation survey contact lists" is registered and classified Restricted, and the Office's procedures make academic and employer reputation a core workstream. No screen exists yet.

**FR-4.30.1 Contact register. [Planned]** The system shall keep academic and employer contacts for QS and THE survey nominations.
- **Inputs:** Name, institution or employer, email, country, subject area, relationship, nominating unit, consent.
- **Processing:** Stores contacts under strict access, and detects duplicates by email.
- **Outputs:** A register per ranking and cycle.
- **Validation:** Valid email. Consent recorded. Units see only their own nominations. Export follows the dataset's classification and never leaves except to the body's own portal.

**FR-4.30.2 Collect nominations from units. [Planned]** The system shall request nominations through Data requests or a form, with a target per subject.

**FR-4.30.3 Target coverage. [Planned]** The system shall show nominations against targets by subject, region and sector, and flag thin areas.

**FR-4.30.4 Submission to the body. [Planned]** The system shall produce the body's upload file, limited to the required fields, audited as a Restricted export approved by the Director.

**FR-4.30.5 Opt-out and retention. [Planned]** The system shall honour a contact's opt-out at once and remove contacts past retention.

**Scaling provisions**
- Add engagement tracking per contact, such as events, visits and joint work.
- Link alumni and employer offices' lists through counts or matched fields rather than copies.

---

## 4.31 External Data Connections

Today, figures enter by hand or through files. These connections reduce re-keying and let the external quality rules run.

**FR-4.31.1 Bibliometric data. [Planned]** The system shall import research output and citation figures per subject and unit from Scopus or SciVal exports, and through an API if the University's licence allows, for the research-based indicators and diagnostics.
- **Validation:** Stored as counts and aggregates; source and date recorded; licence terms respected.

**FR-4.31.2 Institutional data. [Planned]** The system shall receive counts from the Registrar, HR, FMO and Finance through scheduled secure transfers, as an option alongside FR-4.8.21. Counts only; no personal rows.

**FR-4.31.3 Building management data. [Planned]** The system shall receive energy, water and waste readings for the campus indicators and the meter-reading quality rule.

**FR-4.31.4 Ranking body results. [Planned]** The system shall import a body's published results and peer figures from its exports, adding to manual entry.

**FR-4.31.5 Connection management. [Planned]** The system shall list each connection's owner, last run, status and failures, store its secrets on the server only, and alert on failure.

**Scaling provisions**
- Add a documented read-only API for University systems, with keys scoped by dataset and classification.
- Add webhooks for events such as a validated value or a published result.

---

## 4.32 System-Wide Scaling

The Hub runs on Next.js on Vercel, Supabase (PostgreSQL, Auth, Realtime) and Cloudflare R2. The table states where each part reaches its limit and how it should grow.

| Area | Today | Limit to watch | Scaling path |
|---|---|---|---|
| Governance store | The whole model is read into each server's memory, with row-level commits and a retry on conflict | Memory and commit conflicts as records grow, since every change re-versions the store | Move high-volume records (evidence, notices, sessions, posts) to per-entity queries, keeping one-transaction commands |
| Sessions | Read with the store; last activity written at most once a minute | Reads on every instance refresh | Dedicated session table access or a fast cache |
| Form responses | Own table, outside the store | Large forms during deadline days | Indexes by form and date; partitioning; read replica for analytics |
| Analytics facts | 18 tables outside the store; summaries cached per instance for 60 seconds | Computation time as editions and units grow | Shared cache; background recomputation; precomputed reports |
| Audit trail | Append-only table, with a day's entries in memory | Table growth and full-chain checks | Monthly partitions; checkpoints so verification reads only new entries |
| Notices | Newest 300 in the store | One list shared by everyone | Per-recipient table with paging |
| Files | R2 private and public buckets, direct browser uploads | Practically none on storage; 200 MB ceiling per file | Multipart uploads; lifecycle rules to cold storage |
| Public site | Rendered on request, with a per-request security nonce | Traffic spikes on ranking days | Cache public data aggressively; move public images to the CDN domain |
| Live collaboration | Supabase Realtime, one channel per copy | Connections on deadline days | Higher plan or dedicated capacity; polling already works as fallback |
| Search | Built in the browser from permitted data | Size of the index sent to the browser | Server-side search index with permission filtering |
| Scheduled work | One daily job, 60-second limit | More sources and more reminders | Job queue with retries and per-task runs |
| Rate limits | Database counter | Database load under attack | Edge rate limiting in front, keeping the counter for business limits |

**Growth in scope**

| Direction | Provision |
|---|---|
| More rankings | Add by data: framework, methodology pack, template mapping, deadline source. Asia editions, QS Stars, THE Interdisciplinary Science, AppliedHE and national assessments fit without code. |
| More units and people | The Directory hierarchy and scope model already support nesting. Add server paging to Accounts and Units past about 1,000 records. |
| Other UST campuses | Add campuses as branches of the Directory with scoped Administrators, and report by campus. |
| Other institutions | Add a tenant key to tables and per-tenant settings, if the University ever offers the Hub to partners. This is a large change and should be decided early. |
| Office operations | The Office's procedures also cover international travel, budget forecasting, supply and job requisitions, teambuilding, partner benchmarking visits and WURI evaluator work. These can be added as Digital Forms with sign-offs, without new modules. |
| Accreditation | Reuse the evidence warehouse for AUN-QA, PAASCU and similar reviews through a new framework type. |
| Languages | Add a translation layer for labels and approved translations for content. |
| Mobile | Offer an installable app form of the workspace; the layouts are already responsive. |
| AI assistance | Offer optional, labelled help for evidence summaries, gap explanations and story drafts, with no personal data sent and a person always confirming. |

---

## 4.33 Remaining Work Summary

Every item below is specified above. The grouping suggests a sensible order, but it is a proposal for the Office to confirm.

**Release 1: complete what screens already promise**

| Item | Requirement |
|---|---|
| Email delivery, and invitation, receipt, decision and security emails | FR-4.18.2, FR-4.18.3, FR-4.3.1, FR-4.3.7, FR-4.21.1 |
| Assistance message storage, Office queue and conversation | FR-4.11.1–FR-4.11.5 |
| Sign-in lockout and multi-factor enforcement | FR-4.2.2, FR-4.2.3, FR-4.25.1 |
| Governed PDF for reports | FR-4.17.4 |
| Replace illustrative diagnostics, recognition and report figures | FR-4.7.3, FR-4.7.5, FR-4.17.2, FR-4.1.8 |
| Cycle selector filtering; health checks | FR-4.19.2, FR-4.20.2 |
| Quality rule period from the cycle | FR-4.23.2 |
| Policy page text; retire unused commands; delete preview pages | FR-4.1.11, FR-4.29.9 |

**Release 2: complete the ranking cycle**

| Item | Requirement |
|---|---|
| Remaining methodology packs | FR-4.8.2 |
| Final Submission Management | FR-4.9.1–FR-4.9.7 |
| Deadline reminders; calendar feed | FR-4.7.9, FR-4.7.10 |
| Spreadsheet answers; automatic matching; server drafts | FR-4.8.16, FR-4.10.5, FR-4.10.4 |
| Quarterly review pack; leadership summary; targets and what-if | FR-4.8.29, FR-4.6.5, FR-4.8.30 |
| Complete office list | FR-4.22.6 |

**Release 3: complete forms and recognition**

| Item | Requirement |
|---|---|
| Terminal Report and standard templates | FR-4.15.5 |
| File upload question; editing returned responses and copies; removing abandoned copies | FR-4.15.15, FR-4.15.16, FR-4.16.10, FR-4.16.11 |
| Named signatory approval; official PDF; arrival alerts | FR-4.15.12, FR-4.15.18, FR-4.15.17 |
| Copy edit history; proposal-to-report link; feed to analytics | FR-4.16.12, FR-4.16.13, FR-4.15.21 |
| Awards workflow and certificates | FR-4.12.7, FR-4.12.8 |
| Story drafting; scheduled publishing; version history | FR-4.13.12–FR-4.13.14 |
| Knowledge Center editing, file versions, training tracking | FR-4.14.6–FR-4.14.8 |
| Campus sustainability map | FR-4.1.16 |

**Release 4: complete governance and connections**

| Item | Requirement |
|---|---|
| Retention enforcement; data lineage | FR-4.23.6, FR-4.23.7 |
| Data subject tools and self-service; breach notification support | FR-4.25.5, FR-4.5.9, FR-4.25.8 |
| Scheduled access reviews; expiry notices; inactivity action; bulk invitations | FR-4.25.3, FR-4.21.10, FR-4.21.9, FR-4.21.2 |
| Key rotation; audit verification and archive | FR-4.25.9, FR-4.26.5, FR-4.26.6 |
| Complete backup coverage and drills | FR-4.28.6, FR-4.28.7 |
| Overdue requests; named approvers | FR-4.24.5, FR-4.24.6 |
| Reference data management | FR-4.27.11 |
| Reputation survey contacts | FR-4.30.1–FR-4.30.5 |
| External data connections | FR-4.31.1–FR-4.31.5 |
| Digests; reports on a schedule; report-to-publication link; guided tours | FR-4.18.4, FR-4.17.7, FR-4.17.6, FR-4.19.10 |
