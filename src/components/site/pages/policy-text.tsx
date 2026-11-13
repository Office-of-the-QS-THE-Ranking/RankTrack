import type { ReactNode } from "react";
import type { PolicySection } from "./PolicyPage";
import { PORTAL_EXPANSION, PORTAL_NAME } from "@/lib/brand";

/*
 * The Terms of use and Data privacy notice. FIRST DRAFT, written from what the Hub actually does (2026-11-09), for the
 * Office and the University's Data Protection Officer and legal counsel to review. Once approved, set POLICY_DRAFT to
 * false and put the effective date in POLICY_DATE. Update these pages when a data flow they describe changes: AI
 * providers (lib/assistant), cookies (server/session.ts, server/email-verify.ts), retention (governance/seed.ts).
 */
export const POLICY_DRAFT = true;
export const POLICY_DATE = "9 November 2026";

export const policyLead = (what: ReactNode) => (
  <>
    <p>{what}</p>
    <p>{POLICY_DRAFT ? `Draft of ${POLICY_DATE}, under review and not yet in force.` : `Effective ${POLICY_DATE}.`}</p>
  </>
);

export interface PolicyContact {
  officeName: string;
  officeEmail: string;
  officer: string;
  officerEmail: string;
  address: string;
  breachHours: number;
}

const mail = (email: string) => <a href={`mailto:${email}`}>{email}</a>;

export function termsSections(c: PolicyContact): PolicySection[] {
  return [
    {
      id: "about",
      tab: "About",
      title: "About these terms",
      body: (
        <>
          <p>The {PORTAL_NAME} ({PORTAL_EXPANSION}) is run by the {c.officeName} of the University of Santo Tomas (UST). It has a public website and a signed-in portal where units and partners contribute to the University’s work on international rankings.</p>
          <p>By using the Hub you agree to these terms. If you don’t agree, please don’t use it. Our <a href="/privacy">Data privacy notice</a> explains how personal data is handled.</p>
        </>
      ),
    },
    {
      id: "who",
      tab: "Who can use it",
      title: "Who can use the Hub",
      body: (
        <>
          <p>Anyone may read the public website. The portal is for people whose access the Office has approved, including UST staff, Student Organizers and invited external partners.</p>
          <p>You must be 18 or older to hold a portal account or use the AI assistant.</p>
        </>
      ),
    },
    {
      id: "account",
      tab: "Your account",
      title: "Your account",
      body: (
        <ul>
          <li>You sign in with your own Google account. Don’t share your access or use someone else’s.</li>
          <li>Your role decides what you can see and do. Use only the access you were given, and only for your work with the Hub.</li>
          <li>Tell the Office promptly if you think your account has been misused.</li>
          <li>The Office may change, suspend or remove access, for example when your role ends or these terms are broken.</li>
        </ul>
      ),
    },
    {
      id: "submissions",
      tab: "What you submit",
      title: "What you submit",
      body: (
        <>
          <p>When you submit evidence, data, forms or publications:</p>
          <ul>
            <li>It must be true and accurate as far as you know. Never falsify or invent evidence or data.</li>
            <li>You must have the right to share it. If it includes other people’s personal data, you must be allowed to share that too, and include only what’s needed.</li>
            <li>You or your unit keep whatever ownership you have. You allow the University to store, review and use it for rankings work, including sending it to ranking bodies and, once approved, publishing it on the Hub.</li>
          </ul>
          <p>The Office may review, return or decline any submission.</p>
        </>
      ),
    },
    {
      id: "use",
      tab: "Acceptable use",
      title: "Acceptable use",
      body: (
        <>
          <p>Please don’t:</p>
          <ul>
            <li>Try to reach data or functions your role doesn’t allow, or test or bypass the Hub’s security.</li>
            <li>Upload malware, or anything unlawful, or anything that infringes someone’s rights.</li>
            <li>Disrupt the Hub, or scrape or copy it in bulk by automated means.</li>
            <li>Misrepresent who you are, or present the Hub’s content as saying something it doesn’t.</li>
          </ul>
          <p>The Hub records significant actions in an audit trail, as the privacy notice explains.</p>
        </>
      ),
    },
    {
      id: "assistant",
      tab: "AI assistant",
      title: "The AI assistant",
      body: (
        <ul>
          <li>The assistant is an automated tool. Its answers can be wrong or out of date, even when they sound certain, so check anything important against the sources it lists or with the Office.</li>
          <li>Only an answer that lists Hub sources draws on the Hub. Other answers are general AI responses. No answer is an official statement of the University or the Office.</li>
          <li>Don’t enter personal, sensitive or confidential information. Your messages are sent to outside AI providers, and some of those providers may review them.</li>
          <li>You’re responsible for how you use its answers. Never use it to create false evidence or data.</li>
          <li>The Office may limit, change or switch off the assistant or any of its models at any time.</li>
        </ul>
      ),
    },
    {
      id: "content",
      tab: "Content",
      title: "Rankings and published content",
      body: (
        <>
          <p>Ranking results belong to the ranking bodies and follow their published methods. The Office reports them as published and doesn’t alter them.</p>
          <p>Unless stated otherwise, the Hub’s text, images and marks belong to the University or their owners. You may share or quote public pages with credit to the source. Using the University’s name, seal or marks needs the University’s permission.</p>
        </>
      ),
    },
    {
      id: "liability",
      tab: "Liability",
      title: "Availability and liability",
      body: (
        <>
          <p>We work to keep the Hub accurate and available, but it’s provided as it is, and it may change or be interrupted. Keep your own copies of what matters to you.</p>
          <p>To the extent the law allows, the University isn’t liable for loss arising from your use of the Hub or from relying on its content, including the assistant’s answers. Nothing here limits rights that the law doesn’t allow us to limit.</p>
        </>
      ),
    },
    {
      id: "changes",
      tab: "Changes and law",
      title: "Changes and governing law",
      body: (
        <>
          <p>We may update these terms and will post the new version here with its date. Continuing to use the Hub afterwards means you accept the update.</p>
          <p>These terms are governed by the laws of the Philippines.</p>
        </>
      ),
    },
    {
      id: "contact",
      tab: "Contact",
      title: "Contact",
      body: (
        <p>
          {c.officeName}, {c.address}. Email {mail(c.officeEmail)}.
        </p>
      ),
    },
  ];
}

export function privacySections(c: PolicyContact): PolicySection[] {
  return [
    {
      id: "who",
      tab: "Who we are",
      title: "Who we are",
      body: (
        <>
          <p>The University of Santo Tomas, through its {c.officeName}, runs the {PORTAL_NAME} and is responsible for the personal data in it. We handle personal data under the Data Privacy Act of 2012 (Republic Act No. 10173).</p>
          <p>Questions or requests about your personal data go to the {c.officer} at {mail(c.officerEmail)}.</p>
        </>
      ),
    },
    {
      id: "collect",
      tab: "What we collect",
      title: "What we collect",
      body: (
        <ul>
          <li><b>Access requests:</b> your name, salutation, email, birthday, affiliation, organization, and website if you give one, plus the declarations you make.</li>
          <li><b>Accounts:</b> your name, email, title, unit, roles and Google profile photo, your notification and session choices, and your sign-in sessions, including the device.</li>
          <li><b>Your work:</b> evidence, data, publications and files you submit, with who submitted and reviewed them, and any comments.</li>
          <li><b>Digital forms:</b> your answers, which may include names and details of the people involved, and any photos or videos the form covers. Each form states its own purpose and consent.</li>
          <li><b>Activity records:</b> an audit trail of significant actions, showing who did what and when.</li>
          <li><b>AI assistant:</b> for each message, your account, unit and role, the model used, the outcome, the tokens used and the cost. We don’t store what you asked or what it answered.</li>
          <li><b>Technical data:</b> a scrambled form of your network address for rate limits, so the address itself isn’t stored by the Hub, and anonymous page performance measurements. Our hosting provider may keep ordinary server logs.</li>
          <li><b>People lookup:</b> when a verified UST user fills in a form, the Hub can look up colleagues’ names, emails and photos in the University’s Google directory, using that user’s own directory access. The access tokens are stored encrypted.</li>
        </ul>
      ),
    },
    {
      id: "why",
      tab: "Why we use it",
      title: "Why we use it, and on what basis",
      body: (
        <>
          <p>We use personal data to decide access requests and run accounts, to collect, review and report the University’s rankings data and evidence, to credit units for their contributions, to publish approved work, to run digital forms, to answer your questions through the assistant, and to keep the Hub secure and accountable.</p>
          <p>We rely on your consent where we ask for it (for example, on a form or for an access request), on what’s needed for your role or to give you the service, on the University’s legitimate interests in its rankings work and in security, and on legal duties that apply to us.</p>
        </>
      ),
    },
    {
      id: "assistant",
      tab: "AI assistant",
      title: "The AI assistant",
      body: (
        <>
          <p>Your messages, recent turns of the conversation and matching Hub passages are sent to the AI provider of the model you’re using. The Hub doesn’t send your name or email with them, and doesn’t keep the conversation once you close or reload the chat.</p>
          <p><b>Please don’t type personal or confidential information.</b> On Google’s free plan, which the assistant may use, Google may use what it receives to improve its products, and people may review it. On paid plans, providers say they don’t use it to train their models, though they may keep it for a limited time for safety and abuse checks.</p>
          <p>The assistant doesn’t make decisions about you, and its usage records aren’t used to assess your work.</p>
        </>
      ),
    },
    {
      id: "share",
      tab: "Who sees it",
      title: "Who sees it",
      body: (
        <>
          <ul>
            <li><b>Within the University:</b> the people whose role needs it, such as your unit’s coordinators and administrators, and the {c.officeName}.</li>
            <li><b>Ranking bodies:</b> evidence and data the University submits to them, and contact details where a ranking asks for them, such as reputation survey contacts.</li>
            <li><b>The public:</b> only what’s been approved for publication, which may include names in stories, articles and reports.</li>
            <li><b>Service providers acting for us:</b> Supabase (database and sign-in), Vercel (hosting and performance measurement), Cloudflare (file storage and AI), Google (sign-in, directory lookup and AI), and, if the Office turns them on, OpenAI and Anthropic (AI).</li>
          </ul>
          <p>We don’t sell personal data. We may also disclose it when the law requires.</p>
        </>
      ),
    },
    {
      id: "transfers",
      tab: "Outside the Philippines",
      title: "Storage outside the Philippines",
      body: <p>The Hub’s database is hosted in South Korea, and our other service providers may process data in other countries. We choose providers with security commitments and remain responsible for your data under Philippine law.</p>,
    },
    {
      id: "keep",
      tab: "How long",
      title: "How long we keep it",
      body: (
        <>
          <ul>
            <li>Birthdays and websites on access requests: removed 30 days after the request closes. Your name, email and affiliation stay as the record of who was given access.</li>
            <li>Accounts, roles, audit records and form responses: 5 years, then reviewed.</li>
            <li>Evidence submissions: 7 years, then reviewed.</li>
            <li>Reputation survey contact lists: 2 years, then disposed of.</li>
            <li>Published stories and research records: 10 years, then archived.</li>
            <li>Backups: daily copies for 35 days and monthly copies for 12 months.</li>
          </ul>
          <p>We may keep something longer if the law requires it.</p>
        </>
      ),
    },
    {
      id: "security",
      tab: "Security",
      title: "How we protect it",
      body: <p>Data is encrypted in transit and at rest, access depends on your role, and significant actions are logged in a trail that can’t be quietly altered. No system is perfectly secure. If a breach is likely to put you at serious risk, we’ll notify the National Privacy Commission and those affected within {c.breachHours} hours of learning of it, as the rules require.</p>,
    },
    {
      id: "rights",
      tab: "Your rights",
      title: "Your rights",
      body: (
        <>
          <p>Under the Data Privacy Act you have the right to be informed, to access your data, to correct it, to object to its processing, to have it erased or blocked, to get a portable copy, to withdraw consent, and to be compensated for damage caused by misuse.</p>
          <p>To use these rights, write to {mail(c.officerEmail)}. Some requests may be limited where we must keep records by law. If you’re not satisfied, you can complain to the National Privacy Commission.</p>
        </>
      ),
    },
    {
      id: "cookies",
      tab: "Cookies",
      title: "Cookies and browser storage",
      body: (
        <>
          <p>The Hub uses only what it needs to work. It doesn’t use advertising cookies.</p>
          <ul>
            <li><b>Your session:</b> keeps you signed in until you sign out or the session ends.</li>
            <li><b>Sign-in:</b> short-lived cookies for Google sign-in, including one for 10 minutes that remembers whether to keep you signed in.</li>
            <li><b>Email check:</b> confirms your address, for 15 to 30 minutes.</li>
            <li><b>Form sign-in:</b> remembers who you are on a digital form, for 7 days.</li>
            <li><b>Stored in your browser:</b> your theme, sidebar, assistant model and position, and unsent drafts. These stay on your device, and you can clear them in your browser.</li>
          </ul>
        </>
      ),
    },
    {
      id: "changes",
      tab: "Changes",
      title: "Changes to this notice",
      body: <p>We’ll post any update here with its date, and tell you in the Hub if a change significantly affects you.</p>,
    },
  ];
}
