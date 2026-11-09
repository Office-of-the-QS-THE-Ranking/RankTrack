# UST Rankings and Impact Hub: Use Case Narratives

**System:** UST Rankings and Impact Hub (repository: RankTrack), for the Office of QS/THE Rankings, University of Santo Tomas.

**Basis:** Source code and project documents as of 2 November 2026, including the analytics engine, which is not yet committed to Git. Behaviour on the deployed site was not separately observed. Requirement IDs (FR-…) refer to [the system features section of the SRS](srs-system-features.md).

**Contents:** 179 use cases. Each one follows the same form: actors, goal, preconditions, main flow, alternative flows, exceptions, postconditions and the requirements it traces to. Permissions are written as `module: action`.

---

## 1. Actors

| Actor | Description | What they hold by default |
|---|---|---|
| Public visitor | Reads the public website. | No account. |
| Applicant | Requests an account and tracks the decision. | No account until approved. |
| Office Administrator | An Administrator with University-wide scope in the Rankings Office. Runs the Hub, reviews and approves. | Every permission except filing contributions: no `evidence`, `data` or `stories` create, edit, delete or submit, and no `posts: submit` or `forms: submit`. |
| Unit Administrator | An Administrator of one office or college. | Read-only: `units`, `reports`, `forms`, `evidence`, `data` and `stories` view and export; `knowledge: view`. |
| Coordinator | Files evidence, data and publications for a unit, and runs its forms. | `evidence`, `data`, `stories` and `posts` work for the unit; `forms` except submit; `units: view`; `reports` view and export; `knowledge: view`. |
| Student Organizer | The Secretary of a student organization, commission or council. Belongs to no unit. | `forms` view, create, edit, delete, submit and export, on their own forms and copies only. |
| External guest | A temporary, read-only partner account. | `knowledge: view` and `reports: view`, plus any dataset approved for them. |
| Form respondent | Answers a form through its link. | No account needed. |
| Team copy collaborator | Edits a team copy through its link. | No account needed. Private copies need a recognized Google or Hub identity. |
| Any signed-in user | Shorthand for use cases every signed-in role shares. | Whatever the active role holds. |
| System automation | The daily scheduled job and automatic housekeeping. | Acts as the Hub itself. |

**Supporting system:** Google authenticates every sign-in and proves University email ownership. Hub roles can be changed in Roles & Permissions, so the defaults above can differ on a live system.

---

## 2. Rules common to every use case

These apply throughout and are not repeated in each narrative.

| # | Rule |
|---|---|
| CR-1 | **Session.** Every page and command re-checks the session. A person whose session has ended goes to `/signin`, and an unsaved action reports "Your session has ended". |
| CR-2 | **Authorization.** The server checks role, action and scope on every page and command. Hidden navigation is not the control. A page reached by address shows "Not part of your role". A refused command returns its reason and is audited as Denied. Only the active role's permissions count. |
| CR-3 | **Feedback.** Every outcome is a toast at the top right that closes after 8 seconds. A field that fails its check shows a red edge, a shake and a warning triangle, and the first failing field gets focus. When a check fails, nothing is saved. |
| CR-4 | **Audit.** Every governed change, sign-in and export is written to the hash-chained audit trail. Ordinary invalid input is not. |
| CR-5 | **Rate limits.** Per account per minute: 120 commands, 30 uploads, 10 exports. Over the limit, the action is refused with a request to try again shortly. |
| CR-6 | **Feature switches.** A switched-off feature shows "switched off" in a workspace and Not Found on the public site. |
| CR-7 | **Changed data.** An item removed since the page loaded returns "no longer here", with a request to reload. |
| CR-8 | **Approval fallback.** A workflow change applies directly when its workflow is off or too few other approvers exist, and the audit entry says so. This never applies to destructive backup operations, or to a unit's item waiting on the Office's first review. |
| CR-9 | **Notifications.** All notifications are in-app. The Hub sends no email today. |

---

## 3. Index of use cases

**A. Public website**

| ID | Use case | Actors |
|---|---|---|
| UC-001 | View the home page | Public visitor |
| UC-002 | Browse rankings and open one ranking | Public visitor |
| UC-003 | Read Stories & News | Public visitor |
| UC-004 | Read a research article or report | Public visitor |
| UC-005 | View the public Recognition page | Public visitor |
| UC-006 | Consult the public Knowledge Center | Public visitor |
| UC-007 | Read the Office and policy pages | Public visitor |
| UC-008 | Search the public site | Public visitor |
| UC-009 | See a site notice | Public visitor, Any signed-in user |

**B. Access, sign-in and sessions**

| ID | Use case | Actors |
|---|---|---|
| UC-010 | Request access as a Thomasian | Applicant, with Google as a supporting system |
| UC-011 | Request access as an external partner | Applicant |
| UC-012 | Verify a UST email through Google | Applicant, with Google as a supporting system |
| UC-013 | Track an access request | Applicant |
| UC-014 | Sign in with Google | Office Administrator, Unit Administrator, Coordinator, Student Organizer, External guest, with Google as a supporting system |
| UC-015 | Create the first Administrator | Office Administrator, System automation |
| UC-016 | Stay signed in or time out | Any signed-in user, System automation |
| UC-017 | Sign out | Any signed-in user |
| UC-018 | Switch the active role | Any signed-in user holding more than one assignment |
| UC-019 | Move between a workspace and the public site | Office Administrator, Unit Administrator, Coordinator, Student Organizer, External guest |

**C. Personal account window**

| ID | Use case | Actors |
|---|---|---|
| UC-020 | View my overview, activity and logs | Any signed-in user |
| UC-021 | Edit my profile | Any signed-in user |
| UC-022 | Set my session preferences | Any signed-in user |
| UC-023 | Manage my signed-in devices | Any signed-in user |
| UC-024 | Set my notification preferences | Any signed-in user |
| UC-025 | Export my data | Any signed-in user |
| UC-026 | Read language and support information | Any signed-in user |

**D. Dashboards, notifications and search**

| ID | Use case | Actors |
|---|---|---|
| UC-027 | Monitor the University on the executive dashboard | Office Administrator |
| UC-028 | Monitor my unit on its dashboard | Coordinator, Unit Administrator |
| UC-029 | See what is waiting in the Student Portal | Student Organizer |
| UC-030 | View resources shared with a guest | External guest |
| UC-031 | Receive and follow a notification | Any signed-in user, System automation |
| UC-032 | Search inside a workspace | Office Administrator, Unit Administrator, Coordinator, Student Organizer, External guest |

**E. Rankings and deadlines**

| ID | Use case | Actors |
|---|---|---|
| UC-033 | Review a ranking in the workspace | Office Administrator |
| UC-034 | Read a ranking's indicator diagnostic | Office Administrator |
| UC-035 | Set a ranking's dates by hand | Office Administrator |
| UC-036 | Run the deadline check now | Office Administrator |
| UC-037 | Apply or dismiss a date finding | Office Administrator |

**F. Analytics engine**

| ID | Use case | Actors |
|---|---|---|
| UC-038 | Read an edition's scorecard | Office Administrator |
| UC-039 | Manage a methodology edition | Office Administrator |
| UC-040 | Start another year's edition | Office Administrator |
| UC-041 | Import or export a methodology pack | Office Administrator |
| UC-042 | Edit an indicator | Office Administrator |
| UC-043 | Enter the University's figure | Office Administrator |
| UC-044 | Review a unit's value | Office Administrator |
| UC-045 | Link evidence to an indicator | Office Administrator, Coordinator |
| UC-046 | Assess an evidence link | Office Administrator |
| UC-047 | Work through an edition's data checks | Office Administrator |
| UC-048 | Send a data request to units | Office Administrator |
| UC-049 | Track and manage a data request | Office Administrator |
| UC-050 | Answer a data request for my unit | Coordinator |
| UC-051 | Correct a value the Office returned | Coordinator |
| UC-052 | Read my unit's data requests | Unit Administrator |
| UC-053 | Keep the activity register | Office Administrator, Coordinator |
| UC-054 | Import an activity register file | Office Administrator |
| UC-055 | Enter a WURI innovation case | Office Administrator |
| UC-056 | Score a WURI case on its rubric | Office Administrator |
| UC-057 | Maintain peers and benchmark figures | Office Administrator |
| UC-058 | Import benchmark tables | Office Administrator |
| UC-059 | Import counts from a personal-data file | Office Administrator |
| UC-060 | Manage template profiles | Office Administrator |
| UC-061 | Import a unit's THE data-collection workbook | Office Administrator |
| UC-062 | Import WURI case documents | Office Administrator |
| UC-063 | Read GreenMetric evidence documents | Office Administrator |
| UC-064 | Map names in files to Directory units | Office Administrator |
| UC-065 | Read the import log | Office Administrator |
| UC-066 | Track improvement actions | Office Administrator |
| UC-067 | Take a snapshot of an edition | Office Administrator |
| UC-068 | Export analytics | Office Administrator |

**G. Evidence contributions**

| ID | Use case | Actors |
|---|---|---|
| UC-069 | Submit evidence for my unit | Coordinator |
| UC-070 | Read my unit's submissions | Coordinator, Unit Administrator |
| UC-071 | Work the validation queue | Office Administrator |
| UC-072 | Accept evidence | Office Administrator |
| UC-073 | Request a revision | Office Administrator |
| UC-074 | Change a record's ranking indicators | Office Administrator |
| UC-075 | Respond to a revision and resubmit | Coordinator |
| UC-076 | Ask the Office for assistance | Coordinator |
| UC-077 | Request temporary data access | External guest, Office Administrator |

**H. Units and recognition**

| ID | Use case | Actors |
|---|---|---|
| UC-078 | Compare units | Office Administrator |
| UC-079 | View a unit profile | Office Administrator |
| UC-080 | View the Recognition wall | Office Administrator |

**I. Publications**

| ID | Use case | Actors |
|---|---|---|
| UC-081 | Compose a post | Office Administrator, Coordinator |
| UC-082 | Publish an Office post | Office Administrator |
| UC-083 | Send a unit post to the Rankings Office | Coordinator |
| UC-084 | Move a unit's waiting item back to drafts | Coordinator |
| UC-085 | Review a unit's post or document | Office Administrator |
| UC-086 | Catalogue a research article or report | Office Administrator, Coordinator |
| UC-087 | Publish or send a document | Office Administrator, Coordinator |
| UC-088 | Unpublish an item | Office Administrator |
| UC-089 | Delete a post or document | Office Administrator, Coordinator |
| UC-090 | Read a post's audience | Office Administrator, Coordinator |

**J. Workspace and Knowledge Center**

| ID | Use case | Actors |
|---|---|---|
| UC-091 | Upload files and create folders | Office Administrator, Coordinator |
| UC-092 | Browse and download shared files | Office Administrator, Unit Administrator, Coordinator |
| UC-093 | Rename or move files and folders | Office Administrator, Coordinator |
| UC-094 | Archive, restore or delete files | Office Administrator, Coordinator |
| UC-095 | Track a working document as a link | Office Administrator, Coordinator |
| UC-096 | Use the Knowledge Center inside a workspace | Office Administrator, Unit Administrator, Coordinator, External guest |

**K. Digital Forms**

| ID | Use case | Actors |
|---|---|---|
| UC-097 | Build a form | Office Administrator, Coordinator, Student Organizer |
| UC-098 | Open, close or reopen a form | Office Administrator, Coordinator, Student Organizer |
| UC-099 | Change a form's details or questions | Office Administrator, Coordinator, Student Organizer |
| UC-100 | Duplicate or delete a form | Office Administrator, Coordinator, Student Organizer |
| UC-101 | Publish a form to the Student Portal | Office Administrator, Coordinator |
| UC-102 | Answer a form through its link | Form respondent |
| UC-103 | Open the base link of a copy-based form | Form respondent, Office Administrator |
| UC-104 | Look up a person while answering | Form respondent, Team copy collaborator, with Google as a supporting system |
| UC-105 | Record a sign-off on a response | Office Administrator, Coordinator |
| UC-106 | Fill in office-only fields on a response | Office Administrator, Coordinator |
| UC-107 | Read responses and analytics | Office Administrator, Unit Administrator, Coordinator, Student Organizer |
| UC-108 | Export responses as CSV | Office Administrator, Unit Administrator, Coordinator, Student Organizer |
| UC-109 | Remove responses | Office Administrator, Coordinator |

**L. Student Portal and team copies**

| ID | Use case | Actors |
|---|---|---|
| UC-110 | Answer an assigned survey | Student Organizer |
| UC-111 | Build a team copy | Student Organizer |
| UC-112 | Fill in a team copy together | Team copy collaborator, Student Organizer |
| UC-113 | Enter a private copy, or ask for access | Team copy collaborator, with Google as a supporting system |
| UC-114 | Answer a request for access to my copy | Student Organizer |
| UC-115 | Rename a copy or change its sharing | Student Organizer |
| UC-116 | Replace a copy's link | Student Organizer |
| UC-117 | Send a team copy | Team copy collaborator, Student Organizer |
| UC-118 | Track a sent copy | Team copy collaborator, Student Organizer |
| UC-119 | Run my own evaluation or registration form | Student Organizer |

**M. Reports**

| ID | Use case | Actors |
|---|---|---|
| UC-120 | Build a report | Office Administrator |
| UC-121 | Export a report as CSV | Office Administrator |
| UC-122 | Print a report or save it as PDF | Office Administrator |
| UC-123 | Request a report's release | Office Administrator |

**N. Administration: overview and accounts**

| ID | Use case | Actors |
|---|---|---|
| UC-124 | Check the Administration overview | Office Administrator |
| UC-125 | Invite an account | Office Administrator |
| UC-126 | Re-send or cancel an invitation | Office Administrator |
| UC-127 | Suspend, reactivate or deactivate an account | Office Administrator |
| UC-128 | Update an account's details | Office Administrator |
| UC-129 | Transfer an account to another unit | Office Administrator |
| UC-130 | End an account's sessions or force re-authentication | Office Administrator |
| UC-131 | Add a role to an account | Office Administrator |
| UC-132 | Remove a role from an account | Office Administrator |
| UC-133 | Review inactive accounts | Office Administrator |
| UC-134 | Look at access requests with domain evidence | Office Administrator |

**O. Administration: roles and directory**

| ID | Use case | Actors |
|---|---|---|
| UC-135 | Review or change what a role may do | Office Administrator |
| UC-136 | Create a unit | Office Administrator |
| UC-137 | Update a unit's details and logo | Office Administrator |
| UC-138 | Designate a unit's coordinators | Office Administrator |
| UC-139 | Move a unit in the hierarchy | Office Administrator |
| UC-140 | Archive or reactivate a unit | Office Administrator |
| UC-141 | Merge one unit into another | Office Administrator |

**P. Administration: data governance**

| ID | Use case | Actors |
|---|---|---|
| UC-142 | Update a dataset's governance details | Office Administrator |
| UC-143 | Add a dataset version note | Office Administrator |
| UC-144 | Run data quality rules | Office Administrator |
| UC-145 | Resolve likely duplicate evidence | Office Administrator |
| UC-146 | Maintain the data dictionary | Office Administrator |
| UC-147 | Run a retention review | Office Administrator |

**Q. Administration: approval workflows**

| ID | Use case | Actors |
|---|---|---|
| UC-148 | Configure an approval workflow | Office Administrator |
| UC-149 | Open an approval request | Office Administrator |
| UC-150 | Decide an approval request | Office Administrator |
| UC-151 | Withdraw a pending request | Office Administrator |

**R. Administration: privacy, security and audit**

| ID | Use case | Actors |
|---|---|---|
| UC-152 | Change a security policy | Office Administrator |
| UC-153 | Run an access review | Office Administrator |
| UC-154 | Record a privacy assessment | Office Administrator |
| UC-155 | Handle a data subject request | Office Administrator |
| UC-156 | Acknowledge or resolve a security alert | Office Administrator |
| UC-157 | Report and manage an incident | Office Administrator |
| UC-158 | Record a key rotation | Office Administrator |
| UC-159 | Search the audit trail | Office Administrator |
| UC-160 | Verify the audit chain | Office Administrator |
| UC-161 | Export audit entries | Office Administrator |

**S. Administration: system configuration**

| ID | Use case | Actors |
|---|---|---|
| UC-162 | Manage ranking bodies and tracked rankings | Office Administrator |
| UC-163 | Manage cycles and academic years | Office Administrator |
| UC-164 | Manage reporting periods | Office Administrator |
| UC-165 | Set upload limits | Office Administrator |
| UC-166 | Edit notification templates | Office Administrator |
| UC-167 | Set dashboard defaults | Office Administrator |
| UC-168 | Switch features and staged flags | Office Administrator |
| UC-169 | Set the site notice | Office Administrator |

**T. Administration: backup and recovery**

| ID | Use case | Actors |
|---|---|---|
| UC-170 | Run a backup | Office Administrator |
| UC-171 | Verify a recovery point | Office Administrator |
| UC-172 | Set backup retention | Office Administrator |
| UC-173 | Restore from or delete a recovery point | Office Administrator |

**U. System automation**

| ID | Use case | Actors |
|---|---|---|
| UC-174 | Check deadline sources daily | System automation |
| UC-175 | Send data request reminders and escalations | System automation |
| UC-176 | Take weekly snapshots | System automation |
| UC-177 | Run housekeeping before a change | System automation |
| UC-178 | Count a post's anonymous views | System automation |
| UC-179 | Serve a stored file by its rule | System automation, Public visitor, Any signed-in user |


### Use cases by actor

| Actor | Use cases |
|---|---|
| Public visitor | 001, 002, 003, 004, 005, 006, 007, 008, 009, 179 |
| Applicant | 010, 011, 012, 013 |
| Office Administrator | 014, 015, 019, 027, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 045, 046, 047, 048, 049, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065, 066, 067, 068, 071, 072, 073, 074, 077, 078, 079, 080, 081, 082, 085, 086, 087, 088, 089, 090, 091, 092, 093, 094, 095, 096, 097, 098, 099, 100, 101, 103, 105, 106, 107, 108, 109, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173 |
| Unit Administrator | 014, 019, 028, 032, 052, 070, 092, 096, 107, 108 |
| Coordinator | 014, 019, 028, 032, 045, 050, 051, 053, 069, 070, 075, 076, 081, 083, 084, 086, 087, 089, 090, 091, 092, 093, 094, 095, 096, 097, 098, 099, 100, 101, 105, 106, 107, 108, 109 |
| Student Organizer | 014, 019, 029, 032, 097, 098, 099, 100, 107, 108, 110, 111, 112, 114, 115, 116, 117, 118, 119 |
| External guest | 014, 019, 030, 032, 077, 096 |
| Form respondent | 102, 103, 104 |
| Team copy collaborator | 104, 112, 113, 117, 118 |
| Any signed-in user | 009, 016, 017, 018, 020, 021, 022, 023, 024, 025, 026, 031, 179 |
| System automation | 015, 016, 031, 174, 175, 176, 177, 178, 179 |

---

# Narratives

## A. Public website

### UC-001 — View the home page

**Actors:** Public visitor

**Goal:** See the University's ranking position and the Office's work in one place.

**Preconditions:** None. No account is needed.

**Main flow:**

1. The visitor opens the site's home page.
2. The system assembles the hero, biggest ranking movers, ranking menu, where each contribution counts, the process overview, story folders, the top 10 units serving the most rankings and the Office panel.
3. The visitor reads the page and follows a link to a ranking, story or section.

**Alternative flows:**

- A1. No public data exists yet: each section shows its empty layout in place of figures.

**Postconditions:** Nothing changes. The visitor has seen only rankings that are tracked, marked public and backed by a results dataset classified Public.

**Traces to:** FR-4.1.1

### UC-002 — Browse rankings and open one ranking

**Actors:** Public visitor

**Goal:** Understand how UST performs in a ranking.

**Preconditions:** At least one ranking is tracked and public.

**Main flow:**

1. The visitor opens Rankings and sees rankings grouped by body (THE, QS, UI GreenMetric, WURI).
2. The visitor chooses a ranking.
3. The system shows its result, trajectory, explanatory context and calendar dates.
4. The visitor moves to another ranking or section.

**Alternative flows:**

- A1. A figure is missing: it stays blank and is never estimated.

**Exceptions:**

- E1. The ranking is not in the public set: it is not offered.

**Postconditions:** Nothing changes. No internal evidence is exposed.

**Traces to:** FR-4.1.2

### UC-003 — Read Stories & News

**Actors:** Public visitor

**Goal:** Find and read a published story.

**Preconditions:** The `public-publications` feature is on and the stories dataset is classified Public.

**Main flow:**

1. The visitor opens Publications, then Stories & News.
2. The system lists published stories as a newsroom: lead, latest and archive.
3. The visitor filters by theme or SDG, or searches.
4. The visitor opens a story, and the system shows it in the layout its editor chose.
5. The system counts the view once the article is actually visible (UC-178).

**Exceptions:**

- E1. The feature is off: the page returns Not Found.

**Postconditions:** The visitor has read the story. One anonymous view may be counted.

**Traces to:** FR-4.1.3, FR-4.1.8

### UC-004 — Read a research article or report

**Actors:** Public visitor

**Goal:** Read, download or cite a published document.

**Preconditions:** The `public-publications` feature is on and the document is published.

**Main flow:**

1. The visitor opens Research Articles or Reports & Insights.
2. The visitor searches or filters, then opens an item.
3. The system shows its metadata and abstract, its DOI or source link, its PDF if there is one, and citation support.
4. The visitor reads it, follows the source, downloads the PDF or copies a citation.

**Alternative flows:**

- A1. The document has no local PDF: the visitor follows its DOI or link.

**Exceptions:**

- E1. The document is unpublished: it does not appear, and its PDF cannot be downloaded.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.1.3, FR-4.24.4

### UC-005 — View the public Recognition page

**Actors:** Public visitor

**Goal:** See which units have contributed.

**Preconditions:** The `public-recognition` feature is on.

**Main flow:**

1. The visitor opens Recognition.
2. The system summarizes contributing units and available achievements from validated data.
3. The visitor reads the page.

**Alternative flows:**

- A1. A category has no data: it is omitted or shows no results.

**Exceptions:**

- E1. The feature is off: the page returns Not Found.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.1.4

### UC-006 — Consult the public Knowledge Center

**Actors:** Public visitor

**Goal:** Find a methodology, definition, template or deadline.

**Preconditions:** The `public-knowledge` feature is on.

**Main flow:**

1. The visitor opens Knowledge Center and chooses a section.
2. The visitor searches where search is offered.
3. The system shows the matching reference data and the deadline calendar.
4. The visitor reads the content or follows a resource.

**Exceptions:**

- E1. The feature is off: the page returns Not Found.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.1.5

### UC-007 — Read the Office and policy pages

**Actors:** Public visitor

**Goal:** Learn about the Office, or read its Privacy, Terms of Use and Cookies pages.

**Preconditions:** None.

**Main flow:**

1. The visitor opens About the Office, or a policy page from the footer.
2. The system shows the content, with Office contact data and the configured privacy contact.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.1.6

### UC-008 — Search the public site

**Actors:** Public visitor

**Goal:** Jump to public content without browsing.

**Preconditions:** None.

**Main flow:**

1. The visitor opens the search window and types a query.
2. The system ranks matches across public rankings, published stories, active units and dictionary terms, grouped by type.
3. The visitor moves through the results by keyboard or pointer and opens one.

**Alternative flows:**

- A1. Nothing matches: the window shows no results.

**Postconditions:** Nothing changes. The public index holds no evidence, notices, requirements or internal data.

**Traces to:** FR-4.1.7

### UC-009 — See a site notice

**Actors:** Public visitor, Any signed-in user

**Goal:** Learn of something the Office has announced.

**Preconditions:** An administrator has switched a notice on (UC-169).

**Main flow:**

1. The person opens any public or workspace page.
2. The system shows the notice as a banner.

**Postconditions:** Nothing changes. The banner stays until the Office switches it off.

**Traces to:** FR-4.1.9, FR-4.22.8

## B. Access, sign-in and sessions

### UC-010 — Request access as a Thomasian

**Actors:** Applicant, with Google as a supporting system

**Goal:** Apply for a Hub account with a University affiliation.

**Preconditions:** The applicant has no account and no pending request.

**Main flow:**

1. On Sign in, the applicant chooses Request access.
2. In Profile, the applicant enters name parts in capitals, salutation, birthday and email.
3. In Affiliation, the applicant chooses University of Santo Tomas, then a role. An Administrator or Coordinator also chooses University Office or College/Faculty and a listed unit. A Student Organizer names their organization.
4. The applicant proves ownership of the UST email (UC-012).
5. In Declarations, the applicant accepts the statements and submits.
6. The system opens an account-access approval request and shows a receipt with reference RQ-####, a timestamp, a 3 to 5 working day review time and a tracker link.

**Alternative flows:**

- A1. The applicant is a Student Organizer: the request is kept with the Office, not under any college or office.

**Exceptions:**

- E1. A field fails its rule (for example a birthday under 15 years ago): the field is flagged and nothing is sent.
- E2. The email already has an account or pending request: the request is refused.
- E3. The email was not proved through Google, or a UST email is used with an outside affiliation: the request is refused.
- E4. Over 5 requests per network per hour, 60 overall per hour or 200 pending, or the rate counter cannot be reached: nothing is sent.

**Postconditions:** A pending request awaits a decision (UC-150). No account or session exists yet. No receipt email is sent.

**Traces to:** FR-4.2.5, FR-4.2.6

### UC-011 — Request access as an external partner

**Actors:** Applicant

**Goal:** Apply for temporary guest access from outside the University.

**Preconditions:** The applicant has no account and no pending request.

**Main flow:**

1. On Sign in, the applicant chooses Request access and fills in Profile.
2. In Affiliation, the applicant chooses an outside affiliation and gives the organization and, where asked, its website.
3. The applicant accepts the Declarations and submits.
4. The system places the applicant with the Office as a guest, opens an account-access request and shows the receipt.

**Exceptions:**

- E1. The email is on a UST domain: the system refuses it with an outside affiliation.
- E2. The website is not a plain `https` address of 200 characters or fewer: the field is flagged.
- E3. Rate limits or duplicates apply as in UC-010.

**Postconditions:** A pending request exists. If approved, external access ends 90 days after approval. Approval is refused while guest sign-in is switched off.

**Traces to:** FR-4.2.5, FR-4.16.5

### UC-012 — Verify a UST email through Google

**Actors:** Applicant, with Google as a supporting system

**Goal:** Prove the applicant owns the University address typed on the request.

**Preconditions:** The applicant has typed an email on an allowed domain in the request form.

**Main flow:**

1. The applicant starts verification.
2. The system sends them to Google for that address and Workspace, keeping the form's answers in the browser tab.
3. The applicant chooses the account at Google.
4. The system checks the result, sets a signed proof cookie and shows "verified".

**Alternative flows:**

- A1. The applicant cancels at Google: the result is "cancelled" and the form is intact.

**Exceptions:**

- E1. The account is not UST ("not-ust"), is a different address ("other-account"), or the proof has run out ("expired"): the email stays unverified.
- E2. Over 20 verifications per network per hour ("busy"), or the check is unreachable ("unavailable"): the applicant tries later.

**Postconditions:** The request form can be submitted with that address. Verification alone grants no account or session.

**Traces to:** FR-4.2.6

### UC-013 — Track an access request

**Actors:** Applicant

**Goal:** See where a request stands without an account.

**Preconditions:** The applicant has a reference code and the email used.

**Main flow:**

1. On Sign in, the applicant opens the Submission Tracker, or follows the tracker link on the receipt.
2. The applicant enters the reference and email.
3. The system shows four stages (received, under review, decision, first sign-in) and a status: Under review, Approved, Signed in, Not approved or Withdrawn.
4. While the request is open, the system keeps polling and updates the stages.

**Alternative flows:**

- A1. The request was rejected: the status is Not approved and the rejection note appears.
- A2. The reference is typed loosely, such as `rq-4`: the system still reads it.

**Exceptions:**

- E1. Either value does not match: a single message that never says which one was wrong.
- E2. Over 20 failed lookups per network per hour: further lookups are refused.

**Postconditions:** Nothing changes. The applicant never sees who decided.

**Traces to:** FR-4.2.7

### UC-014 — Sign in with Google

**Actors:** Office Administrator, Unit Administrator, Coordinator, Student Organizer, External guest, with Google as a supporting system

**Goal:** Reach the workspace of the active role.

**Preconditions:** The person has a Google account.

**Main flow:**

1. On Sign in, the person chooses Sign in via Institution Account, optionally ticking Keep me signed in.
2. Google authenticates them and returns to the Hub.
3. The system checks, in order: University domain proof, registration, account status, allowed domain or guest policy, active role.
4. The system creates a Hub session. A Pending Invitation account becomes Active at this first sign-in.
5. The system audits the attempt and redirects to the active role's workspace: Office for a University-wide Administrator, Portal for everyone else, or the requested return path under `/admin` or `/portal`.

**Alternative flows:**

- A1. An external account signs in from a new device: the sign-in goes ahead and the system raises a security alert.

**Exceptions:**

- E1. Not registered or pending approval: refused, and the temporary sign-in identity is removed.
- E2. Suspended or deactivated: refused with that reason.
- E3. A University-domain address from a personal Google account, or a domain outside the allowed list: refused.
- E4. A guest while guest sign-in is off, or an account with no active role: refused.

**Postconditions:** On success, an active session exists whose cookie holds a random token; only its SHA-256 is stored. Every attempt is audited.

**Traces to:** FR-4.2.1, FR-4.2.3

### UC-015 — Create the first Administrator

**Actors:** Office Administrator, System automation

**Goal:** Recover control of the Hub when nobody can run it.

**Preconditions:** The address in `HUB_BOOTSTRAP_ADMIN` is configured and no active University-wide Administrator exists.

**Main flow:**

1. The configured person signs in with Google.
2. The system creates the account, or restores the existing one, with the Administrator role active.
3. The system audits the action and opens the Office workspace.

**Exceptions:**

- E1. An active University-wide Administrator exists: this does nothing, and the normal sign-in rules apply.

**Postconditions:** The Hub has a working Administrator.

**Traces to:** FR-4.2.2

### UC-016 — Stay signed in or time out

**Actors:** Any signed-in user, System automation

**Goal:** Keep an active session alive and end an idle one.

**Preconditions:** The person has a session.

**Main flow:**

1. While the person is active, heartbeats keep the session alive.
2. Before the idle limit, the system warns the person (default 2 minutes before a 30-minute limit).
3. The person continues working, and the session carries on.

**Alternative flows:**

- A1. The person does nothing: the system signs them out, removes the session, audits it and shows the reason on `/signin`.
- A2. The absolute limit is reached (default 12 hours): the session ends whatever the activity.
- A3. An administrator suspended the account, revoked its sessions or forced re-authentication: this takes effect on the next request.

**Postconditions:** The session is either still valid or removed.

**Traces to:** FR-4.2.3

### UC-017 — Sign out

**Actors:** Any signed-in user

**Goal:** End the current session.

**Preconditions:** The person is signed in.

**Main flow:**

1. The person chooses Sign out.
2. The system removes the session, clears the Hub cookies and the form identity cookie, and audits the time in use.
3. The system redirects to `/signin`, shows a toast and removes the URL parameter.

**Alternative flows:**

- A1. The person chooses "clear cookies and sign out" in the account window: the same result, for this browser's cookies as well.

**Postconditions:** The session no longer exists.

**Traces to:** FR-4.2.4

### UC-018 — Switch the active role

**Actors:** Any signed-in user holding more than one assignment

**Goal:** Act in another role.

**Preconditions:** The person holds more than one unexpired assignment.

**Main flow:**

1. In the account window, the person opens Roles & access and chooses Switch on another role.
2. The system sets the active assignment and recomputes permissions and landing page.
3. The system shows a toast, audits the switch and redirects to that role's workspace.

**Exceptions:**

- E1. The assignment is not theirs or has expired: refused.

**Postconditions:** Only the active role's permissions apply to later actions.

**Traces to:** FR-4.3.2

### UC-019 — Move between a workspace and the public site

**Actors:** Office Administrator, Unit Administrator, Coordinator, Student Organizer, External guest

**Goal:** Compare what is inside with what the public sees.

**Preconditions:** The person is signed in.

**Main flow:**

1. The person uses the Public/Internal view switch.
2. The system opens the equivalent page on the other side, for example `/admin/rankings/<slug>` and `/rankings/<slug>`, or the home page when there is no equivalent.

**Postconditions:** Nothing changes. Permission still governs what opens inside.

**Traces to:** FR-4.3.1

## C. Personal account window

### UC-020 — View my overview, activity and logs

**Actors:** Any signed-in user

**Goal:** See what I have done in the Hub.

**Preconditions:** The person is signed in.

**Main flow:**

1. The person opens the account window from the sidebar profile.
2. Overview shows activity statistics, badges and activity by day, counted from their audit entries.
3. The person opens Logs to read their own recent audit entries.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.4.1, FR-4.4.5

### UC-021 — Edit my profile

**Actors:** Any signed-in user

**Goal:** Correct my name or position.

**Preconditions:** The account is Active.

**Main flow:**

1. In Edit profile, the person changes their full name or position and saves.
2. The system validates, saves, audits and shows a toast.

**Exceptions:**

- E1. A name outside 3 to 160 characters, or a position over 160: the field is flagged.

**Postconditions:** The profile is updated. Access fields cannot be changed this way.

**Traces to:** FR-4.4.2

### UC-022 — Set my session preferences

**Actors:** Any signed-in user

**Goal:** Shorten idle sign-out, or stay signed in.

**Preconditions:** The person is signed in.

**Main flow:**

1. In Sign-in & security, the person chooses idle minutes (or none) and whether to stay signed in, then saves.
2. The system validates, stores and audits the choice.

**Exceptions:**

- E1. Idle minutes are not a whole number from 5 to the policy limit: refused.

**Postconditions:** Session behaviour follows the preference. The absolute session limit remains the policy's.

**Traces to:** FR-4.4.3

### UC-023 — Manage my signed-in devices

**Actors:** Any signed-in user

**Goal:** End sessions I no longer trust.

**Preconditions:** The person is signed in.

**Main flow:**

1. In Devices, the person sees their active sessions.
2. The person ends one session, or all others.
3. The system ends them, audits this, updates the list and shows a toast.

**Exceptions:**

- E1. The session belongs to someone else: refused.

**Postconditions:** The chosen sessions are gone. The current session uses Sign out instead (UC-017).

**Traces to:** FR-4.4.4

### UC-024 — Set my notification preferences

**Actors:** Any signed-in user

**Goal:** Choose which notices I receive.

**Preconditions:** The person is signed in.

**Main flow:**

1. In Notifications, the person switches each kind on or off for the Hub and Email channels.
2. The system saves and audits the choice, and the bell hides kinds switched off for the Hub.

**Exceptions:**

- E1. An unknown kind is refused. "Account and security" stays on.

**Postconditions:** The preferences are stored. Email choices have no effect yet, because the Hub sends no email.

**Traces to:** FR-4.4.6

### UC-025 — Export my data

**Actors:** Any signed-in user

**Goal:** Download what the Hub holds about me.

**Preconditions:** A valid session.

**Main flow:**

1. In Data & privacy, the person requests the export.
2. The system gathers account details, roles, sessions, notifications and up to 5,000 activity entries, and audits the export.
3. The browser downloads `hub-data-<date>.json`.

**Exceptions:**

- E1. Rate limit reached: refused, to try again shortly.

**Postconditions:** The person has the file. The export is on the audit trail.

**Traces to:** FR-4.4.7

### UC-026 — Read language and support information

**Actors:** Any signed-in user

**Goal:** Find conventions, contacts and shortcuts.

**Preconditions:** The person is signed in.

**Main flow:**

1. The person opens Language or Support in the account window.
2. The system shows the conventions (English, Manila time, day-month-year dates), Office contacts, help links and keyboard shortcuts.

**Postconditions:** Nothing changes. No language switching is offered.

**Traces to:** FR-4.4.8

## D. Dashboards, notifications and search

### UC-027 — Monitor the University on the executive dashboard

**Actors:** Office Administrator

**Goal:** See workload, readiness and deadlines, and decide what to do next.

**Preconditions:** `dashboard: view`, held by University-wide Administrators.

**Main flow:**

1. The administrator opens Dashboard, which starts on Submissions.
2. The system shows the welcome tile, readiness, the next deadline, units engaged, open data requests, readiness by ranking and open action items.
3. The administrator switches between Submissions and Recognition.
4. The administrator follows a tile to the page that holds its detail: Rankings, a ranking's Action plan, Data requests, Units or Contributions.

**Alternative flows:**

- A1. `recognition-internal` is off: the Recognition view is not available.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.5.1

### UC-028 — Monitor my unit on its dashboard

**Actors:** Coordinator, Unit Administrator

**Goal:** See my unit's progress and next task.

**Preconditions:** The person holds a role scoped to a unit, and it is their active role.

**Main flow:**

1. The person opens My dashboard.
2. The system computes submission readiness, standing among comparable units, the season's honours, submission flow, and the rankings and SDGs served by validated evidence.
3. The person follows a tile to their next task.

**Alternative flows:**

- A1. A Unit Administrator: the same view, without actions that contribute.

**Postconditions:** Nothing changes. Data is limited to the person's unit scope.

**Traces to:** FR-4.5.2

### UC-029 — See what is waiting in the Student Portal

**Actors:** Student Organizer

**Goal:** See what needs my attention.

**Preconditions:** Student Organizer is the active role.

**Main flow:**

1. The Student Organizer opens My dashboard.
2. The system lists returned copies, assignments to answer and proposals in progress, then tiles per page and recently edited copies.
3. The Student Organizer opens an item.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.5.3

### UC-030 — View resources shared with a guest

**Actors:** External guest

**Goal:** See what the Office has approved for my engagement.

**Preconditions:** External is the active role and has not expired.

**Main flow:**

1. The guest signs in and lands on Shared with you.
2. The system shows approved datasets with their access and end dates, published reports, and when the guest's access ends.
3. The guest reads them, or asks for more (UC-077).

**Alternative flows:**

- A1. Guest downloads are switched off: a note says the resources can be read but not exported.
- A2. Nothing is shared yet: an empty state says so.

**Postconditions:** Nothing changes. Access ends automatically on the end date (UC-177).

**Traces to:** FR-4.9.5, FR-4.3.4

### UC-031 — Receive and follow a notification

**Actors:** Any signed-in user, System automation

**Goal:** Learn about a workflow event and act on it.

**Preconditions:** An event has happened and its template is on for the Hub channel.

**Main flow:**

1. The system fills the template and posts a notice addressed to the Office, a unit or an account.
2. The person sees the unread count on the bell and opens it.
3. The person reads a notice and follows its link to the item.
4. The person marks notices as read.

**Alternative flows:**

- A1. The person switched that kind off: the bell hides it (UC-024).
- A2. The template is off or is Email-only: no in-app notice is made.

**Postconditions:** The notices are marked read. The newest 300 are kept.

**Traces to:** FR-4.15.1

### UC-032 — Search inside a workspace

**Actors:** Office Administrator, Unit Administrator, Coordinator, Student Organizer, External guest

**Goal:** Jump to something I am allowed to see.

**Preconditions:** The person is signed in.

**Main flow:**

1. The person presses ⌘K or `/`, or opens the search palette.
2. The person types a query.
3. The system searches permitted pages, rankings, indicators, dictionary terms, stories, units and evidence, best matches first.
4. The person opens a result.

**Alternative flows:**

- A1. The focus is in another field: the shortcut leaves the keystroke alone.

**Postconditions:** Nothing changes. Only permitted content appears.

**Traces to:** FR-4.15.3

## E. Rankings and deadlines

### UC-033 — Review a ranking in the workspace

**Actors:** Office Administrator

**Goal:** Understand one ranking's standing and what it needs.

**Preconditions:** `rankings: view`.

**Main flow:**

1. The administrator opens Rankings and sees cards with position, readiness and items to go.
2. The administrator opens a ranking.
3. The system shows the hero (rank curve, readiness dial) and tabs: Overview, Indicators, Evidence, Units, Action plan, Methodology.
4. The administrator reads the tabs, or follows Reports to the Reports page with this ranking chosen.

**Alternative flows:**

- A1. The ranking has an active edition: readiness and items to go come from the analytics engine (cached 60 seconds).
- A2. Data is missing: an empty state shows.

**Postconditions:** Nothing changes. Disabled bodies and rankings are excluded, and evidence is limited to the viewer's scope.

**Traces to:** FR-4.6.1, FR-4.6.2

### UC-034 — Read a ranking's indicator diagnostic

**Actors:** Office Administrator

**Goal:** Understand a ranking's main gap.

**Preconditions:** `rankings: view`.

**Main flow:**

1. From the ranking page, the administrator opens the diagnostic.
2. The system shows the principal gap, its definition, ownership and history.

**Alternative flows:**

- A1. There are no usable values and targets: an empty state shows.

**Postconditions:** Nothing changes. Some breakdowns are fixed illustrative content, not findings.

**Traces to:** FR-4.6.3

### UC-035 — Set a ranking's dates by hand

**Actors:** Office Administrator

**Goal:** Keep the ranking's deadline and calendar correct.

**Preconditions:** `config: edit`.

**Main flow:**

1. On the ranking's page, the administrator edits the deadline and dated entries, each with a label and date.
2. The system validates and saves them, marking the source Manual with who and when.
3. The system settles any matching waiting finding and audits the change.

**Exceptions:**

- E1. An invalid date, over 20 entries, a label missing or over 120 characters, a repeated label or one reusing the deadline's label: refused.

**Postconditions:** The calendar is updated everywhere it appears.

**Traces to:** FR-4.6.4

### UC-036 — Run the deadline check now

**Actors:** Office Administrator

**Goal:** Find out whether a ranking body has changed its dates.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator chooses Check now.
2. The system reads each configured public source with a named user agent and a 15-second timeout.
3. The system records each source's status: Read, Waiting, Failed or Manual.
4. For a date that differs from the Hub's, the system creates a finding with the source quote and link, and notifies the Office.

**Alternative flows:**

- A1. A source page changed shape and no date could be read: its status is Failed, and the Office is told to open the page.
- A2. A past date, or one already raised: ignored.

**Exceptions:**

- E1. Rate limit reached: refused.

**Postconditions:** Findings wait for a decision (UC-037). The check never changes a date itself.

**Traces to:** FR-4.6.5

### UC-037 — Apply or dismiss a date finding

**Actors:** Office Administrator

**Goal:** Decide whether a date the check found should be used.

**Preconditions:** `config: edit` and a finding in New state.

**Main flow:**

1. On the ranking's page, the administrator reads the finding, its quote and link.
2. The administrator chooses Apply or Dismiss.
3. Apply replaces the date and records the source address. Dismiss keeps the current date.
4. The system updates the finding and audits the decision.

**Exceptions:**

- E1. The finding is no longer New: refused.

**Postconditions:** The calendar and finding are updated. The last 200 decided findings are kept.

**Traces to:** FR-4.6.6

## F. Analytics engine

### UC-038 — Read an edition's scorecard

**Actors:** Office Administrator

**Goal:** See how many points are secured, claimed and still open for a ranking edition.

**Preconditions:** `rankings: view` and at least one edition.

**Main flow:**

1. The administrator opens Rankings, whose overview starts on the Scorecard.
2. The system computes each edition from its catalogue and facts: claimed points (For review plus Validated), secured points (Validated with assessed links), readiness and the fixes worth most.
3. The administrator reads the standing, the movement since the last snapshot and the top fixes.
4. The administrator chooses Open indicators to act on one.

**Alternative flows:**

- A1. The edition is scored by aggregate: sum (GreenMetric), SDG 17 × 0.22 plus the best three SDGs × 0.26 each (THE Impact), best per group (WURI), readiness only (QS Sustainability) or results (QS by Subject).
- A2. An input is missing or a formula divides by zero: that indicator gives no result, not a misleading one.

**Postconditions:** Nothing changes. Reports are computed, not stored.

**Traces to:** FR-4.7.5

### UC-039 — Manage a methodology edition

**Actors:** Office Administrator

**Goal:** Keep a ranking's yearly edition and its status correct.

**Preconditions:** `rankings: manage`.

**Main flow:**

1. On Methodology, the administrator chooses Edit details on an edition.
2. The administrator changes its label, period, methodology, open and close dates, evidence years, notes or status (Draft, Active, Closed, Archived).
3. The system validates, saves and audits the change.

**Alternative flows:**

- A1. Status becomes Active: this edition now drives the ranking page and readiness.
- A2. The administrator removes an edition that holds no values, links or cases: the edition is deleted.

**Exceptions:**

- E1. The edition holds facts: it cannot be deleted.
- E2. The edition is Archived: every change is refused. Closed editions accept changes only with `rankings: manage`.
- E3. A year outside 2000 to 2100, a second edition for the same ranking and year, or more than 10 evidence years: refused.

**Postconditions:** The edition is updated and the change audited.

**Traces to:** FR-4.7.1

### UC-040 — Start another year's edition

**Actors:** Office Administrator

**Goal:** Prepare next year's edition without rebuilding it.

**Preconditions:** `rankings: manage` and an existing edition.

**Main flow:**

1. On Methodology, the administrator chooses Start another year and gives the target year.
2. The system clones the methodology as a Draft, with dates moved forward and no facts.

**Exceptions:**

- E1. An edition for that ranking and year already exists, or the year is out of range: refused.

**Postconditions:** A new Draft edition exists, and units do not see it yet.

**Traces to:** FR-4.7.1

### UC-041 — Import or export a methodology pack

**Actors:** Office Administrator

**Goal:** Move an edition's catalogue as a file.

**Preconditions:** `rankings: manage`; for import, a JSON pack of 8 MB or less for a tracked ranking.

**Main flow:**

1. On Methodology, the administrator chooses a pack file.
2. The system checks the whole pack: unique, well-formed codes; formulas that parse and refer to codes in the pack; shares from 0 to 1; existing options; a known aggregate and status.
3. The system upserts the edition and reports the counts added, updated, removed and kept.
4. The system writes an import log entry with the file's name, size and SHA-256.

**Alternative flows:**

- A1. Export: the administrator chooses Export pack and the browser downloads the JSON.
- A2. An indicator is missing from the pack and has facts: it is kept. Only those with no facts are removed.

**Exceptions:**

- E1. Any check fails: the whole pack is refused and nothing changes.

**Postconditions:** The edition matches the pack, or is unchanged on failure.

**Traces to:** FR-4.7.2

### UC-042 — Edit an indicator

**Actors:** Office Administrator

**Goal:** Correct an indicator's details or scoring rule.

**Preconditions:** `rankings: manage`, and the edition is not Archived.

**Main flow:**

1. On Methodology, the administrator opens an indicator and edits its name, reference, guidance, unit, owners, evidence rules, roll-up, input type, score rule, feeds, tags, group or parent.
2. The system checks the change against the whole edition.
3. The system saves and audits it.

**Exceptions:**

- E1. The formula or rule is invalid, or breaks a reference in the edition: refused, and the indicator is unchanged.

**Postconditions:** The indicator is updated, and reports recompute from it.

**Traces to:** FR-4.7.3

### UC-043 — Enter the University's figure

**Actors:** Office Administrator

**Goal:** Record the University's own value for an indicator.

**Preconditions:** `rankings: edit`, and the edition is writable.

**Main flow:**

1. On Indicators, the administrator opens an indicator.
2. The administrator enters the value in the indicator's input type, with an optional note. Any suggestion from feeds appears beside the form.
3. The administrator saves it, as a draft or not.
4. The system validates it, saves the University's row, appends to the value's history and audits it.

**Alternative flows:**

- A1. The indicator does not apply: the administrator marks it Not applicable.

**Exceptions:**

- E1. A number outside its range, not whole where required or above 1e15; an unknown choice; text over 4,000 characters; a note over 2,000: refused.
- E2. A review date before the policy's date: refused.
- E3. The indicator takes no value: refused.

**Postconditions:** The University's row is saved, and it always wins over units' answers in the roll-up. Suggestions never fill themselves in.

**Traces to:** FR-4.7.4, FR-4.7.5

### UC-044 — Review a unit's value

**Actors:** Office Administrator

**Goal:** Validate a unit's figure, or send it back.

**Preconditions:** `data: approve`, and a value exists.

**Main flow:**

1. On Indicators, the reviewer opens the indicator and the unit's answer.
2. The reviewer chooses Validate.
3. The system sets the status to Validated, appends to the history and audits it.

**Alternative flows:**

- A1. Return: the reviewer writes what needs changing, the status becomes Needs revision and the unit is notified.
- A2. Reopen: the status returns to For review.
- A3. Mark not applicable: the status becomes Not applicable.

**Exceptions:**

- E1. Return without a note: refused.
- E2. The edition no longer allows changes: refused.

**Postconditions:** The value's status and history are updated, and secured points change accordingly.

**Traces to:** FR-4.7.4

### UC-045 — Link evidence to an indicator

**Actors:** Office Administrator, Coordinator

**Goal:** Support an indicator with a page, file or evidence record.

**Preconditions:** The edition is writable. The Office needs `rankings: edit`; a unit needs `evidence: submit` for its own row.

**Main flow:**

1. On the indicator (or the unit's request item), the person gives an `https` address or chooses an evidence record, with a label, year and public flag.
2. The system normalizes and checks the link, saves it and audits it.
3. Readiness recomputes.

**Alternative flows:**

- A1. The person removes a link: it is deleted and audited.

**Exceptions:**

- E1. Not `https`, over 2,000 characters or containing credentials: refused.
- E2. A year outside 1900 to 2100, a duplicate, or another unit's evidence record: refused.

**Postconditions:** The link counts towards readiness once it passes the checks.

**Traces to:** FR-4.7.7

### UC-046 — Assess an evidence link

**Actors:** Office Administrator

**Goal:** Record whether a link really proves the indicator.

**Preconditions:** `rankings: edit`, and a link exists.

**Main flow:**

1. On the indicator, the reviewer opens a link.
2. The reviewer sets relevance (specific, general, not relevant), whether it is public and whether it is self-contained.
3. The system saves and audits this, and readiness and secured points recompute.

**Postconditions:** The link is assessed. Links not yet assessed count as specific for claimed points only.

**Traces to:** FR-4.7.5, FR-4.7.7

### UC-047 — Work through an edition's data checks

**Actors:** Office Administrator

**Goal:** Catch likely errors before they cost points.

**Preconditions:** `rankings: view` and an edition with facts.

**Main flow:**

1. On Indicators, the administrator opens the Checks tab.
2. The system lists errors, warnings and notes: percentages over 100, negative results, division by zero, out-of-range values, unit slips, indicators with no owner, year-on-year changes over 50%, folder links, private Drive links where public evidence is needed, evidence outside the period, and one link reused across many indicators.
3. The administrator opens the indicator and corrects it (UC-043, UC-045) or asks the unit (UC-044).

**Postconditions:** Nothing changes through the list itself. Checks are advisory and never block saving.

**Traces to:** FR-4.7.6

### UC-048 — Send a data request to units

**Actors:** Office Administrator

**Goal:** Ask units for an edition's items, and start tracking who owes what.

**Preconditions:** `rankings: manage` and an Active or Draft edition.

**Main flow:**

1. On Data requests, the administrator creates a request with a title, memorandum, message, due date, and reminder and escalation days.
2. The administrator chooses units, each with the indicators it owns or items chosen by hand.
3. The system assigns a code (REQ-###), saves the request and notifies each unit.

**Exceptions:**

- E1. A due date before today, no unit with items, more than 200 units, or an edition that is neither Active nor Draft: refused.

**Postconditions:** An open request exists, and it appears on each unit's Data requests page.

**Traces to:** FR-4.7.8

### UC-049 — Track and manage a data request

**Actors:** Office Administrator

**Goal:** See who has answered, and follow up.

**Preconditions:** A data request exists.

**Main flow:**

1. On Data requests, the administrator reads each unit's standing.
2. The administrator chooses Remind everyone still owing, or Remind now for one unit.
3. The system notifies those units, records the reminders and audits them.

**Alternative flows:**

- A1. Change the due date or message, or add units or items.
- A2. Take a unit off the request.
- A3. Close or reopen the request.
- A4. Remove the request: the values and links already sent stay.
- A5. Copy a request, follow-up or thank-you letter drafted for a unit.
- A6. Every unit has sent everything: the reminder reports that and sends nothing.

**Postconditions:** The request and its standings are updated and audited.

**Traces to:** FR-4.7.8

### UC-050 — Answer a data request for my unit

**Actors:** Coordinator

**Goal:** Give the Office what it asked for.

**Preconditions:** `data: submit` for the unit, and an open request naming the unit.

**Main flow:**

1. The Coordinator opens Data requests and sees the items asked of the unit.
2. The Coordinator opens an item and enters a value and note.
3. The Coordinator adds evidence: a link, or one of the unit's evidence records (UC-045).
4. The Coordinator sends it.
5. The system saves it as For review with source `portal`, appends to the history and notifies the Office.

**Alternative flows:**

- A1. Save as a draft: it stays Draft and the Office is not told.
- A2. Mark as not applicable.
- A3. This completes everything asked of the unit: the system thanks the unit once.

**Exceptions:**

- E1. The item is Validated: it is locked.
- E2. The value fails its rule, or the edition no longer allows changes: refused.

**Postconditions:** The unit's answer is with the Office. It is kept apart from the University's own row.

**Traces to:** FR-4.7.4, FR-4.7.8

### UC-051 — Correct a value the Office returned

**Actors:** Coordinator

**Goal:** Fix a figure the Office sent back.

**Preconditions:** The unit's value has status Needs revision.

**Main flow:**

1. The Coordinator follows the notice to Data requests and reads the Office's note on the item.
2. The Coordinator changes the value or evidence and sends it again.
3. The system sets it back to For review, appends to the history and notifies the Office.

**Postconditions:** The value is back with the Office for review (UC-044).

**Traces to:** FR-4.7.4, FR-4.7.8

### UC-052 — Read my unit's data requests

**Actors:** Unit Administrator

**Goal:** See what the Office has asked of the unit.

**Preconditions:** `data: view` in the unit.

**Main flow:**

1. The Unit Administrator opens Data requests.
2. The system lists requests, items and the unit's activities, with no way to send or edit.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.7.8, FR-4.3.1

### UC-053 — Keep the activity register

**Actors:** Office Administrator, Coordinator

**Goal:** Record service learning, community development, advocacy, outreach, events and research.

**Preconditions:** The Office needs `rankings: edit`; a Coordinator needs `data: submit` for the unit.

**Main flow:**

1. On Activities (or the Activities tab of Data requests, for a Coordinator), the person adds an activity.
2. The person enters its kind, academic year, title, unit, proponent, community, proposal and report references, SDGs, beneficiaries, partner, MOU link, dates and tags.
3. The system validates, saves and audits it.

**Alternative flows:**

- A1. Editing or deleting an activity. A Coordinator only reaches their own unit's.

**Exceptions:**

- E1. A year not written as consecutive years (`2025-2026`), a missing title, an end before the start, SDGs outside 1 to 17, a non-`https` MOU, more than 12 tags or a duplicate: refused.

**Postconditions:** The register is updated. Feeds use it to suggest values, and nothing is filled in automatically.

**Traces to:** FR-4.7.9

### UC-054 — Import an activity register file

**Actors:** Office Administrator

**Goal:** Load an office's register of activities in one step.

**Preconditions:** `rankings: edit`, and a spreadsheet within the import limits.

**Main flow:**

1. On Activities, the administrator chooses the file.
2. The browser parses it and sends only the sheets.
3. The server reads the sheets, deduplicates them and matches unit names through aliases.
4. The system reports the counts added and skipped and any unknown units, and writes the import log.

**Alternative flows:**

- A1. Unknown units: the administrator adds aliases (UC-064), and the next import matches them.

**Exceptions:**

- E1. Over 60 MB or the sheet limits: refused.

**Postconditions:** New activities are in the register. Duplicates were skipped.

**Traces to:** FR-4.7.13, FR-4.7.9

### UC-055 — Enter a WURI innovation case

**Actors:** Office Administrator

**Goal:** Hold a case for a WURI category.

**Preconditions:** `rankings: edit`, and an edition whose category takes cases and has a rubric.

**Main flow:**

1. On Indicators, the administrator opens the Cases tab and adds a case with its category, title, unit and abstract.
2. The system saves and audits it.

**Alternative flows:**

- A1. Editing or deleting a case.

**Exceptions:**

- E1. The category takes no cases or has no rubric: refused.

**Postconditions:** The case is ready for review.

**Traces to:** FR-4.7.10

### UC-056 — Score a WURI case on its rubric

**Actors:** Office Administrator

**Goal:** Record a reviewer's scores.

**Preconditions:** `rankings: edit`, and a case exists.

**Main flow:**

1. The reviewer opens the case and enters a score per criterion, with a note.
2. The system stores one review per reviewer and computes the rubric total.
3. The best reviewed case per category counts in the edition.

**Postconditions:** The case list shows the totals, and the score recomputes.

**Traces to:** FR-4.7.10

### UC-057 — Maintain peers and benchmark figures

**Actors:** Office Administrator

**Goal:** Compare the University with peer institutions.

**Preconditions:** `rankings: edit`.

**Main flow:**

1. On Benchmarks, the Peers tab, the administrator adds a peer with a name, country and band (Philippines, ASEAN, Aspirational, Other).
2. On Figures, the administrator adds a figure with a ranking, year, metric, and value or rank.
3. The system saves it, and the Gap matrix shows medians and gaps per band.

**Alternative flows:**

- A1. Editing or deleting a peer or figure.

**Exceptions:**

- E1. A year outside 2000 to 2100, no value or rank, or a duplicate peer: refused.

**Postconditions:** The comparison is updated.

**Traces to:** FR-4.7.11

### UC-058 — Import benchmark tables

**Actors:** Office Administrator

**Goal:** Load peer figures from a file.

**Preconditions:** `rankings: edit`.

**Main flow:**

1. On Benchmarks, the administrator chooses a ranking, year and file.
2. The browser parses the file and sends the sheets.
3. The server reads long or wide tables, and rows naming the University become its own figures.
4. The system reports the counts and writes the import log.

**Postconditions:** Peers and figures are added.

**Traces to:** FR-4.7.13, FR-4.7.11

### UC-059 — Import counts from a personal-data file

**Actors:** Office Administrator

**Goal:** Use Registrar, HR, Health Service, FMO or Research files without storing anyone's data.

**Preconditions:** `rankings: manage`, and a template profile that fits the file.

**Main flow:**

1. On Data imports, the Templates tab, the administrator chooses a file.
2. The browser reads it and detects or takes the profile, then counts rows by the profile's measures (count, distinct, sum, full-time equivalent).
3. Only totals and breakdowns go to the server.
4. The server checks them again and suppresses breakdown cells below the minimum (default 5).
5. The system saves the totals and logs the file's SHA-256, never its rows.

**Exceptions:**

- E1. Numbers that are not finite and non-negative, or measures and dimensions outside the profile: refused.

**Postconditions:** The totals can feed indicator suggestions. No personal rows leave the browser.

**Traces to:** FR-4.7.12

### UC-060 — Manage template profiles

**Actors:** Office Administrator

**Goal:** Teach the Hub a new template without code.

**Preconditions:** `rankings: manage`.

**Main flow:**

1. On Data imports, Templates, the administrator adds or edits a profile as JSON: headers, skip rules, measures, dimensions and minimum cell.
2. The system validates and saves it.

**Alternative flows:**

- A1. Remove profile.

**Exceptions:**

- E1. The profile is invalid: refused, with the reason.

**Postconditions:** The profile is available to the next import.

**Traces to:** FR-4.7.12

### UC-061 — Import a unit's THE data-collection workbook

**Actors:** Office Administrator

**Goal:** Bring a unit's working file into the edition.

**Preconditions:** `rankings: edit` for the import, `rankings: manage` to reach the Data imports page, a THE edition that is not Archived, and a chosen unit.

**Main flow:**

1. On Data imports, Unit files, the administrator chooses the edition, unit and workbook.
2. The browser parses it and sends the sheets.
3. The server reads Yes/No rows, option sub-rows, continuous figures, and evidence and public columns.
4. The system saves them as that unit's For review values and links, and reports the counts, unplaced rows and unknown items.

**Exceptions:**

- E1. Over the file or sheet limits, or an Archived edition: refused.

**Postconditions:** The values wait for review (UC-044). The import is logged.

**Traces to:** FR-4.7.13

### UC-062 — Import WURI case documents

**Actors:** Office Administrator

**Goal:** Create cases from the Office's Word templates.

**Preconditions:** `rankings: edit` for the import, `rankings: manage` to reach the Data imports page, and a WURI edition.

**Main flow:**

1. On Data imports, Unit files, the administrator chooses `.docx` files.
2. The browser reads the text and sends it with each file's SHA-256 and size.
3. The server reads the title, category, abstract, writer, champion and email.
4. The system creates the cases and logs the import.

**Postconditions:** The cases are ready to score (UC-056).

**Traces to:** FR-4.7.13, FR-4.7.10

### UC-063 — Read GreenMetric evidence documents

**Actors:** Office Administrator

**Goal:** Pull suggested figures out of evidence documents.

**Preconditions:** `rankings: edit` for the read, `rankings: manage` to reach the Data imports page, and a GreenMetric edition.

**Main flow:**

1. On Data imports, Unit files, the administrator chooses the documents.
2. The browser reads them, and the server finds figures in context and the indicator code from the file name.
3. The system shows suggestions.
4. The administrator chooses what to save, as in UC-043.

**Postconditions:** Only what the Office confirms is saved. Nothing is filled in automatically.

**Traces to:** FR-4.7.13

### UC-064 — Map names in files to Directory units

**Actors:** Office Administrator

**Goal:** Make later imports recognize a unit's name in a file.

**Preconditions:** `rankings: manage`, and an active unit.

**Main flow:**

1. On Data imports, Unit names, the administrator enters the alias and chooses the unit.
2. The system stores it in capitals, up to 60 characters, and audits it.

**Alternative flows:**

- A1. Delete an alias.

**Postconditions:** The next import matches the name.

**Traces to:** FR-4.7.14

### UC-065 — Read the import log

**Actors:** Office Administrator

**Goal:** See what was imported, when and from which file.

**Preconditions:** `rankings: manage`.

**Main flow:**

1. On Data imports, the administrator opens Log.
2. The system lists each import with its file's name, size, SHA-256 and counts.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.7.2, FR-4.7.12, FR-4.7.13

### UC-066 — Track improvement actions

**Actors:** Office Administrator

**Goal:** Keep a plan of what will raise the score.

**Preconditions:** `rankings: edit`.

**Main flow:**

1. On the Scorecard, the administrator adds an action with its indicator, owner unit, due date, status, progress and note.
2. The system saves and audits it.

**Alternative flows:**

- A1. Editing or deleting an action.
- A2. The status becomes Complete: progress is set to 100.

**Exceptions:**

- E1. Action text empty or over 300 characters, or progress outside 0 to 100: refused.

**Postconditions:** The plan is updated.

**Traces to:** FR-4.7.15

### UC-067 — Take a snapshot of an edition

**Actors:** Office Administrator

**Goal:** Freeze today's standing for later comparison.

**Preconditions:** `rankings: edit`.

**Main flow:**

1. On the Scorecard, the administrator chooses Take a snapshot.
2. The system stores the report's summary.

**Postconditions:** "Since last week" and quarterly comparisons can use it. See also UC-176.

**Traces to:** FR-4.7.15

### UC-068 — Export analytics

**Actors:** Office Administrator

**Goal:** Take analytics out of the Hub for a meeting or report.

**Preconditions:** `rankings: export`.

**Main flow:**

1. The administrator chooses an export: Indicators (CSV), Positioning brief (Markdown), Quarterly review (CSV), Gap matrix (CSV), or a methodology pack (JSON).
2. The system builds the file and audits the export.
3. The browser downloads it.

**Exceptions:**

- E1. Rate limit reached: refused.

**Postconditions:** The person has the file, and the export is on the audit trail.

**Traces to:** FR-4.7.16

## G. Evidence contributions

### UC-069 — Submit evidence for my unit

**Actors:** Coordinator

**Goal:** File evidence with the Office.

**Preconditions:** `evidence: submit` for an active unit, `submit-evidence` on, and at least one reporting period accepting.

**Main flow:**

1. The Coordinator opens Submit evidence and starts a new submission.
2. In Overview, the Coordinator enters the title, background, type, period, measurable result, beneficiaries and SDGs.
3. In Narrative, the Coordinator writes the description.
4. In Evidence, the Coordinator attaches files with their kinds, and links. In References, they cite sources.
5. The Coordinator confirms the rankings it counts in, shown at the foot, and submits.
6. The system confirms each file in storage, reads its real size, validates everything and assigns EV-####.
7. The system records it as For review, notifies the Office and shows a toast.

**Exceptions:**

- E1. A closed period or an archived unit: refused.
- E2. A missing result or beneficiaries, no SDG, no file or link, or no active indicator mapping: refused.
- E3. A file over the limit (default 25 MB and 10 files), an unaccepted type, or a file attached twice: refused.
- E4. The unit is outside the person's scope: refused and audited as Denied.

**Postconditions:** A traceable record is in the Office's queue.

**Traces to:** FR-4.8.1

### UC-070 — Read my unit's submissions

**Actors:** Coordinator, Unit Administrator

**Goal:** Follow what the unit has filed.

**Preconditions:** `evidence: view` in the unit.

**Main flow:**

1. The person opens Submit evidence, and the table lists the unit's records with their status.
2. The person opens a record to read its Overview, Narrative, Evidence, References, validation comments and history.

**Alternative flows:**

- A1. A Unit Administrator: the same table, with no Submit evidence button.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.8.2, FR-4.3.1

### UC-071 — Work the validation queue

**Actors:** Office Administrator

**Goal:** Find what needs reviewing.

**Preconditions:** `evidence: view`.

**Main flow:**

1. The reviewer opens Contributions, whose sidebar shows a live count.
2. The reviewer searches and filters within their unit and ranking scope.
3. The reviewer opens a record in its modal and downloads attachments.

**Exceptions:**

- E1. A file outside the reviewer's rights: returns Not Found.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.8.2, FR-4.24.4

### UC-072 — Accept evidence

**Actors:** Office Administrator

**Goal:** Validate a submission.

**Preconditions:** `evidence: approve` covering the record, which someone else submitted.

**Main flow:**

1. In the record, the reviewer chooses Accept, optionally with a comment.
2. The system sets it to Validated, adds the comment and audits how many rankings it counts in.
3. The system notifies the unit.

**Exceptions:**

- E1. The reviewer submitted this item: refused and audited; another reviewer must decide it.
- E2. Outside the reviewer's units or ranking bodies: refused and audited.

**Postconditions:** The record is Validated and now counts for merit and rankings. It does not mean anything was submitted to a ranking body.

**Traces to:** FR-4.8.3

### UC-073 — Request a revision

**Actors:** Office Administrator

**Goal:** Send a submission back with what to change.

**Preconditions:** `evidence: approve` covering the record, which someone else submitted.

**Main flow:**

1. In the record, the reviewer chooses Request revision and writes a note of 5 to 1,000 characters.
2. The system sets it to Needs revision, adds the comment and audits it.
3. The system notifies the unit, with the comment.

**Exceptions:**

- E1. A note under 5 characters: refused.

**Postconditions:** The record waits for the unit's reply (UC-075).

**Traces to:** FR-4.8.3

### UC-074 — Change a record's ranking indicators

**Actors:** Office Administrator

**Goal:** Make sure the evidence counts where it should.

**Preconditions:** `evidence: approve` covering the record.

**Main flow:**

1. In the record, the reviewer adds or removes a ranking indicator.
2. The system updates the mapping and audits it.

**Exceptions:**

- E1. The ranking added is not active: refused.
- E2. Removing the last mapping: refused; request a revision if none applies.

**Postconditions:** The mappings are updated.

**Traces to:** FR-4.8.4

### UC-075 — Respond to a revision and resubmit

**Actors:** Coordinator

**Goal:** Answer the reviewer and return the record to the queue.

**Preconditions:** `evidence: edit` for the unit, and status Needs revision.

**Main flow:**

1. The Coordinator opens the record from the table, dashboard or notice, and reads the comment.
2. The Coordinator writes a reply and optionally attaches a corrected file.
3. The system appends both, sets For review and notifies the Office.

**Exceptions:**

- E1. The record is not waiting for a revision: refused.
- E2. A reply under 5 characters, or a file that breaks the upload limits or the total count: refused.

**Postconditions:** The same reference is back in the queue with its history kept. The original fields are not rewritten.

**Traces to:** FR-4.8.5

### UC-076 — Ask the Office for assistance

**Actors:** Coordinator

**Goal:** Get help on behalf of the unit.

**Preconditions:** The person may contribute for the unit, and `assistance` is on.

**Main flow:**

1. The Coordinator opens Request assistance and enters a topic, urgency and message.
2. The system assigns AR-####, keeps the topic and urgency, notifies the Office and shows a toast.

**Exceptions:**

- E1. No topic, or a message under 10 characters: refused.
- E2. The person only reads the unit: refused and audited.

**Postconditions:** The Office has a notice. The message itself is validated and then discarded, and no conversation is tracked. A person needs to follow up outside this flow.

**Traces to:** FR-4.8.6

### UC-077 — Request temporary data access

**Actors:** External guest, Office Administrator

**Goal:** Get time-limited view or export rights over a dataset.

**Preconditions:** The person has a reason, and the data-access workflow is on.

**Main flow:**

1. The person starts the request from Shared with you (guests), from the export prompt in Reports, or from "Access to a dataset" in Approval Workflows.
2. The person chooses the dataset, View or Export, an end date and a justification.
3. The system opens a data-access request and shows its reference.
4. On approval (UC-150), the system creates a time-limited grant.

**Exceptions:**

- E1. An end date in the past or over 90 days ahead: refused.
- E2. A justification under 10 characters: refused.
- E3. Export of Restricted data: always refused.
- E4. Requesting for someone else without `governance: edit`: refused.

**Postconditions:** A request is pending, then a grant that ends on its own date (UC-177).

**Traces to:** FR-4.9.5

## H. Units and recognition

### UC-078 — Compare units

**Actors:** Office Administrator

**Goal:** See who is contributing and who needs a push.

**Preconditions:** `units: view`.

**Main flow:**

1. The administrator opens Units and chooses Faculty/Colleges, University Offices or Research Centers.
2. The system ranks active units by validated evidence, then rankings served, completion and name.
3. The administrator searches and opens a unit.

**Alternative flows:**

- A1. A unit has no validated evidence: it has no rank. Tied units share a rank.
- A2. Searching filters the list but never changes a position, because rank is computed first.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.9.1

### UC-079 — View a unit profile

**Actors:** Office Administrator

**Goal:** Understand one unit in full.

**Preconditions:** `units: view`, and the unit is in scope.

**Main flow:**

1. From Units or a link, the administrator opens the unit.
2. The system shows Overview, Submissions, Recognitions, History and Account settings in a modal, with its merit, season honour and medals.

**Alternative flows:**

- A1. The unit is archived: a warning shows.
- A2. No directory rights: settings are not offered.

**Postconditions:** Nothing changes. Merit comes only from validated evidence and never grows with the number of files.

**Traces to:** FR-4.9.2, FR-4.9.3

### UC-080 — View the Recognition wall

**Actors:** Office Administrator

**Goal:** Celebrate and compare contributions inside the Hub.

**Preconditions:** `dashboard: view`, and `recognition-internal` on.

**Main flow:**

1. On Dashboard, the administrator chooses Recognition.
2. The system shows tiles: Awards, Moved up, Top contributors, Evidence champions, Innovation leaders, Sustainability partners and Archive.
3. The administrator follows a link to a unit profile.

**Postconditions:** Nothing changes. No nomination or award-approval workflow exists, and named awards depend on presentation data.

**Traces to:** FR-4.9.4

## I. Publications

### UC-081 — Compose a post

**Actors:** Office Administrator, Coordinator

**Goal:** Write and save a Stories & News post.

**Preconditions:** `posts: create` or `posts: edit`. A Coordinator works only under their own unit.

**Main flow:**

1. The author opens Publications, then Stories & News, and starts a post or opens a draft.
2. In the composer, the author enters the title, subtitle and rich text, adds photos with alt text and a thumbnail, and chooses a layout, themes, hashtags and SDGs.
3. The author may preview the chosen layout.
4. The author saves a draft.
5. The system cleans the rich text, assigns PO-#### and a free address, audits which parts changed and removes pictures no longer used from storage.

**Exceptions:**

- E1. A title outside 4 to 140 characters; a subtitle over 220; a body over 20,000 characters; over 20 photos, 3 themes or 10 hashtags; alt text over 240 characters; or a picture that is not JPG or PNG up to 2 MB: refused.

**Postconditions:** A draft exists. It is not public.

**Traces to:** FR-4.10.1

### UC-082 — Publish an Office post

**Actors:** Office Administrator

**Goal:** Put a post on the public site.

**Preconditions:** `posts: approve`, and a post with content and at least one SDG.

**Main flow:**

1. The administrator chooses Publish in the composer or list.
2. The system validates the post.
3. With the publication workflow on and enough other approvers, the system sets In review and opens a request that needs two approvals (UC-150).

**Alternative flows:**

- A1. The workflow is off or too few other approvers exist: the post is published directly, and the audit entry says so.

**Exceptions:**

- E1. No text or photos, or no SDG: refused.
- E2. A request for it is already pending: no second request is opened.

**Postconditions:** The post is live or waiting for approval.

**Traces to:** FR-4.10.2, FR-4.20.3

### UC-083 — Send a unit post to the Rankings Office

**Actors:** Coordinator

**Goal:** Propose a unit's post for publication.

**Preconditions:** `posts: submit` for the unit, and a post that meets the publishing rules.

**Main flow:**

1. The Coordinator chooses to send the post.
2. The system files it under the unit, sets In review, notifies the Office and audits it.

**Exceptions:**

- E1. The item belongs to another unit, is live or is already waiting: refused with the reason.

**Postconditions:** The post waits for the Office. Nothing from a unit reaches the public site without the Office's approval.

**Traces to:** FR-4.10.2, FR-4.10.4

### UC-084 — Move a unit's waiting item back to drafts

**Actors:** Coordinator

**Goal:** Change an item already sent to the Office.

**Preconditions:** The item is the unit's own and In review.

**Main flow:**

1. The Coordinator chooses to move it back to drafts.
2. The system sets it to Draft and audits it.
3. The Coordinator edits it and sends it again.

**Exceptions:**

- E1. The item is live: refused. The Coordinator asks the Office to change it.

**Postconditions:** The item is a draft again.

**Traces to:** FR-4.10.4

### UC-085 — Review a unit's post or document

**Actors:** Office Administrator

**Goal:** Approve a unit's item, or return it with a note.

**Preconditions:** `posts: approve`, and an item In review marked to review.

**Main flow:**

1. The administrator opens the item, then reads or edits it.
2. The administrator approves it.
3. The system publishes it, or opens the publication workflow when that applies.

**Alternative flows:**

- A1. Return: the administrator writes a note of 5 to 600 characters. The item goes back to Draft and the unit is notified with the note.

**Exceptions:**

- E1. Incomplete content: approval is refused.
- E2. A return with no note or too short a note: refused.

**Postconditions:** The item is published, waiting on the workflow, or back with the unit. The decision is audited.

**Traces to:** FR-4.10.5

### UC-086 — Catalogue a research article or report

**Actors:** Office Administrator, Coordinator

**Goal:** Record a document's details and file.

**Preconditions:** `posts: create` or `posts: edit`. A Coordinator works only under their own unit.

**Main flow:**

1. The author opens Research Articles or Reports & Insights and adds an item.
2. The author enters the title, authors, venue, type, abstract, issue date, DOI, link, SDGs, keywords and unit. For a report, also the cover colour.
3. The author uploads a PDF of up to 25 MB, if there is one.
4. The author saves a draft, and the system assigns DOC-####.

**Alternative flows:**

- A1. The Office marks it as featured: the mark moves from the previous document of that kind.

**Exceptions:**

- E1. A title outside 4 to 220 characters; over 30 authors or 10 keywords; a date before 1900 or in the future; a non-`https` link: refused.
- E2. A Coordinator tries to feature it: refused.

**Postconditions:** A draft exists. The PDF reaches public storage only while the item is published.

**Traces to:** FR-4.10.3, FR-4.10.4

### UC-087 — Publish or send a document

**Actors:** Office Administrator, Coordinator

**Goal:** Get a catalogued document to the public site.

**Preconditions:** A draft with at least one author, a summary of at least 40 characters, and a DOI, link or PDF.

**Main flow:**

1. The Office Administrator chooses Publish.
2. The system validates it, then publishes directly or opens the publication workflow.
3. Once published, the document appears in its public section and its PDF becomes public.

**Alternative flows:**

- A1. A Coordinator chooses to send it: it goes In review and waits for the Office (UC-085).

**Exceptions:**

- E1. The publishing requirements are not met: refused with what is missing.

**Postconditions:** The document is live or waiting.

**Traces to:** FR-4.10.3, FR-4.10.4, FR-4.24.4

### UC-088 — Unpublish an item

**Actors:** Office Administrator

**Goal:** Take a live item off the public site.

**Preconditions:** `posts: approve`, and a live item.

**Main flow:**

1. The administrator chooses Unpublish.
2. The system sets Unpublished, removes it from the public site and audits it.

**Postconditions:** The item is no longer public and is kept in the Hub.

**Traces to:** FR-4.10.6

### UC-089 — Delete a post or document

**Actors:** Office Administrator, Coordinator

**Goal:** Remove an item for good.

**Preconditions:** `posts: delete`. A unit may delete only its own items that are not live.

**Main flow:**

1. The person chooses Delete and confirms.
2. The system withdraws any waiting request, deletes the item, releases its media and audits it.

**Exceptions:**

- E1. A unit's live item, or another unit's item: refused.

**Postconditions:** The item and its unused media are gone.

**Traces to:** FR-4.10.7

### UC-090 — Read a post's audience

**Actors:** Office Administrator, Coordinator

**Goal:** See how a post is being read.

**Preconditions:** `posts: view`.

**Main flow:**

1. The person opens a post's analytics.
2. The system shows total views, recent views and daily counts.

**Postconditions:** Nothing changes. The counts identify no visitor.

**Traces to:** FR-4.10.8

## J. Workspace and Knowledge Center

### UC-091 — Upload files and create folders

**Actors:** Office Administrator, Coordinator

**Goal:** Store files on a shelf.

**Preconditions:** `evidence: submit` for a unit's files, `knowledge: edit` for the Office's shared files.

**Main flow:**

1. The person opens Workspace, then Resource Library, and opens or creates a folder.
2. The person drops or chooses up to 20 files.
3. The system issues signed upload addresses, reads each file's real size from storage, assigns WS-#### and audits it.

**Exceptions:**

- E1. No folder chosen: refused, since files must be in a folder.
- E2. A type or size the upload settings forbid: refused.
- E3. A folder name over 48 characters or repeated among siblings, more than 5 levels deep or more than 120 folders on the shelf: refused.

**Postconditions:** The files are stored under their owner. They always download, in a sandbox.

**Traces to:** FR-4.11.1, FR-4.24.4

### UC-092 — Browse and download shared files

**Actors:** Office Administrator, Unit Administrator, Coordinator

**Goal:** Find a file or template.

**Preconditions:** `evidence: view`, or `knowledge: edit` on the Office side.

**Main flow:**

1. The person opens Resource Library, which shows folder cards.
2. The person opens a folder in its full-size window.
3. The person searches and downloads a file.

**Alternative flows:**

- A1. A Unit Administrator: read-only, with no upload or change actions.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.11.1

### UC-093 — Rename or move files and folders

**Actors:** Office Administrator, Coordinator

**Goal:** Keep the shelf tidy.

**Preconditions:** Write rights for the owner.

**Main flow:**

1. The person renames or moves an item.
2. The system validates, applies and audits it, and shows a toast.

**Exceptions:**

- E1. A name that is empty or over 120 characters: refused.
- E2. A destination with another owner or shelf, or moving a folder inside itself: refused.

**Postconditions:** The tree is updated.

**Traces to:** FR-4.11.1, FR-4.11.2

### UC-094 — Archive, restore or delete files

**Actors:** Office Administrator, Coordinator

**Goal:** Retire files safely.

**Preconditions:** Write rights for the owner.

**Main flow:**

1. The person selects up to 100 files and archives them.
2. In Archives, the person restores files, which return to their original shelf.
3. Or the person permanently deletes archived files, and the stored file is removed after the change commits.

**Alternative flows:**

- A1. Deleting a folder: allowed only when empty, including of archived files.

**Exceptions:**

- E1. Deleting a file that is not archived: refused.

**Postconditions:** The files are archived, restored or gone. Each action is audited.

**Traces to:** FR-4.11.3

### UC-095 — Track a working document as a link

**Actors:** Office Administrator, Coordinator

**Goal:** Keep an externally edited document findable with its status.

**Preconditions:** Write rights for the owner.

**Main flow:**

1. The person opens Working Documents and adds an entry with its title, due date, rankings, SDGs, authors, status, links and remarks.
2. The system saves it as WD-####.
3. The person opens the link to work on it, and updates its status as it moves through Draft, In progress, For review and Final.

**Alternative flows:**

- A1. The person edits or deletes entries.

**Exceptions:**

- E1. A title over 160 characters; an invalid date; no links, more than 10 or non-`https`; more than 12 rankings or authors; remarks over 5,000 characters: refused.

**Postconditions:** The Hub holds a searchable record. It never edits the linked document or its sharing.

**Traces to:** FR-4.11.4

### UC-096 — Use the Knowledge Center inside a workspace

**Actors:** Office Administrator, Unit Administrator, Coordinator, External guest

**Goal:** Find guidance while working.

**Preconditions:** `knowledge: view`. Student Organizers do not hold it by default.

**Main flow:**

1. The person opens Workspace, then Knowledge Center.
2. The person chooses Dictionary, Methodologies, Evidence, Resources or FAQ, and types in the one shared search.
3. The system shows match counts per tab and the deadline panel.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.11.5

## K. Digital Forms

### UC-097 — Build a form

**Actors:** Office Administrator, Coordinator, Student Organizer

**Goal:** Make a form without code.

**Preconditions:** Create rights for the holder. The Office may make any kind; a unit makes surveys, registrations, applications and evaluations; a Student Organizer makes evaluations and registrations of their own.

**Main flow:**

1. The person opens Digital Forms and chooses Create form. A Student Organizer starts from Evaluation Forms or Registrations.
2. The person enters the title, description, kind, form number, issuing unit, closing day and reference prefix.
3. On the canvas, the person adds steps and questions from the palette of modules and presets, drags them into order and sets each one in the inspector, including conditions.
4. The person adds sign-off stages and office-only fields, where the holder has them.
5. The person saves.
6. The system validates the schema and creates a draft with a responder link (`/f/<code>`) and an ID (FM-####).

**Exceptions:**

- E1. An emoji in form details or questions: refused.
- E2. A condition on a later question, or over a schema limit (20 steps, 300 questions, 60 per step, 400 KB and so on): refused.
- E3. A kind the holder may not make: refused.

**Postconditions:** A draft exists and takes no responses. Student Organizers' forms have no sign-offs.

**Traces to:** FR-4.12.1, FR-4.13.2, FR-4.12.4

### UC-098 — Open, close or reopen a form

**Actors:** Office Administrator, Coordinator, Student Organizer

**Goal:** Control when a form takes responses.

**Preconditions:** The `status` right on the form.

**Main flow:**

1. The person chooses Take responses on a draft, or Publish for an evaluation or registration form. The page asks first when that fixes the form for good.
2. The system checks the form has a question, and opens it.
3. Later, the person chooses Close responses, or Take responses again.

**Exceptions:**

- E1. No questions: refused.
- E2. A form never returns to draft.

**Postconditions:** The status is updated and audited. A published evaluation or registration form can no longer be changed or deleted.

**Traces to:** FR-4.12.2

### UC-099 — Change a form's details or questions

**Actors:** Office Administrator, Coordinator, Student Organizer

**Goal:** Improve a form.

**Preconditions:** The `edit` right.

**Main flow:**

1. The person opens the form in the Forms Builder and changes it.
2. The system validates and saves it.

**Alternative flows:**

- A1. The form is out of draft: only its details can change, not its questions or kind.

**Exceptions:**

- E1. A published evaluation or registration form: refused. The person duplicates it instead.

**Postconditions:** The form is updated and audited.

**Traces to:** FR-4.12.2, FR-4.12.4

### UC-100 — Duplicate or delete a form

**Actors:** Office Administrator, Coordinator, Student Organizer

**Goal:** Reuse a form, or remove an unused one.

**Preconditions:** The `duplicate` or `remove` right.

**Main flow:**

1. The person chooses Duplicate as a draft.
2. The system makes a new draft with the same questions and a new link.

**Alternative flows:**

- A1. Delete: allowed only for a draft, after a confirmation.

**Exceptions:**

- E1. Deleting a form out of draft: refused.

**Postconditions:** A new draft exists, or the draft is gone.

**Traces to:** FR-4.12.2

### UC-101 — Publish a form to the Student Portal

**Actors:** Office Administrator, Coordinator

**Goal:** Put a form in front of Student Organizers.

**Preconditions:** `forms: manage`. The Office may publish proposals, terminal reports and surveys; a Coordinator may publish their unit's surveys.

**Main flow:**

1. The person chooses Publish to Student Portal on the form.
2. The system marks the form, and audits it.

**Alternative flows:**

- A1. Take off the Student Portal: the same action reversed.

**Exceptions:**

- E1. Any other kind: refused.

**Postconditions:** Proposals and terminal reports can have copies built from them. Surveys become assignments for every Student Organizer.

**Traces to:** FR-4.13.3

### UC-102 — Answer a form through its link

**Actors:** Form respondent

**Goal:** Send a response without an account.

**Preconditions:** A link to an open form, before its closing day, that does not use team copies.

**Main flow:**

1. The respondent opens the link and reads the form's facts.
2. The respondent agrees to both data privacy statements.
3. The respondent fills in each applicable step and continues.
4. The respondent sends the form.
5. The server rebuilds the answers by the same rules, dropping unknown and hidden fields and forcing locked rates and sources.
6. The system numbers the response and shows a confirmation with its reference, such as CDP-0001.

**Alternative flows:**

- A1. Conditional questions: steps and questions appear only when they apply.

**Exceptions:**

- E1. A missing or invalid answer: the field is flagged and the respondent is taken to it.
- E2. Closed, past its closing day, or no current consent: refused.
- E3. Over 20 per network per form per hour, or 600 per form per hour: refused.
- E4. Answers over 300 KB, an email outside a required domain, a non-`https` link, or a name not in capitals: refused.
- E5. The hidden trap field is filled, as a bot would: refused with a general message.

**Postconditions:** The response is stored with the consent version. No Hub account is created.

**Traces to:** FR-4.12.3

### UC-103 — Open the base link of a copy-based form

**Actors:** Form respondent, Office Administrator

**Goal:** Understand a Proposal or Terminal Report form's link.

**Preconditions:** A link to a form whose kind uses team copies.

**Main flow:**

1. The person opens `/f/<code>`.
2. The system shows that copies are built from the Student Portal.

**Alternative flows:**

- A1. The viewer runs or reads the form: a preview of its questions opens, and nothing can be sent from it.

**Postconditions:** Nothing changes. No copy is started from this link.

**Traces to:** FR-4.12.3, FR-4.13.4

### UC-104 — Look up a person while answering

**Actors:** Form respondent, Team copy collaborator, with Google as a supporting system

**Goal:** Fill in a person's card with their UST email and photo.

**Preconditions:** The responder is a verified UST responder, on a form with a people question.

**Main flow:**

1. The responder types the name parts or search text.
2. The system searches Hub accounts and the Workspace directory, using the responder's own encrypted Google token.
3. The responder chooses a match, and the card fills in.

**Alternative flows:**

- A1. No match: the responder types the details by hand.

**Exceptions:**

- E1. Not a verified UST responder: the lookup is not offered.
- E2. Over 40 lookups per person or 80 per network per minute: refused.

**Postconditions:** The answer holds the chosen person's details.

**Traces to:** FR-4.12.8

### UC-105 — Record a sign-off on a response

**Actors:** Office Administrator, Coordinator

**Goal:** Record the next approver's decision.

**Preconditions:** The `review` right, and a sent response with an applicable stage.

**Main flow:**

1. The reviewer opens the response.
2. The reviewer records the next stage: decision (approved, returned, declined), signatory name, day and note.
3. The system saves it over the version that was read, updates the standing (Submitted, In review, Approved, Returned or Declined) and audits it.

**Alternative flows:**

- A1. Undo: only the latest sign-off can be undone.
- A2. Conditional stages that do not apply are skipped.

**Exceptions:**

- E1. A later stage out of order: refused.
- E2. A name not in letters or over 80 characters, a future day, a note over 600 characters or containing emoji, or no note when returning or declining: refused.
- E3. Someone changed it meanwhile: refused, to reload.

**Postconditions:** The review history is updated. Signatories are recorded by the reviewer; they do not sign in themselves.

**Traces to:** FR-4.12.5

### UC-106 — Fill in office-only fields on a response

**Actors:** Office Administrator, Coordinator

**Goal:** Add processing details respondents never see.

**Preconditions:** The `review` right, and a form with office fields.

**Main flow:**

1. The reviewer opens the response and fills in the office fields.
2. The system saves over the version that was read, and audits it.

**Exceptions:**

- E1. Someone changed it meanwhile: refused, to reload.

**Postconditions:** The office fields are saved.

**Traces to:** FR-4.12.5

### UC-107 — Read responses and analytics

**Actors:** Office Administrator, Unit Administrator, Coordinator, Student Organizer

**Goal:** Understand what came in.

**Preconditions:** The `read` right. The Office reads a unit's or Student Organizer's form once it is out of draft.

**Main flow:**

1. The person opens the form's responses, searches and filters, and opens one.
2. The person opens Analytics, which summarizes each question with bars, totals, averages, ranges and months by module.

**Alternative flows:**

- A1. An unfinished team copy: it appears in the table but not in analytics.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.12.6, FR-4.12.4

### UC-108 — Export responses as CSV

**Actors:** Office Administrator, Unit Administrator, Coordinator, Student Organizer

**Goal:** Take the responses to a spreadsheet.

**Preconditions:** The `export` right.

**Main flow:**

1. The person chooses Export.
2. The system builds the CSV, without unfinished copies, and audits it.

**Exceptions:**

- E1. Rate limit reached: refused.

**Postconditions:** The person has the file.

**Traces to:** FR-4.12.7

### UC-109 — Remove responses

**Actors:** Office Administrator, Coordinator

**Goal:** Clear test runs and duplicates.

**Preconditions:** The `clear` right. Only the Office clears responses of fixed evaluation and registration forms and of a Student Organizer's forms.

**Main flow:**

1. The person selects up to 200 responses and confirms.
2. The system deletes them and audits their references.

**Exceptions:**

- E1. Draft copies are not removed by this.

**Postconditions:** The selected responses are gone for good.

**Traces to:** FR-4.12.7, FR-4.12.4

## L. Student Portal and team copies

### UC-110 — Answer an assigned survey

**Actors:** Student Organizer

**Goal:** Complete a survey the Office or a unit assigned.

**Preconditions:** A survey published to the Student Portal and open.

**Main flow:**

1. The Student Organizer opens Assignments and chooses a pending survey.
2. The Student Organizer agrees to the privacy statements and fills it in, as in UC-102.
3. The system links the response to the account and returns the reference.
4. Assignments shows it as answered.

**Alternative flows:**

- A1. The survey closes unanswered: it leaves the list.

**Exceptions:**

- E1. A second answer from the same account: refused.

**Postconditions:** The response is stored and shown as answered.

**Traces to:** FR-4.13.1

### UC-111 — Build a team copy

**Actors:** Student Organizer

**Goal:** Start a project's proposal or terminal report.

**Preconditions:** Student Organizer is the active role, and the form is open on the Portal.

**Main flow:**

1. The Student Organizer opens Project Proposals or Terminal Reports and chooses a form.
2. The Student Organizer names the copy after the project, up to 80 characters.
3. The Student Organizer chooses "anyone with the link" or named people, up to 30 valid emails.
4. The system creates a draft with the form's next reference, a 128-bit link token and the owner.
5. The system shows an editable link and QR code to forward.

**Alternative flows:**

- A1. No form of that kind is on the Portal, for example a terminal report the Office has not issued: nothing can be built yet.

**Exceptions:**

- E1. Not a Student Organizer: refused.
- E2. Over 20 copies per network per form per hour, or 40 per account per day: refused.

**Postconditions:** The copy is in the Student Organizer's list. Copies other people added them to are reached by link, not listed.

**Traces to:** FR-4.13.4

### UC-112 — Fill in a team copy together

**Actors:** Team copy collaborator, Student Organizer

**Goal:** Complete a copy as a team, live.

**Preconditions:** A draft copy, and the person may open it.

**Main flow:**

1. The person opens the copy's link and agrees to the privacy notice on that device.
2. The person fills in questions and sees who is on which one.
3. The system broadcasts changes in real time, saves after typing pauses and merges by question.

**Alternative flows:**

- A1. The live channel drops: the page falls back to polling.
- A2. Two people change the same question: the last save wins.

**Exceptions:**

- E1. The copy has been sent: changes are refused and a receipt shows.
- E2. Access was removed: the next save or pulse is refused.

**Postconditions:** The team's answers are saved on one draft.

**Traces to:** FR-4.13.5

### UC-113 — Enter a private copy, or ask for access

**Actors:** Team copy collaborator, with Google as a supporting system

**Goal:** Reach a private copy.

**Preconditions:** A private copy's link.

**Main flow:**

1. The person opens the link.
2. The system asks for proof: a Hub account or Google sign-in.
3. The person's email is on the copy, and the copy opens.

**Alternative flows:**

- A1. The email is not on it: the person chooses to request access, and the page says access was requested until the owner answers.
- A2. Not signed in to the Hub: the person may try another Google account.

**Exceptions:**

- E1. Already asked, or 20 requests are waiting: no further request is taken.

**Postconditions:** The person is in, or waiting. Form-only verification grants no Hub access, and a Hub account always takes precedence over a form's Google sign-in.

**Traces to:** FR-4.13.6

### UC-114 — Answer a request for access to my copy

**Actors:** Student Organizer

**Goal:** Decide who joins a private copy.

**Preconditions:** The person owns the copy, and someone has asked.

**Main flow:**

1. The owner opens the copy's "Asking for access" list.
2. The owner chooses Allow or Decline.
3. Allow adds the person to the copy.

**Exceptions:**

- E1. Not the owner: refused.

**Postconditions:** The person is added, or the request is closed.

**Traces to:** FR-4.13.6

### UC-115 — Rename a copy or change its sharing

**Actors:** Student Organizer

**Goal:** Control who can reach a copy.

**Preconditions:** The person owns the copy.

**Main flow:**

1. The owner opens sharing, and changes the name, the access mode or the members.
2. The system saves this. A change to who can open it moves the copy to a new live channel.

**Exceptions:**

- E1. Over 30 members or an invalid email: refused.
- E2. Not the owner: refused.

**Postconditions:** The new sharing applies at once.

**Traces to:** FR-4.13.6

### UC-116 — Replace a copy's link

**Actors:** Student Organizer

**Goal:** Shut out a link that spread too far.

**Preconditions:** The person owns the copy.

**Main flow:**

1. The owner chooses to replace the link.
2. The system issues a new token and shows the new link and QR code.

**Postconditions:** The old link and QR code stop working. The answers are unchanged.

**Traces to:** FR-4.13.6

### UC-117 — Send a team copy

**Actors:** Team copy collaborator, Student Organizer

**Goal:** Submit the finished copy.

**Preconditions:** A draft copy, open form, and the person may open it.

**Main flow:**

1. The person agrees to the current privacy notice and chooses Send.
2. The page flushes pending changes.
3. The server validates all the answers and converts only the version it checked.
4. The copy becomes a received response under the same reference.
5. Open pages switch to a receipt.

**Exceptions:**

- E1. An answer fails: the field is flagged.
- E2. A teammate changed something during sending: the person is asked to check and send again.
- E3. Already sent: refused.
- E4. Form limits apply as in UC-102.

**Postconditions:** A sent response exists. Editing and resending a returned copy is not built.

**Traces to:** FR-4.13.7

### UC-118 — Track a sent copy

**Actors:** Team copy collaborator, Student Organizer

**Goal:** See how the review is going.

**Preconditions:** A sent copy.

**Main flow:**

1. The person opens the copy's link, or the owner opens it from their list.
2. The system shows what was sent, the sign-off standing and any decision note.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.13.7, FR-4.5.3

### UC-119 — Run my own evaluation or registration form

**Actors:** Student Organizer

**Goal:** Collect and use responses for my organization's event.

**Preconditions:** The Student Organizer owns a form.

**Main flow:**

1. The Student Organizer builds and publishes it (UC-097, UC-098).
2. The Student Organizer shares its link and QR code, and respondents answer (UC-102).
3. The Student Organizer reads and exports responses (UC-107, UC-108).

**Alternative flows:**

- A1. A test response needs removing: only the Office can do that.

**Postconditions:** The responses are stored, and the Office can read them too because the form is out of draft.

**Traces to:** FR-4.13.2, FR-4.12.4

## M. Reports

### UC-120 — Build a report

**Actors:** Office Administrator

**Goal:** See a management view of the data.

**Preconditions:** `reports: view`, the `reports` feature on and access to the Office workspace.

**Main flow:**

1. The administrator opens Reports and chooses Rankings, Evidence, Risks or Action plan. Unit participation is exported from the Units page.
2. The administrator searches, or filters by what that report offers: ranking, unit, indicator, SDG, status, quality or plan status.
3. The system shows the report, limited to the viewer's scope.

**Postconditions:** Nothing changes. Coordinators, Unit Administrators and External guests hold `reports: view` but have no Reports page in the Portal.

**Traces to:** FR-4.14.1

### UC-121 — Export a report as CSV

**Actors:** Office Administrator

**Goal:** Take a report out of the Hub under the data rules.

**Preconditions:** `reports: export`.

**Main flow:**

1. On the report, the administrator chooses Export.
2. The system checks each dataset's classification and export policy.
3. The system builds the CSV, adds a watermark where required and audits the export.

**Alternative flows:**

- A1. A Confidential dataset without a grant or `governance: manage`: the system refuses and offers a data access request (UC-077).
- A2. Four or more exports in ten minutes: the system raises an alert.

**Exceptions:**

- E1. Blocked or Restricted data: refused, audited, and a security alert is raised.

**Postconditions:** The person has the file, or a request is underway.

**Traces to:** FR-4.14.2

### UC-122 — Print a report or save it as PDF

**Actors:** Office Administrator

**Goal:** Get a paper or PDF copy.

**Preconditions:** The report is on screen.

**Main flow:**

1. The administrator chooses Print or PDF.
2. The browser's own print window opens.

**Postconditions:** This does not pass through the export checks, carries no watermark and is not audited as an export.

**Traces to:** FR-4.14.3

### UC-123 — Request a report's release

**Actors:** Office Administrator

**Goal:** Record an approved release outside the Office.

**Preconditions:** `reports: create`.

**Main flow:**

1. On the report, the administrator enters who it is for.
2. The system opens a publication request (UC-150).

**Alternative flows:**

- A1. The workflow is off or too few other approvers exist: the system releases it directly, with no justification needed, and records why.

**Exceptions:**

- E1. A justification under 10 characters when approval applies: refused.

**Postconditions:** A request or released-report record exists, which guests see among published reports. It creates no public document.

**Traces to:** FR-4.14.4, FR-4.20.3

## N. Administration: overview and accounts

### UC-124 — Check the Administration overview

**Actors:** Office Administrator

**Goal:** See system health and go to a section.

**Preconditions:** The person can view at least one Administration module.

**Main flow:**

1. The administrator opens Administration.
2. The system shows system health and statistics, and the sections the person may use.
3. The administrator opens a section.

**Postconditions:** Nothing changes.

**Traces to:** FR-4.3.1

### UC-125 — Invite an account

**Actors:** Office Administrator

**Goal:** Give someone access without a request form.

**Preconditions:** `accounts: create` over the unit. For an outside person, `accounts: manage`, guest sign-in on and a future end date.

**Main flow:**

1. In Accounts, the administrator chooses Invite.
2. In Profile, the administrator enters the person's names and salutation.
3. In Affiliation, the administrator chooses UST, with a role and unit on a UST email, or an outside affiliation on a non-University email.
4. In Access, the administrator sets scope and any end date.
5. The system creates a Pending Invitation account with its assignment, and shows a toast.

**Alternative flows:**

- A1. The person is a Student Organizer: any unit scope is ignored, and the account is kept with the Office.

**Exceptions:**

- E1. The email already has an account: refused.
- E2. The inviter would grant beyond their own authority: refused.

**Postconditions:** The account activates at first sign-in. No invitation email is actually sent, so the person must be told by other means.

**Traces to:** FR-4.16.1

### UC-126 — Re-send or cancel an invitation

**Actors:** Office Administrator

**Goal:** Follow up on someone who has not signed in.

**Preconditions:** A Pending Invitation account.

**Main flow:**

1. The administrator opens the account and chooses Re-send.
2. The system updates the invitation date and audits it.

**Alternative flows:**

- A1. Cancel the invitation: the account is deactivated, with a reason.

**Postconditions:** The date is updated. No email leaves the system.

**Traces to:** FR-4.16.1, FR-4.16.2

### UC-127 — Suspend, reactivate or deactivate an account

**Actors:** Office Administrator

**Goal:** Control whether someone can sign in.

**Preconditions:** Account rights over the account, and it is not the administrator's own.

**Main flow:**

1. The administrator opens the account and chooses the new status, giving a reason.
2. The system saves it, ends the account's sessions if it is no longer Active and audits it.

**Alternative flows:**

- A1. Reactivating needs no reason, and restarts the inactivity clock.

**Exceptions:**

- E1. The administrator's own account: refused.
- E2. A reason outside 5 to 300 characters: refused.
- E3. This would remove the last active University-wide Administrator: refused.
- E4. A pending account cannot be activated by hand: it activates by signing in.

**Postconditions:** The new status applies at the next request.

**Traces to:** FR-4.16.2

### UC-128 — Update an account's details

**Actors:** Office Administrator

**Goal:** Correct a person's name or title.

**Preconditions:** `accounts: edit` over the account.

**Main flow:**

1. The administrator edits the name or title and saves.
2. The system saves and audits it.

**Exceptions:**

- E1. A name under 3 characters: refused.

**Postconditions:** The account is updated.

**Traces to:** FR-4.16.3

### UC-129 — Transfer an account to another unit

**Actors:** Office Administrator

**Goal:** Reflect someone moving between offices.

**Preconditions:** `accounts: edit` over the account, and an active destination within the administrator's units.

**Main flow:**

1. The administrator chooses the destination, and whether to move scopes too.
2. The system moves the account, keeps earlier submissions with the old unit, removes coordinator designations there and audits it.

**Exceptions:**

- E1. An inactive destination, or one outside the administrator's units: refused.

**Postconditions:** The account belongs to the new unit, and the old unit keeps its history.

**Traces to:** FR-4.16.3

### UC-130 — End an account's sessions or force re-authentication

**Actors:** Office Administrator

**Goal:** React to a lost device or a change in risk.

**Preconditions:** An Active account the administrator may edit.

**Main flow:**

1. The administrator chooses Sign out everywhere, or Require sign-in again.
2. The system applies it and audits it.

**Postconditions:** The person is signed out, or must sign in again, on the next request.

**Traces to:** FR-4.16.3, FR-4.2.3

### UC-131 — Add a role to an account

**Actors:** Office Administrator

**Goal:** Give someone another or higher role.

**Preconditions:** `accounts` rights over the account, and it is not the administrator's own.

**Main flow:**

1. On the account's Roles tab, the administrator chooses a role, scope, end date and note.
2. The system checks the scope, adds the assignment and audits it.

**Alternative flows:**

- A1. Raising an active account above its tier, with the privilege-escalation workflow applying: a request opens (UC-150).

**Exceptions:**

- E1. Invalid units, datasets or cycles, an end date in the past, or a duplicate: refused.
- E2. An external account given anything but External, or External with no end date: refused.
- E3. The administrator's own roles: refused.

**Postconditions:** The assignment exists or a request is pending.

**Traces to:** FR-4.16.4

### UC-132 — Remove a role from an account

**Actors:** Office Administrator

**Goal:** End a role someone no longer holds.

**Preconditions:** `accounts` rights over the account, and it is not the administrator's own.

**Main flow:**

1. On the Roles tab, the administrator removes the assignment.
2. The system removes it and audits it.

**Exceptions:**

- E1. This would remove the last University-wide Administrator: refused.

**Postconditions:** The assignment is gone, and permissions recompute.

**Traces to:** FR-4.16.4

### UC-133 — Review inactive accounts

**Actors:** Office Administrator

**Goal:** Decide what to do with accounts no one uses.

**Preconditions:** Account rights, and accounts idle past the policy (default 90 days).

**Main flow:**

1. In Accounts, the administrator sees the flagged accounts.
2. The administrator chooses to keep one active, and the system records this and restarts its clock.

**Alternative flows:**

- A1. The administrator suspends or deactivates it instead (UC-127).

**Postconditions:** The decision is audited.

**Traces to:** FR-4.16.6

### UC-134 — Look at access requests with domain evidence

**Actors:** Office Administrator

**Goal:** Judge whether an applicant is who they say.

**Preconditions:** Account or workflow rights, and a pending account-access request.

**Main flow:**

1. In Accounts, the administrator opens the Access requests tab, filtering by unit or role if needed.
2. The system compares the email and website with domains known for the affiliation, and shows a verdict: university, match, mismatch, personal or unknown.
3. The administrator opens the request, and decides it (UC-150).

**Postconditions:** Nothing changes until the decision. The tracker shows every pending request as Under review; the `request.review` command exists, but no current screen calls it.

**Traces to:** FR-4.16.5

## O. Administration: roles and directory

### UC-135 — Review or change what a role may do

**Actors:** Office Administrator

**Goal:** See and adjust role permissions.

**Preconditions:** `roles: view`; `roles: edit` to change them.

**Main flow:**

1. In Roles & Permissions, the administrator reads each role's fingerprint and who holds it.
2. The administrator opens a role, chooses unit or University scope, and changes actions in the matrix.
3. The system normalizes the set, saves it and audits each action granted or removed.

**Exceptions:**

- E1. An unknown module or action: refused.
- E2. Someone else changed it during editing: refused.
- E3. Removing the Office's own authority over roles: it cannot be removed.

**Postconditions:** The new permissions apply on each person's next request.

**Traces to:** FR-4.3.3, FR-4.17.1

### UC-136 — Create a unit

**Actors:** Office Administrator

**Goal:** Add a college, office, department, programme or research centre.

**Preconditions:** `directory: create` under an active parent.

**Main flow:**

1. In Organizational Directory, the administrator chooses Add unit.
2. The administrator enters the name, code, kind, parent, up to 6 emails, a logo and a justification.
3. With the workflow applying, the system opens a request. Otherwise it creates the unit and audits it.

**Exceptions:**

- E1. A name outside 3 to 120 characters, or a code not matching `^[A-Z0-9][A-Z0-9-]{1,15}$` or already taken: refused.
- E2. An inactive parent, or a logo that is not PNG or JPG up to 2 MB: refused.

**Postconditions:** The unit exists, or a request is pending (UC-150).

**Traces to:** FR-4.18.1

### UC-137 — Update a unit's details and logo

**Actors:** Office Administrator

**Goal:** Keep a unit's name, code, emails and logo correct.

**Preconditions:** `directory: edit` over the unit.

**Main flow:**

1. In the Directory or the unit profile's settings, the administrator changes the details or uploads a logo.
2. The system validates and saves them, and adds to the unit's history.

**Exceptions:**

- E1. An archived unit: it must be reactivated first.

**Postconditions:** The unit is updated everywhere it shows, and its history is kept.

**Traces to:** FR-4.18.2

### UC-138 — Designate a unit's coordinators

**Actors:** Office Administrator

**Goal:** Say who coordinates a unit.

**Preconditions:** `directory: edit` over the unit.

**Main flow:**

1. In the unit profile's settings, the administrator adds or removes a coordinator.
2. The system saves it and audits it.

**Exceptions:**

- E1. A deactivated account: refused.

**Postconditions:** The list of coordinators is updated.

**Traces to:** FR-4.18.2

### UC-139 — Move a unit in the hierarchy

**Actors:** Office Administrator

**Goal:** Reflect a reorganization.

**Preconditions:** Directory management rights.

**Main flow:**

1. The administrator chooses Move and a new parent.
2. The system moves the unit and audits it.

**Exceptions:**

- E1. The University root, or moving a unit beneath itself: refused.

**Postconditions:** The hierarchy and any scopes derived from it follow the move.

**Traces to:** FR-4.18.3

### UC-140 — Archive or reactivate a unit

**Actors:** Office Administrator

**Goal:** Retire a unit without deleting it, or bring it back.

**Preconditions:** Directory management rights.

**Main flow:**

1. The administrator chooses Archive and gives a reason.
2. The system warns of people remaining, archives the unit and those beneath it, and audits it.

**Alternative flows:**

- A1. Reactivate: the parent must be active first.

**Exceptions:**

- E1. The University root: refused.
- E2. A reason under 5 characters: refused.
- E3. A merged unit cannot be reactivated.

**Postconditions:** The unit no longer accepts new work, and its history stays.

**Traces to:** FR-4.18.3

### UC-141 — Merge one unit into another

**Actors:** Office Administrator

**Goal:** Combine units.

**Preconditions:** Directory management rights.

**Main flow:**

1. The administrator chooses Merge, a target and a reason.
2. The system moves child units and people to the target, and keeps earlier submissions credited to the merged unit.
3. The system audits it.

**Exceptions:**

- E1. The University root, or merging beneath itself: refused.
- E2. A reason under 5 characters: refused.

**Postconditions:** The merged unit can't be reactivated, and its record remains.

**Traces to:** FR-4.18.3

## P. Administration: data governance

### UC-142 — Update a dataset's governance details

**Actors:** Office Administrator

**Goal:** Keep ownership, classification, retention and export policy correct.

**Preconditions:** `governance: edit` over the dataset; `governance: manage` to reclassify.

**Main flow:**

1. In Data Governance, the administrator opens a dataset and changes its fields, with a justification when reclassifying.
2. The system applies the side effects. Restricted forces export to Blocked. Confidential moves Allowed to Approval required.
3. The system increments the version with a note and audits it.

**Alternative flows:**

- A1. A results or stories dataset leaves Public: its public surfaces are hidden.

**Exceptions:**

- E1. A locked dataset, personal data set to Public, or a reclassification justification under 10 characters: refused.
- E2. An inactive steward or owner, or retention outside 1 to 50 years: refused.

**Postconditions:** The dataset's new rules apply to exports and public pages.

**Traces to:** FR-4.19.1

### UC-143 — Add a dataset version note

**Actors:** Office Administrator

**Goal:** Record that a dataset has changed.

**Preconditions:** `governance: edit` over the dataset.

**Main flow:**

1. The administrator adds a version note.
2. The system increments the version and audits it.

**Postconditions:** The version history is updated.

**Traces to:** FR-4.19.1

### UC-144 — Run data quality rules

**Actors:** Office Administrator

**Goal:** Find records that break the rules.

**Preconditions:** `governance: view` to run; `governance: edit` to switch a rule on or off.

**Main flow:**

1. The administrator opens the quality rules and runs them, turning a rule on or off if needed.
2. The system runs the nine seeded rules, including reporting period, attached source, stated beneficiaries, indicator mapping and duplicates.
3. The system shows Passing, Warning or Failing with the records to fix.

**Postconditions:** Results are recorded. The period rule's 2025 window is fixed in code.

**Traces to:** FR-4.19.2

### UC-145 — Resolve likely duplicate evidence

**Actors:** Office Administrator

**Goal:** Decide whether two near-identical records are the same.

**Preconditions:** Governance edit rights over evidence, or `evidence: approve`, and a pair from one unit with title similarity of at least 0.86.

**Main flow:**

1. The steward opens the pair.
2. The steward chooses Merge and the record to keep, or Dismiss.
3. Merge marks the other record Not applicable and adds a comment. The decision is audited.

**Exceptions:**

- E1. The pair is no longer a likely duplicate: refused.

**Postconditions:** The decision is recorded.

**Traces to:** FR-4.19.3

### UC-146 — Maintain the data dictionary

**Actors:** Office Administrator

**Goal:** Keep term definitions correct.

**Preconditions:** Governance edit rights over the dataset, or `knowledge: edit`.

**Main flow:**

1. The administrator edits a term's definition, unit of measure, steward or dataset.
2. The system validates, saves and audits it.

**Exceptions:**

- E1. A definition outside 10 to 600 characters, or a unit of measure over 40: refused.

**Postconditions:** The term is updated, including in the Knowledge Center.

**Traces to:** FR-4.19.4

### UC-147 — Run a retention review

**Actors:** Office Administrator

**Goal:** See which dataset versions are past retention.

**Preconditions:** `governance: manage`.

**Main flow:**

1. The administrator runs the review.
2. The system lists the versions past their retention.

**Postconditions:** The list is produced. Nothing is disposed of; that remains a manual step outside the Hub.

**Traces to:** FR-4.19.5

## Q. Administration: approval workflows

### UC-148 — Configure an approval workflow

**Actors:** Office Administrator

**Goal:** Set how a kind of change gets approved.

**Preconditions:** `workflows: manage`.

**Main flow:**

1. In Approval Workflows, the administrator chooses one of the six workflows: account access, privilege escalation, new units, data access, publication or destructive backup operations.
2. The administrator changes its on/off state, response time, separation of duties or steps.
3. The system validates, saves and audits it.

**Exceptions:**

- E1. A response time outside 1 to 30 days, no steps, over 5 steps or an unnamed step: refused.
- E2. Switching destructive operations off, or removing their separation of duties: refused.

**Postconditions:** The workflow applies to requests opened from now on.

**Traces to:** FR-4.20.1

### UC-149 — Open an approval request

**Actors:** Office Administrator

**Goal:** Ask for an account, a role or data access through approval.

**Preconditions:** The workflow is on, and the person may ask for this.

**Main flow:**

1. In Approval Workflows, the person starts a new request: Access to a dataset, A role for someone, or An account for someone.
2. The person fills in the details and a justification.
3. The system checks the request by kind, opens it with its due date, audits it and notifies the Office.

**Exceptions:**

- E1. A justification under 10 characters, or the workflow is switched off: refused.
- E2. An Administrator role requested as an account: refused; use "A role for someone".
- E3. A unit, account or dataset beyond the person's rights: refused.

**Postconditions:** A pending request exists (RQ-####).

**Traces to:** FR-4.20.4

### UC-150 — Decide an approval request

**Actors:** Office Administrator

**Goal:** Approve or reject a change waiting on me.

**Preconditions:** `workflows: approve`, and a pending request at a step the person may decide.

**Main flow:**

1. The approver opens "Waiting for you" and a request, and reads its details and justification.
2. The approver chooses Approve, with an optional note. For an account with no unit, they choose the unit.
3. If more steps remain, the request moves on to the next step.
4. On the last step, the system revalidates and applies the change: creating an account, adding a role, creating a unit, granting data access, publishing, or scheduling a backup operation.
5. The system notifies the requester and audits it.

**Alternative flows:**

- A1. Reject: the approver writes a note, the request closes and a waiting post or document returns to its earlier state.

**Exceptions:**

- E1. The approver is the requester, with separation on: refused and audited.
- E2. The approver approved an earlier step: refused.
- E3. The request is closed: refused.
- E4. The change no longer applies, for example the email now has an account or the unit is no longer active: refused with the reason, and the request stays open.

**Postconditions:** The request has a decision history, and the change is applied only on final approval.

**Traces to:** FR-4.20.2, FR-4.16.5

### UC-151 — Withdraw a pending request

**Actors:** Office Administrator

**Goal:** Cancel a request no longer needed.

**Preconditions:** The person is the requester or holds `workflows: manage`, and the request is pending.

**Main flow:**

1. The person chooses Withdraw.
2. The system closes it as Cancelled, returns any waiting post or document to its earlier state and audits it.

**Exceptions:**

- E1. Not pending: refused.
- E2. Neither requester nor manager: refused and audited.

**Postconditions:** The request is closed. An applicant sees Withdrawn on the tracker.

**Traces to:** FR-4.20.4

## R. Administration: privacy, security and audit

### UC-152 — Change a security policy

**Actors:** Office Administrator

**Goal:** Set sign-in, session, lockout, inactivity, export, sharing and privacy-contact rules.

**Preconditions:** `security: edit`. Turning multi-factor off and changing single sign-on also need `security: manage`.

**Main flow:**

1. In Privacy & Security, the administrator edits a policy section and saves.
2. The system validates and saves it, audits it and raises a low-severity alert.

**Exceptions:**

- E1. Idle outside 5 to 240 minutes, absolute outside 1 to 24 hours, a warning not shorter than idle, lockout outside 3 to 20 failures in 5 to 120 minutes, inactivity outside 30 to 365 days, breach escalation outside 1 to 72 hours, or no valid sign-in domain: refused.
- E2. Restricted data not blocked from export: refused.

**Postconditions:** The policy is stored. Session and export rules take effect. Lockout and multi-factor settings are stored but not enforced.

**Traces to:** FR-4.21.1

### UC-153 — Run an access review

**Actors:** Office Administrator

**Goal:** Recertify who should keep access.

**Preconditions:** `security: manage` to start and complete; `security: edit` to decide.

**Main flow:**

1. The administrator starts a review with a name, population (privileged, external or all) and future due date.
2. Reviewers record Keep or Revoke per account.
3. When all decisions are in, the administrator completes it.
4. The system suspends revoked accounts, ends their sessions and audits it.

**Exceptions:**

- E1. Recertifying your own access: refused.
- E2. Completing with decisions missing: refused.

**Postconditions:** The review is complete, and revoked accounts can no longer sign in.

**Traces to:** FR-4.21.2

### UC-154 — Record a privacy assessment

**Actors:** Office Administrator

**Goal:** Keep a register of privacy assessments.

**Preconditions:** `security: edit`.

**Main flow:**

1. The administrator adds or edits an assessment with its name, dataset, risk, status and measures.
2. The system saves it with a reference (PIA-##) and audits it.

**Exceptions:**

- E1. Safeguards under 10 characters: refused.

**Postconditions:** The register is updated.

**Traces to:** FR-4.21.3

### UC-155 — Handle a data subject request

**Actors:** Office Administrator

**Goal:** Log and follow a person's privacy request.

**Preconditions:** `security: edit`.

**Main flow:**

1. The administrator records its type, a description of the subject without naming them, and the date received.
2. The system assigns DSR-### and sets a response date 30 days after receipt.
3. The administrator updates its status and notes as it progresses.

**Exceptions:**

- E1. A received date in the future, or an unknown type: refused.

**Postconditions:** The request is tracked. Acting on it, such as exporting or erasing data, happens separately.

**Traces to:** FR-4.21.3

### UC-156 — Acknowledge or resolve a security alert

**Actors:** Office Administrator

**Goal:** Handle what the system raised.

**Preconditions:** `security: edit` and an alert.

**Main flow:**

1. The administrator reads the alert: for example an unusual export, a new device or an incident escalation.
2. The administrator acknowledges or resolves it.
3. The system saves and audits it.

**Postconditions:** The alert's status is updated.

**Traces to:** FR-4.21.4

### UC-157 — Report and manage an incident

**Actors:** Office Administrator

**Goal:** Log an incident and its timeline.

**Preconditions:** `security: view` to report; `security: edit` to update.

**Main flow:**

1. The administrator reports an incident with a title, severity, personal-data flag and note.
2. The system assigns INC-###.
3. The administrator updates its status through Reported, Investigating, Escalated, Contained and Closed, each with a note.

**Alternative flows:**

- A1. Personal data is involved: the system raises an alert naming the escalation deadline.

**Exceptions:**

- E1. A title under 6 characters, or a timeline note under 3: refused.

**Postconditions:** The register holds the incident and its timeline.

**Traces to:** FR-4.21.4

### UC-158 — Record a key rotation

**Actors:** Office Administrator

**Goal:** Note when a secret was rotated.

**Preconditions:** `security: manage`.

**Main flow:**

1. The administrator chooses to record a rotation for a secret.
2. The system updates its date and audits it.

**Postconditions:** The date changes. The real credential does not; it has to be rotated at its provider.

**Traces to:** FR-4.21.5

### UC-159 — Search the audit trail

**Actors:** Office Administrator

**Goal:** Find out who did what.

**Preconditions:** `audit: view`.

**Main flow:**

1. In Audit Logs, the administrator searches and filters, including by time period.
2. The administrator opens an entry to read its time, actor, role, action, category, resource, outcome and detail.

**Postconditions:** Nothing changes. Entries cannot be edited, and ordinary invalid input is not logged.

**Traces to:** FR-4.21.6

### UC-160 — Verify the audit chain

**Actors:** Office Administrator

**Goal:** Check that the log has not been tampered with.

**Preconditions:** `audit: view`.

**Main flow:**

1. The administrator chooses Verify.
2. The system checks the hash chain and reports the result.

**Alternative flows:**

- A1. The chain breaks: the system reports where.

**Postconditions:** The result is shown.

**Traces to:** FR-4.21.7

### UC-161 — Export audit entries

**Actors:** Office Administrator

**Goal:** Hand audit records to someone.

**Preconditions:** `audit: export`.

**Main flow:**

1. The administrator filters the log and chooses Export.
2. The system builds a CSV of up to 10,000 entries, neutralizes spreadsheet formula characters and audits the export.

**Postconditions:** The person has the file.

**Traces to:** FR-4.21.7

## S. Administration: system configuration

### UC-162 — Manage ranking bodies and tracked rankings

**Actors:** Office Administrator

**Goal:** Decide which bodies and rankings the Hub follows and shows.

**Preconditions:** `config: edit`.

**Main flow:**

1. In System Configuration, the administrator adds a body or switches one on or off.
2. The administrator sets each ranking as tracked or public.
3. The system saves and audits it.

**Alternative flows:**

- A1. A body is switched off: its rankings leave the workspaces and public site, and nothing is deleted.

**Exceptions:**

- E1. A name under 3 characters, a short name under 2, a non-`https` website or a repeated name: refused.

**Postconditions:** Navigation, the public site and search follow the change.

**Traces to:** FR-4.22.1

### UC-163 — Manage cycles and academic years

**Actors:** Office Administrator

**Goal:** Keep reporting cycles and years up to date.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator adds a cycle or year, written as `2027–2028`, or changes a cycle's status.
2. The system validates, saves and audits it.

**Exceptions:**

- E1. Non-consecutive years or a duplicate: refused.
- E2. Changing the Current cycle before another is made current: refused.

**Postconditions:** Cycle choices are updated across the Hub.

**Traces to:** FR-4.22.2

### UC-164 — Manage reporting periods

**Actors:** Office Administrator

**Goal:** Control which periods accept evidence.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator adds a period or changes one's label, note or whether it accepts evidence.
2. The system validates, saves and audits it.

**Exceptions:**

- E1. A label outside 4 to 60 characters or repeated: refused.
- E2. Closing the last open period: refused.

**Postconditions:** Submit evidence offers only the accepting periods.

**Traces to:** FR-4.22.3

### UC-165 — Set upload limits

**Actors:** Office Administrator

**Goal:** Decide what files people may upload.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator sets the size per file, the number of files and the allowed types.
2. The system validates, saves and audits it.

**Exceptions:**

- E1. A size outside 1 to 200 MB, a count outside 1 to 50, or a type not on the list: refused.

**Postconditions:** Evidence and Workspace uploads follow the new limits.

**Traces to:** FR-4.22.4

### UC-166 — Edit notification templates

**Actors:** Office Administrator

**Goal:** Set the wording of notices, and whether they go out.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator edits a template's subject and body, or switches it on or off.
2. The system validates, saves and audits it.

**Exceptions:**

- E1. A missing subject or one over 160 characters, or a body outside 10 to 1,000 characters: refused.

**Postconditions:** Later notices use the new wording. A disabled template produces nothing.

**Traces to:** FR-4.22.5

### UC-167 — Set dashboard defaults

**Actors:** Office Administrator

**Goal:** Set what the Office sees first.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator sets the opening view, clock display and deadline warning.
2. The system saves and audits it.

**Exceptions:**

- E1. A deadline warning outside 3 to 90 days: refused.

**Postconditions:** The dashboard follows the defaults.

**Traces to:** FR-4.22.6

### UC-168 — Switch features and staged flags

**Actors:** Office Administrator

**Goal:** Turn parts of the Hub on or off.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator switches a feature on or off by area, or sets a staged flag to Off, Selected or Everyone.
2. The system saves and audits it.

**Alternative flows:**

- A1. A switched-off feature's page shows "switched off", or Not Found on the public site.

**Exceptions:**

- E1. A Selected flag naming no people or units: refused.

**Postconditions:** The features follow the switch. Of the four flags, only `reuse-insights` changes behaviour.

**Traces to:** FR-4.22.7

### UC-169 — Set the site notice

**Actors:** Office Administrator

**Goal:** Announce something across the Hub.

**Preconditions:** `config: edit`.

**Main flow:**

1. The administrator writes the notice and switches it on.
2. The system saves and audits it, and the banner appears (UC-009).

**Exceptions:**

- E1. Over 240 characters, or under 6 when switching on: refused.

**Postconditions:** The banner shows across the public site and workspaces until switched off.

**Traces to:** FR-4.22.8

## T. Administration: backup and recovery

### UC-170 — Run a backup

**Actors:** Office Administrator

**Goal:** Create a recovery point now.

**Preconditions:** `backup: manage`, and storage configured.

**Main flow:**

1. In Backup & Recovery, the administrator runs a backup.
2. The system creates a point (RP-####), writes a compressed snapshot to private storage with a checksum and audits it.

**Postconditions:** A recovery point exists. It excludes the audit trail, live sign-ins, uploaded media and form responses.

**Traces to:** FR-4.23.1

### UC-171 — Verify a recovery point

**Actors:** Office Administrator

**Goal:** Check that a point can really be restored.

**Preconditions:** `backup: manage`, and a completed point.

**Main flow:**

1. The administrator chooses to test a point.
2. The system checks the file's integrity and records RT-###.

**Alternative flows:**

- A1. A sample point with no file: a catalogue check only.

**Exceptions:**

- E1. A failed point: refused.
- E2. A mismatch: the test is recorded as failed.

**Postconditions:** The test result is recorded.

**Traces to:** FR-4.23.2

### UC-172 — Set backup retention

**Actors:** Office Administrator

**Goal:** Decide how long recovery points are kept.

**Preconditions:** `backup: manage`.

**Main flow:**

1. The administrator sets the days for daily points and months for monthly copies, and the off-site copy setting.
2. The system validates, saves and audits it.

**Exceptions:**

- E1. Daily outside 7 to 365 days, or monthly outside 1 to 120 months: refused.

**Postconditions:** The settings are saved.

**Traces to:** FR-4.23.3

### UC-173 — Restore from or delete a recovery point

**Actors:** Office Administrator

**Goal:** Recover the Hub, or remove a point, with a second person agreeing.

**Preconditions:** `backup: manage`, and a second University-wide Administrator able to approve.

**Main flow:**

1. The administrator chooses Restore or Delete on a point and gives a justification.
2. The system opens a destructive-operation request.
3. A second administrator approves it (UC-150).
4. The system schedules and performs the operation.

**Exceptions:**

- E1. A justification under 10 characters, or a request already pending for that point: refused.
- E2. Restoring a failed or non-restorable point: refused.
- E3. There is no second administrator: the request waits, because this workflow never falls back to direct application.

**Postconditions:** The point is restored or deleted, after approval only.

**Traces to:** FR-4.23.4, FR-4.20.3

## U. System automation

### UC-174 — Check deadline sources daily

**Actors:** System automation

**Goal:** Notice changed ranking dates without anyone looking.

**Preconditions:** The daily schedule (22:00 UTC, 06:00 Manila) sends the correct bearer secret.

**Main flow:**

1. The schedule calls the daily job.
2. The system checks the secret in constant time.
3. The system runs the same check as UC-036, as the Hub itself.
4. The system returns a JSON summary and refreshes the pages.

**Exceptions:**

- E1. A missing or wrong secret: returns 401 and does nothing.
- E2. One part of the round fails: the other still runs.

**Postconditions:** Findings wait for the Office. No date changes by itself.

**Traces to:** FR-4.24.1, FR-4.6.5

### UC-175 — Send data request reminders and escalations

**Actors:** System automation

**Goal:** Chase what units owe.

**Preconditions:** An open data request.

**Main flow:**

1. In the daily job, the system computes each unit's standing.
2. Every `remindDays` while items are open, the system reminds the unit and records it.
3. Once a unit is `escalateDays` past due, the system tells the Office so the Director can follow up, and audits it.

**Postconditions:** Units and the Office have in-app notices. No email is sent.

**Traces to:** FR-4.24.1, FR-4.7.8

### UC-176 — Take weekly snapshots

**Actors:** System automation

**Goal:** Make sure trends always have something to compare against.

**Preconditions:** An active edition whose last snapshot is a week old or more.

**Main flow:**

1. In the daily job, the system finds such editions.
2. The system stores each report's summary and audits the count.

**Postconditions:** A new automatic snapshot exists.

**Traces to:** FR-4.24.1, FR-4.7.15

### UC-177 — Run housekeeping before a change

**Actors:** System automation

**Goal:** End what has expired, and clear what should not be kept.

**Preconditions:** A governed change is about to run.

**Main flow:**

1. The system expires role assignments, data grants and sessions past their dates.
2. The system removes the birthday and website from access requests closed about a month ago.
3. The system audits each removal.

**Postconditions:** Expired access is gone before the change applies.

**Traces to:** FR-4.24.2, FR-4.3.4, FR-4.2.8

### UC-178 — Count a post's anonymous views

**Actors:** System automation

**Goal:** Give editors view counts without identifying visitors.

**Preconditions:** A published post is actually visible on a visitor's screen.

**Main flow:**

1. The page sends the post's slug.
2. The system checks it, and counts it per Manila day using a hashed client key and a revisit window.

**Exceptions:**

- E1. A bot, crawler or preview; a badly formed slug; a post no longer visible; or over the hourly cap per client: not counted.

**Postconditions:** The daily count may grow by one (UC-090).

**Traces to:** FR-4.1.8

### UC-179 — Serve a stored file by its rule

**Actors:** System automation, Public visitor, Any signed-in user

**Goal:** Give a file only to people entitled to it.

**Preconditions:** A request for a `/media/...` path.

**Main flow:**

1. The system works out the kind of file.
2. Reference pictures are open. Post pictures, logos and PDFs are public only once published or in use. Evidence and Workspace files go only to permitted viewers.
3. The system returns a picture, or a sandboxed download.

**Exceptions:**

- E1. Anything not permitted: returns 404.

**Postconditions:** Nothing changes. Abandoned uploads are swept.

**Traces to:** FR-4.24.4

---

# Cases the system does not support yet

These are real situations a reader may expect, but no complete use case exists for them today. Describe them as future work, not delivered behaviour.

| Situation | What happens today | Related |
|---|---|---|
| Receiving an invitation, receipt, suspension or deadline email | No mail service is connected. "Re-send" only updates a date. | UC-125, UC-126, UC-010 |
| A second sign-in factor or account lockout enforced by the Hub | The policies can be saved, but neither is enforced. The Hub relies on Google's own 2-Step Verification. | UC-152 |
| The Office following up an assistance request in the Hub | The message is validated and discarded, and only the topic and urgency are kept. No conversation or resolution is tracked. | UC-076 |
| A Coordinator deleting or rewriting a submitted evidence record | Coordinators hold `evidence: delete`, but no such command exists. They can only respond to a revision. | UC-075 |
| Coordinators, Unit Administrators or External guests building reports | They hold `reports: view`, but Reports exists only in the Office workspace. Guests see only a list of released reports. | UC-120, UC-030 |
| Marking an access request "under review" | The command works on the server, but no current screen calls it. The tracker shows all pending requests as Under review. | UC-134, UC-013 |
| A Coordinator submitting reporting-period values, or proposing a story or innovation, through the older forms | `data.submit`, `story.propose` and `innovation.propose` work on the server, but no screen calls them. Data requests and unit Publications have replaced them. | UC-050, UC-083 |
| Editing a sent form response, or editing and resending a returned team copy | Not built. A returned copy shows its note and stays as sent. | UC-117, UC-118 |
| Deleting an abandoned team copy | Not built. Response removal skips drafts. | UC-109 |
| A file upload question on a form | Not built. | UC-097 |
| Form owners being alerted when a response arrives | Not built. They check the responses table. | UC-107 |
| A named adviser or dean signing in to sign off | Not built. An authorized reviewer records the name and decision. | UC-105 |
| Nominating or approving recognition awards | Not built. Named awards depend on presentation data. | UC-080, UC-005 |
| Disposing of data past retention | The review only lists what is due. | UC-147 |
| Rotating a real credential from the Hub | Only the date is recorded. | UC-158 |
| Applying export controls to printing | Print and PDF use the browser's own function, with no check or watermark. | UC-122 |
| Restoring uploaded media, form responses or the audit trail from a backup | Backups exclude them. They rely on the database and storage platforms. | UC-170 |
| Submitting data directly to QS, THE, UI GreenMetric or WURI | No connection exists. The Hub gathers, reviews and reports only. | UC-072, UC-038 |
| Switching the Hub's language | Not offered. The Hub is in English. | UC-026 |

Presentation mode (`NEXT_PUBLIC_DEMO_DATA`) shows sample data on some pages. It must be off in production, and sample figures must not be presented as findings. The temporary page `/zz-preview-posts` returns Not Found outside development.
