# UST Rankings Hub — Use Case Narratives

Prepared from the repository on 30 October 2026.

These narratives describe behavior traced through routes, components, permission rules, server actions, and command handlers. They describe the checked-out source, not a verified deployment. Feature flags, role permission overrides, organizational scope, published content, and configured services can change what is available. No live accounts, database contents, or external services were accessed for this review.

## Actors and boundaries

| Actor | Purpose and default authority |
| --- | --- |
| Public visitor | Reads public rankings, publications, recognition, and guidance without a Hub account. |
| Applicant | Requests a Hub account and tracks the decision. |
| Office Administrator | An Administrator with University-wide scope in the Rankings Office; oversees submissions, publishing, governance, and configuration. |
| Unit Administrator | Reads analytics and data for their office or college/faculty. This is not the same authority as an Office Administrator. |
| Coordinator | Gathers and submits their unit's evidence and stories, manages its workspace, and runs its forms. |
| Student secretary | A Student account representing a student organization, commission, or council; handles proposals, terminal reports, assigned surveys, evaluations, and registrations. |
| External guest | Has temporary, scoped, read-only access to approved resources. |
| Form respondent or collaborator | Answers a shared form or edits an admitted team copy; need not have a Hub account. Private copies require a recognized Google identity. |
| System automation | Checks deadline sources and maintains sessions and governance state. |

The four stored roles are Administrator, Coordinator, Student, and External. Reviewers, publishers, and governance managers below are responsibilities assigned through permissions, not additional built-in roles. An account acts through its selected active role; its other assignments do not automatically add their permissions. Students do not receive their unit's evidence, story, or Knowledge Center permissions by default. Office Administrators oversee unit contributions rather than filing them on a unit's behalf.

Source: [role catalog](../src/lib/governance/catalog.ts), [authorization context](../src/lib/governance/engine/core.ts), [form access rules](../src/lib/forms/access.ts).

## Narrative map

| Area | Use cases |
| --- | --- |
| Public information | UC-01–UC-04 |
| Access and personal settings | UC-05–UC-07 |
| Analytics and contributions | UC-08–UC-14 |
| Publishing and reporting | UC-15–UC-17 |
| Files and working documents | UC-18–UC-19 |
| Digital forms and student work | UC-20–UC-27 |
| Assistance and notifications | UC-28–UC-29 |
| Administration and governance | UC-30–UC-37 |

## UC-01 — Consult public ranking performance

**Primary actor:** Public visitor.

**Trigger and preconditions:** The visitor wants to understand UST's performance. The relevant ranking is enabled and available publicly under the Hub's configuration and data classification rules.

**Main flow:** The visitor opens Rankings, chooses a framework such as QS, THE, UI GreenMetric, or WURI, and reads the available result, trajectory, explanatory context, and associated dates. They move between framework pages to understand performance across rankings.

**Alternatives and exceptions:** A ranking excluded from public access is not offered as public content. Missing figures remain empty rather than establishing a result. Presentation figures may appear when demo mode is enabled.

**Outcome:** The visitor understands the public ranking information available without gaining access to internal evidence.

**Sources:** [public ranking route](../src/app/(public)/rankings/[slug]/page.tsx), [ranking detail](../src/components/site/rankings/RankingDetail.tsx), [public data assembly](../src/lib/governance/server/site.ts).

## UC-02 — Discover and read publications

**Primary actor:** Public visitor.

**Trigger and preconditions:** The visitor seeks a story, research article, or report. Public Publications is available and content has been published, or presentation content is enabled.

**Main flow:** The visitor chooses Stories & News, Research Articles, or Reports & Insights, uses the available search and filters, and opens an item. They read its narrative or abstract and metadata, follow its source or DOI, or access its PDF where provided. Document pages offer citation support.

**Alternatives and exceptions:** Unpublished material does not enter the public publication collection. A document may provide an external source instead of a local PDF.

**Outcome:** The visitor obtains published institutional information and can follow or cite its supporting source.

**Sources:** [publication routes](../src/app/(public)/publications), [publication views](../src/components/site/publications), [public document selection](../src/lib/governance/server/documents.ts).

## UC-03 — View recognition and institutional contributions

**Primary actors:** Public visitor; Office Administrator viewing internal recognition.

**Trigger and preconditions:** The actor wants to see contributions recognized by the Hub. The relevant public or internal recognition feature is enabled.

**Main flow:** The actor opens Recognition or the office dashboard's recognition view, then reviews available awards, improving rankings, contributing units, coordinators, innovations, and sustainability partnerships. Internal links lead to unit profiles where available.

**Alternatives and exceptions:** Empty categories show no results or are omitted. Named cycle awards and some achievement content currently depend on presentation data; the source does not establish an award nomination and approval workflow.

**Outcome:** The actor sees the recognition information and contribution summaries currently available.

**Sources:** [public recognition page](../src/components/site/pages/RecognitionPage.tsx), [internal recognition wall](../src/components/recognition/RecognitionWall.tsx), [merit calculations](../src/lib/merit.ts).

## UC-04 — Consult the Knowledge Center

**Primary actors:** Public visitor; signed-in user with Knowledge Center access.

**Trigger and preconditions:** The actor needs a definition, methodology, evidence standard, template, deadline, or policy. The selected Knowledge Center surface is available to them.

**Main flow:** The actor opens the Knowledge Center, navigates to the relevant section, searches the dictionary or templates where supported, and reads guidance or follows a resource. The calendar helps them identify upcoming ranking dates. Internal users open the center through Workspace.

**Alternatives and exceptions:** Public availability follows feature configuration. A Student's default permissions do not include the internal Knowledge Center. A resource can point outside the Hub.

**Outcome:** The actor obtains guidance for interpreting rankings or preparing contributions.

**Sources:** [public Knowledge Center](../src/components/site/pages/KnowledgePage.tsx), [workspace navigation](../src/components/shell/nav.ts), [dictionary](../src/components/site/pages/Dictionary.tsx).

## UC-05 — Request and track Hub access

**Primary actor:** Applicant. **Supporting actor:** Office approver.

**Trigger and preconditions:** A person needs an account and opens Request access from Sign in.

**Main flow:** The applicant supplies their identity and affiliation, agrees to the required declarations, and, for a Thomasian request, verifies their University Google email and selects the requested role and eligible unit. A student secretary identifies their organization. The system records the request and returns a reference. The applicant uses the tracker to see receipt, review, decision, and first sign-in progress. Approval creates the account and assignment.

**Alternatives and exceptions:** Invalid or duplicate requests are refused. External applicants follow the sponsored guest path, subject to guest policy and an access expiry. Rejection or withdrawal appears in tracking.

**Outcome:** Access is either pending, approved, rejected, or withdrawn, with a traceable reference.

**Sources:** [access request actions](../src/app/actions/session.ts), [request form](../src/components/signin/RequestAccessForm.tsx), [tracker rules](../src/lib/governance/request-tracker.ts), [approval application](../src/lib/governance/engine/requests.ts).

## UC-06 — Sign in and select an active role

**Primary actors:** Registered Administrator, Coordinator, Student secretary, or External guest.

**Trigger and preconditions:** The actor needs their workspace and has a registered account with an eligible, active assignment.

**Main flow:** The actor chooses Google sign-in and optionally Keep me signed in. After Google verifies their identity, the Hub checks registration, account status, domain and guest policy, and active assignments. It opens a Hub session and routes them to an allowed workspace. An actor with multiple assignments can select another active role, which updates the permissions and destination used for subsequent work.

**Alternatives and exceptions:** Unregistered, pending, suspended, deactivated, expired, or otherwise ineligible access is refused. Session expiry requires signing in again. Having a University email alone does not create Hub access.

**Outcome:** The actor operates within the workspace and scope of their active role.

**Sources:** [sign-in action](../src/app/actions/session.ts), [sign-in rules](../src/lib/governance/server/signin.ts), [active role action](../src/app/actions/profile.ts).

## UC-07 — Manage personal settings and signed-in devices

**Primary actor:** Signed-in account holder.

**Trigger and preconditions:** The actor wants to update their displayed details, notification preferences, or session behavior.

**Main flow:** The actor opens profile settings, edits allowed profile fields, and saves. They can adjust notification choices and personal idle and persistence settings within site policy. The devices view lists active sessions; they can end another device's session or all other sessions. They can also sign out or clear the current browser's cookies and sign out.

**Alternatives and exceptions:** Expired sessions cannot save changes. Personal session settings remain bounded by administrative policy. Ending the current session uses the sign-out flow.

**Outcome:** Personal preferences are saved or selected sessions end. An email preference does not itself establish outbound email delivery.

**Sources:** [profile settings](../src/components/shell/ProfileSettings.tsx), [profile actions](../src/app/actions/profile.ts), [session preference rules](../src/lib/governance/session-limits.ts).

## UC-08 — Monitor institution-wide submissions and ranking readiness

**Primary actor:** Office Administrator with the relevant viewing permissions.

**Trigger and preconditions:** The administrator needs to prioritize institutional work and has access to the executive dashboard and rankings.

**Main flow:** The administrator opens the dashboard, switches between submission and ranking views, and examines review workload, readiness, deadlines, and standings. They open a ranking, inspect indicators and linked evidence, and use its diagnostic view to examine the principal gap, definition, ownership, history, and available context. They follow links to contributions, units, or reports for further review.

**Alternatives and exceptions:** Disabled rankings are excluded. A diagnostic without usable values and targets shows an empty state. Some diagnostic explanations and breakdowns are illustrative or fixed in the source.

**Outcome:** The administrator identifies priorities from the data and diagnostic context currently supplied; this does not submit results to a ranking body.

**Sources:** [executive dashboard](../src/app/admin/page.tsx), [ranking view](../src/components/rankings/RankingView.tsx), [diagnostic](../src/components/rankings/Diagnostic.tsx).

## UC-09 — Monitor unit participation and contribution history

**Primary actors:** Coordinator or Unit Administrator for their unit; Office Administrator across accessible units.

**Trigger and preconditions:** The actor needs to understand a unit's progress and has permission to view its information.

**Main flow:** A unit user opens their dashboard to see readiness, pending requirements, revisions, deadlines, and the rankings and SDGs served by validated evidence. An office user opens Units, switches among Faculty/Colleges, University Offices, and Research Centers, searches, and compares submissions or standings. Opening a unit profile reveals its overview, submissions, recognition, history, and permitted settings.

**Alternatives and exceptions:** Narrow organizational assignments restrict the data shown. Archived units retain contextual warnings. Read-only actors cannot submit or change unit information.

**Outcome:** The actor understands participation and can navigate to the next permitted task.

**Sources:** [unit dashboard](../src/components/units/UnitDashboard.tsx), [unit participation](../src/components/units/UnitParticipation.tsx), [unit profile](../src/components/units/profile/UnitProfile.tsx), [portal scope](../src/lib/governance/server/portal.ts).

## UC-10 — Submit evidence for a unit

**Primary actor:** Coordinator with evidence submission permission in the target scope.

**Trigger and preconditions:** The unit has evidence to contribute, is active, and the reporting period accepts submissions. Evidence submission is enabled.

**Main flow:** The coordinator opens Submit evidence and creates a contribution with a title, evidence type, reporting period, measurable result, beneficiaries, SDGs, and applicable ranking indicators. They attach files or public links and may add background, a description, verification information, and references. The system validates the contribution and uploads, assigns an evidence reference, records it as For review, and creates an office notification when the template is enabled.

**Alternatives and exceptions:** Closed periods, unauthorized units, unsupported uploads, missing evidence, or no active indicator mapping prevent submission.

**Outcome:** A traceable evidence record enters the office's review queue.

**Sources:** [submission route](../src/app/portal/submit/page.tsx), [evidence composer](../src/components/contributions/EvidenceComposer.tsx), [submission rules](../src/lib/governance/engine/records.ts), [upload actions](../src/app/actions/evidence.ts).

## UC-11 — Review evidence and maintain ranking mappings

**Primary actor:** Office reviewer with evidence approval rights covering the record.

**Trigger and preconditions:** A contribution is available for review and is within the reviewer's organizational and ranking scope.

**Main flow:** The reviewer opens Contributions, locates a record, and examines its narrative, results, attachments, links, and comments. They maintain its applicable indicator mappings, then accept it or request revision. Acceptance records Validated status; revision records Needs revision with an explanation. The system audits the decision and notifies the unit when the relevant template is enabled.

**Alternatives and exceptions:** A submitter cannot decide their own evidence. Revision requires an actionable comment. Removing the last indicator mapping is refused.

**Outcome:** The evidence is validated or returned for improvement. Validation alone does not prove that an external ranking submission has occurred.

**Sources:** [validation queue](../src/components/contributions/ValidationQueue.tsx), [contribution record](../src/components/contributions/ContributionRecord.tsx), [review and mapping rules](../src/lib/governance/engine/records.ts).

## UC-12 — Respond to evidence feedback and resubmit

**Primary actor:** Coordinator with edit access to the evidence's unit.

**Trigger and preconditions:** A contribution has Needs revision status.

**Main flow:** The coordinator opens Submit evidence, opens the returned record from the table (or from the dashboard or the notification, which open it directly), and reads the reviewer's feedback and the record's notes. In the record they write a reply explaining the change and optionally add a corrected file. The system validates the response and attachment, appends them to the evidence's existing history, changes the status to For review, and informs the office when notifications are enabled.

**Alternatives and exceptions:** A record that is not awaiting revision cannot use this resubmission action. Replies must contain an explanation, and attachments must satisfy upload rules. The action appends feedback and an optional file; it is not a general rewrite of the original submission.

**Outcome:** The same evidence reference returns to the review queue with its discussion preserved.

**Sources:** [submission table](../src/components/contributions/MySubmissions.tsx), [contribution record](../src/components/contributions/ContributionRecord.tsx), [resubmission rules](../src/lib/governance/engine/records.ts).

## UC-13 — Write a unit publication and send it to the Rankings Office

**Primary actor:** Coordinator with publication rights for their unit.

**Trigger and preconditions:** The unit has a story, research article or report to share.

**Main flow:** The coordinator opens Publications in the contributor workspace and chooses Stories & News, Research Articles or Reports & Insights, which list only their unit's items. They write a post in the composer or enter a document in its form, save drafts, and send it to the Office. The system validates the content as it would for publishing, files it under the coordinator's unit, records it as In review, and notifies the office.

**Alternatives and exceptions:** A coordinator cannot publish, unpublish, mark a document to lead its page, or change another unit's items. While an item is with the Office or live, it cannot be changed; the coordinator moves a waiting item back to drafts to change it, and asks the Office to change a live one.

**Outcome:** The item waits for the Office's review. Nothing from a unit reaches the public website without the Office's approval.

**Sources:** [portal publications](../src/app/portal/publications), [post manager](../src/components/publications/PostManager.tsx), [document manager](../src/components/publications/DocumentManager.tsx), [unit publication rules](../src/lib/governance/engine/unit-publications.ts).

## UC-14 — Review a unit's publication

**Primary actor:** University-wide Administrator of the Rankings Office with publication approval rights.

**Trigger and preconditions:** A unit sent a post or document, which is In review and marked To review.

**Main flow:** The administrator opens the item in Publications, reads or edits it, and approves it or returns it to the unit. Approving publishes it, or opens the publication approval request when enough other approvers are available (UC-15). Returning it requires a note, moves the item back to drafts, and notifies the unit with the note.

**Alternatives and exceptions:** Incomplete content cannot be approved for publication. A return without a note is refused.

**Outcome:** The unit's item is published, awaiting the publication workflow, or back with the unit with what to change.

**Sources:** [post rules](../src/lib/governance/engine/posts.ts), [document rules](../src/lib/governance/engine/documents.ts), [unit publication rules](../src/lib/governance/engine/unit-publications.ts).

## UC-15 — Compose, publish, and withdraw stories or news

**Primary actor:** Office user with the relevant publication creation, editing, and approval permissions.

**Trigger and preconditions:** The office has a story to prepare or a unit proposal to develop.

**Main flow:** The editor creates a post or opens a proposal in the composer, supplies its headline, text, images, layout, themes, hashtags, and SDGs, then saves a draft or previews it. Publishing checks the content and either opens the configured publication approval request when enough approvers are available or publishes directly under the handler's fallback rules. Published content becomes eligible for the public website. The editor can later unpublish it or inspect audience analytics, including total views, recent views, and daily counts.

**Alternatives and exceptions:** Incomplete content cannot publish. Rejected or withdrawn publication requests return the item to its appropriate nonpublic state.

**Outcome:** Editorial content has a recorded draft, review, published, or unpublished state.

**Sources:** [post composer](../src/components/publications/PostComposer.tsx), [post manager](../src/components/publications/PostManager.tsx), [audience analytics](../src/components/publications/PostAnalytics.tsx), [post rules](../src/lib/governance/engine/posts.ts), [approval rules](../src/lib/governance/engine/requests.ts).

## UC-16 — Publish a research article or report document

**Primary actor:** Office publication manager with the required publication permissions.

**Trigger and preconditions:** An article or report is ready for cataloging in Publications.

**Main flow:** The manager chooses the document kind, enters title, authors, date, publication type, abstract or summary, and relevant metadata, and supplies a DOI, source link, or PDF. They save a draft and then request publication. The system validates publication requirements and applies the publication workflow or direct-publish fallback. A published document appears in its public collection when enabled, and its uploaded PDF is made available accordingly.

**Alternatives and exceptions:** Invalid dates, identifiers, uploads, or insufficient publishing details prevent completion. The manager may unpublish the document later.

**Outcome:** A managed publication record and its source or PDF become available to readers as permitted.

**Sources:** [document form](../src/components/publications/DocumentForm.tsx), [document manager](../src/components/publications/DocumentManager.tsx), [document rules](../src/lib/governance/engine/documents.ts), [media publication](../src/lib/governance/server/media.ts).

## UC-17 — Build and export a management report

**Primary actor:** User with report viewing and export permissions; an Office Administrator for the office report page and release requests.

**Trigger and preconditions:** The actor needs a management view of ranking performance, evidence, participation, risks, or action plans, and Reports is enabled.

**Main flow:** The actor opens Reports, chooses a report type, and filters the available data by the controls appropriate to that report. They inspect the results, request CSV export, or use the browser's Print or PDF option. CSV export checks permissions, dataset classifications, policies, and any required temporary export grant and may add an identifying watermark. An authorized actor may request report release through the publication process.

**Alternatives and exceptions:** Restricted or blocked datasets cannot export through the CSV action. Confidential exports may need approved access. Release recording is distinct from creating a public Publications document.

**Outcome:** The actor obtains a report or a traceable approval request, subject to its source data and access rules.

**Sources:** [report builder](../src/components/reports/ReportBuilder.tsx), [report export and release handlers](../src/lib/governance/engine/records.ts).

## UC-18 — Organize workspace files and shared resources

**Primary actors:** Coordinator for their unit's files; Office Knowledge Center editor for shared files; permitted readers.

**Trigger and preconditions:** The actor needs to store or find a working file, library resource, or template within their accessible Workspace.

**Main flow:** A writer opens the relevant shelf, creates or selects a folder, uploads files, and organizes them using rename and move actions. Readers browse or search the available resources and open files. A writer can archive files, restore them, or permanently delete files that are already archived. Folder actions preserve owner and shelf boundaries.

**Alternatives and exceptions:** Files require a folder and accepted upload type and size. Nonempty folders cannot be deleted. Readers cannot change resources they can only view.

**Outcome:** Files remain organized under their unit or the office's shared ownership, with authorized changes audited.

**Sources:** [workspace](../src/components/workspace/Workspace.tsx), [workspace rules](../src/lib/governance/engine/workspace.ts), [workspace actions](../src/app/actions/workspace.ts).

## UC-19 — Maintain links to working documents

**Primary actors:** Coordinator for unit documents; authorized Office editor for office documents.

**Trigger and preconditions:** The actor wants to track an externally edited document in the Hub and has write rights for its owner.

**Main flow:** The actor opens Working Documents, adds a document title and link, and records its available date, authors, ranking and SDG associations, status, and remarks. They save the entry, use the link to open the document, and update its metadata or status as work progresses.

**Alternatives and exceptions:** Invalid links or inaccessible ownership prevent saving. Editing document content and managing the linked provider's sharing remain outside this workflow.

**Outcome:** The Hub keeps a searchable, governed reference to the working document and its progress.

**Sources:** [working documents](../src/components/workspace/WorkingDocs.tsx), [working document model](../src/lib/governance/workspace.ts), [working document handlers](../src/lib/governance/engine/workspace.ts).

## UC-20 — Build and publish a digital form

**Primary actors:** Office form manager; unit Coordinator; Student secretary for their own evaluation or registration forms.

**Trigger and preconditions:** The actor needs a form and has creation rights for its holder and kind.

**Main flow:** The actor starts a blank form or an available template, defines steps, adds questions or presets, and configures wording, options, required fields, conditional visibility, and permitted review stages. They save the draft and open it to responses. An authorized Office manager can publish proposals, terminal reports, and surveys to the Student Portal; a Coordinator can publish their unit's surveys there.

**Alternatives and exceptions:** Questions change only in draft; an opened form must be duplicated to change its questions. Published evaluation and registration forms are fixed against editing and deletion. Students can create only their own evaluations and registrations, without sign-offs.

**Outcome:** An appropriately owned form is available through its responder link or eligible Student Portal destination.

**Sources:** [form builder](../src/components/forms/Builder.tsx), [form management rules](../src/lib/governance/engine/forms.ts), [holder and access rules](../src/lib/forms/access.ts).

## UC-21 — Answer a shared individual-response form

**Primary actor:** Form respondent.

**Trigger and preconditions:** The respondent receives a form link. The form is open, within its closing rules, and accepts individual responses rather than team copies.

**Main flow:** The respondent opens the link, reads and agrees to the data privacy statements, and completes the visible steps. Conditional questions and specialized controls collect the required information. On Send, the system checks consent, answer rules, form availability, and submission limits, then stores the response and shows a confirmation with its reference.

**Alternatives and exceptions:** Missing or invalid answers point the respondent back to the relevant field or step. Closed forms and excessive submissions are refused. Proposal and terminal-report forms using copies must follow the copy workflow instead.

**Outcome:** The response is stored under the form with a receipt reference. Public form response access does not create a Hub account.

**Sources:** [form route](../src/app/f/[code]/page.tsx), [responder](../src/components/forms/Responder.tsx), [response submission action](../src/app/actions/forms.ts), [answer validation](../src/lib/forms/check.ts).

## UC-22 — Complete a survey assigned in the Student Portal

**Primary actor:** Student secretary.

**Trigger and preconditions:** A survey has been published to the Student Portal by the Office or the student's own unit, and reaches the student's assignment scope.

**Main flow:** The student opens Assignments, identifies an unanswered open survey, and follows its form link while signed in. They accept the privacy statements, complete the form, and submit. The system associates the response with the student account, returns its reference, and shows the assignment as answered.

**Alternatives and exceptions:** A second account-linked answer to the same assigned survey is refused. Closed unanswered surveys leave the assignment list, while answered surveys remain as history. This is the signed-in assignment flow; the general responder endpoint also supports public form responses.

**Outcome:** The student's completion is visible in Assignments and the dashboard.

**Sources:** [assignments view](../src/components/students/Assignments.tsx), [assignment selection](../src/lib/governance/server/student-portal.ts), [account-linked submission](../src/app/actions/forms.ts).

## UC-23 — Create a proposal or terminal-report team copy

**Primary actor:** Student secretary.

**Trigger and preconditions:** The student needs to prepare a project document. The Office has published an open form of the relevant kind to the Student Portal.

**Main flow:** The student opens Project Proposals or Terminal Reports, selects an available form, names the copy after the project, and chooses link access or private access with named Google email addresses. Build Form creates a draft response with a reference, owner, and editable link. The student opens the copy and forwards its link to the team. Their portal lists the copies they created.

**Alternatives and exceptions:** Non-Student roles cannot build copies through this action. A form's own base link does not start a copy. Being added to another secretary's copy does not add it to the collaborator's portal list.

**Outcome:** The project has an owned, shareable draft copy. Terminal-report availability depends on the Office providing a suitable form.

**Sources:** [copy desk](../src/components/students/CopyDesk.tsx), [copy creation action](../src/app/actions/form-copies.ts), [portal catalog and copies](../src/lib/governance/server/student-portal.ts).

## UC-24 — Collaborate on a team copy and control access

**Primary actors:** Copy owner and admitted collaborators.

**Trigger and preconditions:** A draft team copy exists and the actor has its link and the access required by its sharing mode.

**Main flow:** Team members open the copy, accept the privacy statements on their devices, and fill different questions. Presence indicators show where others are working; changes are shared live and saved automatically. The owner can rename the copy, change sharing, and add or remove members. A recognized person excluded from a private copy can request access, which the owner allows or declines.

**Alternatives and exceptions:** Private access requires an admitted Google identity; form-only verification grants no Hub workspace. When live communication fails, saved-state polling continues. Concurrent edits to the same question use the last saved value.

**Outcome:** Admitted collaborators work on a shared saved draft, with owner-controlled access.

**Sources:** [collaboration client](../src/components/forms/useCopy.ts), [copy gate](../src/components/forms/CopyGate.tsx), [copy sharing controls](../src/components/forms/copy-parts.tsx), [copy actions](../src/app/actions/form-copies.ts).

## UC-25 — Submit a team copy and track its review

**Primary actor:** Admitted team copy participant, including its Student owner.

**Trigger and preconditions:** The team has completed a draft, the form still accepts responses, and current privacy consent is provided.

**Main flow:** The participant sends the copy. The page flushes pending changes, and the server validates the saved answers and checks that no teammate changed their version during submission. A successful send turns the same draft reference into a submitted response. Open pages switch to a receipt, and later visits to the link show what was sent and the applicable sign-off standing and decision notes.

**Alternatives and exceptions:** Validation errors require corrections. A simultaneous saved change requires checking the latest answers and sending again. A submitted copy cannot be sent twice.

**Outcome:** The project copy becomes a submitted record. Editing and resending a returned copy is not currently implemented.

**Sources:** [copy submission](../src/app/actions/form-copies.ts), [responder](../src/components/forms/Responder.tsx), [copy route](../src/app/f/[code]/[token]/page.tsx), [forms documentation](digital-forms.md).

## UC-26 — Record form sign-offs and office processing details

**Primary actor:** Authorized form reviewer: the Office for Office-held forms, or the unit's permitted Coordinator for unit-held forms.

**Trigger and preconditions:** A sent response has applicable review stages and the actor has review rights for its holder.

**Main flow:** The reviewer opens a response and records the next applicable sign-off with a signatory name, decision date, decision, and any note. They complete office-only fields where defined. The system enforces stage order and updates standing from Submitted to In review, Approved, Returned, or Declined as appropriate. For a ComDev proposal, conditional stages can record adviser, dean, regent, coordinator or moderator, and director decisions.

**Alternatives and exceptions:** Returning or declining requires a note. Only the latest recorded sign-off can be undone. Draft copies cannot be reviewed. Student-owned forms do not have sign-offs.

**Outcome:** The response has a recorded review history. The implementation records signatories' decisions through an authorized reviewer; it does not require each named signatory to sign in independently.

**Sources:** [response review interface](../src/components/forms/Responses.tsx), [review action](../src/app/actions/forms.ts), [review state rules](../src/lib/forms/review.ts), [ComDev template](../src/lib/forms/templates/comdev-proposal.ts).

## UC-27 — Analyze, export, and maintain form responses

**Primary actors:** Authorized Office form manager, unit form reader or Coordinator, or Student owner.

**Trigger and preconditions:** A form has responses and the actor has its read, export, or response-removal rights as applicable.

**Main flow:** The actor opens the response table, searches or filters submissions, and opens an individual response. They inspect question-specific analytics and download CSV when authorized. A permitted manager can remove sent responses such as test runs or duplicates, subject to the form's ownership and kind.

**Alternatives and exceptions:** Incomplete team copies appear in response listings but are excluded from sent-response analytics and CSV. The Office reads unit and Student forms only after they leave draft. Only the Office removes responses from fixed evaluation and registration forms.

**Outcome:** The actor obtains permitted response insights or an export, or removes eligible responses. Abandoned draft-copy deletion is not implemented.

**Sources:** [responses](../src/components/forms/Responses.tsx), [analytics](../src/components/forms/Analytics.tsx), [response actions](../src/app/actions/forms.ts), [access rules](../src/lib/forms/access.ts).

## UC-28 — Request assistance for a unit

**Primary actor:** Coordinator or other actor allowed to contribute for the unit.

**Trigger and preconditions:** The unit needs guidance and the assistance feature is enabled.

**Main flow:** The actor opens Request assistance, selects a topic, indicates urgency, and supplies a message explaining the need. The system verifies contribution authority, validates the request, assigns a reference, records its topic and urgency, and creates an office notification when the template is enabled.

**Alternatives and exceptions:** Read-only unit or external access alone does not allow requesting on the unit's behalf. Missing details or a disabled feature prevent submission. The current handler validates the message but does not retain it in the assistance record.

**Outcome:** A referenced request is recorded for office attention. A tracked support conversation and resolution workflow are not established by this handler.

**Sources:** [assistance form](../src/components/contributions/RequestAssistance.tsx), [assistance handler](../src/lib/governance/engine/records.ts).

## UC-29 — Receive and follow workflow notifications

**Primary actor:** Signed-in user receiving a permitted notification.

**Trigger and preconditions:** A supported event occurs, such as evidence submission, a review decision, or an approval request, and its in-app template is enabled.

**Main flow:** The system creates a notification addressed to the office, a unit, or an account. The recipient opens the notification bell, reads the event, and follows its link to the relevant workspace item. Available actions mark visible notices as read. Users can adjust supported notification preferences in settings. Immediate operation results appear through the shared toast system.

**Alternatives and exceptions:** Notifications are filtered by recipient and permissions or preferences. Disabled templates do not create notices. The notification producer skips Email-only templates; an outbound email dispatcher was not established in this scan.

**Outcome:** The recipient can discover relevant events and navigate to permitted follow-up work.

**Sources:** [shell](../src/components/shell/Shell.tsx), [notification creation](../src/lib/governance/engine/core.ts), [notice reading](../src/lib/governance/engine/records.ts), [notification preferences](../src/lib/governance/notification-prefs.ts), [shared toasts](../src/components/ui/toast.tsx).

## UC-30 — Administer accounts, assignments, and role permissions

**Primary actor:** Administrator with the appropriate account and role management rights.

**Trigger and preconditions:** A person must be invited, reassigned, restricted, or given a different level of access.

**Main flow:** The administrator opens Accounts, creates an invitation individually or through the available sheet workflow, and records role, unit, scope, and any expiry. They can update allowed details, transfer units, change account status, manage assignments, or require reauthentication. Privilege changes may enter approval. In Roles, an authorized manager adjusts the allowed actions for the four roles and applicable scope.

**Alternatives and exceptions:** The administrator cannot grant authority beyond their permitted scope. External accounts are restricted to the External role. Rules prevent removing the Hub's remaining administrative access and preserve its ability to manage roles.

**Outcome:** Accounts and assignments reflect approved responsibilities, with changes recorded in the audit trail.

**Sources:** [accounts console](../src/components/admin/sections/Accounts.tsx), [invitation sheet](../src/components/admin/sections/InviteSheet.tsx), [account rules](../src/lib/governance/engine/accounts.ts), [role rules](../src/lib/governance/engine/roles.ts).

## UC-31 — Maintain the organizational directory and unit contacts

**Primary actor:** Administrator with directory management rights covering the affected units.

**Trigger and preconditions:** An organizational unit, hierarchy, contact, logo, or coordinator assignment must change.

**Main flow:** The administrator opens the directory, locates a unit or its parent, and creates or edits the permitted information. They maintain names, codes, contacts, logos, and coordinator associations. Authorized structural operations move, archive, reactivate, or merge units. Creating a unit may open an approval request under the configured workflow.

**Alternatives and exceptions:** Duplicate codes, invalid hierarchy changes, ineligible assignments, and out-of-scope actions are refused. A merge preserves relevant records under the handler's transfer rules. Stored organizational kinds remain distinct from the displayed category labels.

**Outcome:** The directory supplies current organizational ownership, navigation categories, and scope boundaries across the Hub.

**Sources:** [directory console](../src/components/admin/sections/Directory.tsx), [directory rules](../src/lib/governance/engine/directory.ts), [unit settings](../src/components/units/profile/Settings.tsx), [category labels](../src/lib/unit-categories.ts).

## UC-32 — Govern datasets, quality, and temporary data access

**Primary actors:** Authorized governance manager or steward; user requesting data access.

**Trigger and preconditions:** Dataset ownership, classification, retention, quality, definitions, or access needs attention.

**Main flow:** The manager opens Data Governance and updates permitted dataset properties with the required justification. They record version notes, maintain dictionary metadata and quality rules, run checks, and resolve flagged evidence duplicates. A retention review lists versions beyond their configured retention. A user needing additional data access requests a dataset, access type, end date, and justification; approval creates a temporary grant.

**Alternatives and exceptions:** Personal datasets cannot be made Public. Restricted export is blocked, and Confidential export requires approval. Temporary data access is limited to the permitted duration. Retention review identifies due items rather than automatically disposing of them.

**Outcome:** Data policies and quality decisions are recorded, or temporary access is granted through approval.

**Sources:** [governance console](../src/components/admin/sections/Governance.tsx), [dataset and quality rules](../src/lib/governance/engine/data.ts), [data access request](../src/components/units/RequestDataAccess.tsx), [request rules](../src/lib/governance/engine/requests.ts).

## UC-33 — Decide and configure approval workflows

**Primary actor:** Office Administrator with approval or workflow management rights.

**Trigger and preconditions:** A request is pending for account access, privileges, a unit, data access, publication, or a destructive recovery operation.

**Main flow:** The approver opens Workflows, examines the request and justification, and records approval or rejection for the current step. Approval advances to the next step; final approval revalidates and applies the requested change. Rejection records a reason and closes the request. A workflow manager can configure supported steps, service targets, and separation rules. Eligible requesters can withdraw pending requests.

**Alternatives and exceptions:** Closed requests cannot be decided again. Separation rules can prevent self-approval, and an earlier approving actor cannot approve a later step. Changed underlying data can prevent final application. Selected command handlers bypass optional approval when too few approvers exist; destructive recovery requests still use their explicit approval path.

**Outcome:** The request has a traceable decision history and is applied only when its completion rules succeed.

**Sources:** [workflow console](../src/components/admin/sections/Workflows.tsx), [workflow rules](../src/lib/governance/engine/requests.ts).

## UC-34 — Manage privacy, security reviews, and incidents

**Primary actor:** Administrator with the relevant security viewing, editing, or management rights.

**Trigger and preconditions:** A policy needs review, access must be recertified, or a privacy or security matter must be recorded.

**Main flow:** The actor opens Privacy and Security and maintains supported sign-in, session, export, sharing, and privacy-contact settings. They can start an access review, record Keep or Revoke decisions, and complete it after all required decisions. They record privacy assessments and data-subject requests, acknowledge or resolve alerts, and log incidents with severity and a status timeline. Completing an access review suspends accounts whose access was revoked and ends their sessions.

**Alternatives and exceptions:** A reviewer cannot recertify their own access. Policy forms validate required values. An administrative policy field alone does not prove that its associated external control is enforced.

**Outcome:** The Hub retains security policies, access-review decisions, privacy records, and incident handling history.

**Sources:** [security console](../src/components/admin/sections/Security.tsx), [security rules](../src/lib/governance/engine/security.ts), [session checks](../src/lib/governance/server/session.ts).

## UC-35 — Inspect and verify the audit trail

**Primary actor:** Administrator with audit viewing or export rights.

**Trigger and preconditions:** The actor needs to investigate an action, demonstrate a recorded decision, or check audit integrity.

**Main flow:** The actor opens Audit logs, searches and filters by available criteria, and examines events containing actor, time, action, resource, outcome, and detail. They request verification of the hash chain and review the result. With export rights, they export selected audit records and their filter context.

**Alternatives and exceptions:** Denied access attempts are recorded where handlers use the denial helper; ordinary invalid input is not automatically an audit event. Integrity verification can report a problem rather than a pass. Events cannot be edited through the audit interface.

**Outcome:** The actor obtains a traceable account of recorded activity and a verification or export result.

**Sources:** [audit console](../src/components/admin/sections/Audit.tsx), [audit event storage and verification](../src/lib/governance/server/db/audit.ts), [command logging](../src/lib/governance/engine/core.ts), [governance actions](../src/app/actions/governance.ts).

## UC-36 — Configure reporting operations and maintain ranking deadlines

**Primary actor:** Administrator with the relevant configuration or ranking editing rights. **Supporting actor:** Deadline-check automation.

**Trigger and preconditions:** Reporting operations, feature availability, public visibility, or calendar dates must change.

**Main flow:** The administrator configures tracked bodies and rankings, cycles, academic years, reporting periods, upload limits, templates, dashboard defaults, feature flags, and site notices. For deadlines, they can set dates manually or run the source check. The checker reads configured public sources and records findings. An authorized user reviews each finding and applies or dismisses it; applied dates update the calendar and notifications as supported.

**Alternatives and exceptions:** Invalid dates or settings are refused. Unpublished, changed, or inaccessible source pages produce a reported status rather than an assumed date. Automated execution requires the scheduled endpoint to be configured externally.

**Outcome:** The Hub uses current operational settings and reviewed calendar entries.

**Sources:** [configuration console](../src/components/admin/sections/Config.tsx), [configuration rules](../src/lib/governance/engine/config.ts), [deadline rules](../src/lib/governance/engine/deadlines.ts), [source checker](../src/lib/governance/server/deadline-check.ts), [scheduled endpoint](../src/app/api/cron/deadlines/route.ts).

## UC-37 — Create, verify, and request recovery of a Hub backup

**Primary actor:** Office Administrator with backup management rights. **Supporting actor:** Another eligible approver for destructive operations.

**Trigger and preconditions:** The administrator needs a recovery point, wants to verify an existing point, or must restore or remove one. Required storage services are configured.

**Main flow:** The administrator opens Backup and Recovery and runs a backup. The system snapshots restorable governance state, stores compressed data in private storage, and records recovery metadata and a checksum. The administrator verifies an eligible recovery point. To restore or delete it, they supply a justification and submit an approval request; an approved request schedules the corresponding operation.

**Alternatives and exceptions:** Missing, unreadable, failed, or checksum-mismatched files cannot serve as verified recovery data. Sample catalog points may support a catalog-only check and cannot be restored here. Duplicate destructive requests are refused.

**Outcome:** A recovery point or verification result is recorded, or an approved operation restores or removes eligible snapshot data. The snapshot excludes the audit trail and live sign-ins and is not a full backup of all uploaded media or every separately stored response.

**Sources:** [backup console](../src/components/admin/sections/Backup.tsx), [backup rules](../src/lib/governance/engine/backup.ts), [snapshot storage and contents](../src/lib/governance/server/db/backups.ts), [operation execution](../src/lib/governance/server/store.ts).

## Supporting capability without a current submission screen

**Reporting-period values:** The `data.submit` handler accepts a unit's numeric values with source-document references, checks scope and the data-entry feature, marks accepted values For review, and notifies the office. A search of current application routes and components found no caller that submits this command. Treat this as a backend-supported capability rather than a complete current user journey. A separate numeric-data validation and approval journey was not established by the traced handlers.

Sources: [value submission handler](../src/lib/governance/engine/records.ts), [command dispatcher](../src/lib/governance/engine/index.ts), [navigation](../src/components/shell/nav.ts).

## Implementation limits that affect these narratives

1. **Source review, not deployment verification.** These narratives establish implemented paths and their conditions. They do not establish which features, content, integrations, or schedules are enabled in a deployed environment. Tests were inspected as supporting material but were not executed for this documentation task.
2. **Presentation and fixed analytical content.** `NEXT_PUBLIC_DEMO_DATA=1` enables mock rankings, evidence, publications, actions, and recognitions. Some diagnostic breakdowns and explanatory recommendations are fixed in the component. They should not be presented as verified institutional findings. Sources: [demo data](../src/lib/demo.ts), [data selectors](../src/lib/data.ts), [diagnostic](../src/components/rankings/Diagnostic.tsx).
3. **Form response editing.** Editing a sent response, editing and resending a returned team copy, and removing abandoned draft copies remain unimplemented. The terminal-report workflow has infrastructure but requires an Office-issued terminal-report form. A file-upload question module is also listed as future work; evidence and workspace uploads are separate features. Source: [digital forms documentation](digital-forms.md).
4. **Form review identities.** A permitted reviewer records a signatory's name and decision. The code does not establish a separate authenticated approval session for every named adviser, dean, regent, coordinator, or director. Source: [review action](../src/app/actions/forms.ts).
5. **Approval fallback.** Some actions using `needsApproval` apply directly when their workflow is disabled or too few eligible approvers are available. Do not describe all publication and privilege operations as unconditionally requiring a second person. A unit's own publications always wait for a Rankings Office administrator's review (UC-14); only the second sign-off after it can fall back. Sources: [approval helper](../src/lib/governance/engine/requests.ts), [post publishing](../src/lib/governance/engine/posts.ts), [account assignments](../src/lib/governance/engine/accounts.ts).
6. **Email and form-arrival alerts.** In-app notification creation is implemented; the producer skips Email-only templates. Automatic notifications to the people running a form when a response arrives remain listed as future work. Sources: [notification producer](../src/lib/governance/engine/core.ts), [forms documentation](digital-forms.md).
7. **Policy records versus external operations.** The key-rotation handler updates a catalog date; it does not rotate an external service credential. MFA policy is configurable, but the traced sign-in handler creates sessions with `mfa: false`; an enforced additional-factor journey was not established. Retention review lists due versions rather than executing disposal. Sources: [security handlers](../src/lib/governance/engine/security.ts), [sign-in handler](../src/lib/governance/server/signin.ts), [retention review](../src/lib/governance/engine/data.ts).
8. **Report export scope.** CSV export uses the governed export command. Print or PDF calls the browser's print action separately, so the CSV approval and watermark checks should not be assumed to protect every printing path. Recording report release also differs from authoring a public report document. Sources: [report builder](../src/components/reports/ReportBuilder.tsx), [report commands](../src/lib/governance/engine/records.ts).
9. **External ranking submissions.** The source supports gathering, reviewing, mapping, and reporting evidence. A direct authenticated submission integration with QS, THE, UI GreenMetric, or WURI was not established. Displayed pipeline labels do not by themselves implement those external steps. Sources: [commands](../src/lib/governance/commands.ts), [evidence stages](../src/lib/data.ts).
