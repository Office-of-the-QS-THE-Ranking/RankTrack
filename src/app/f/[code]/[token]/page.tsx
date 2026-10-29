import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyGate } from "@/components/forms/CopyGate";
import { SignInReturn } from "@/components/forms/copy-parts";
import { FormFrame } from "@/components/forms/FormFrame";
import { Responder } from "@/components/forms/Responder";
import { COPY_TOKEN, copyPath } from "@/lib/forms/copies";
import { FORM_CODE } from "@/lib/forms/kinds";
import { copyOf, formWho } from "@/lib/governance/server/form-copies";
import { formByCode, responderForm } from "@/lib/governance/server/forms";
import { mayLookUp } from "@/lib/governance/server/people-directory";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { serverViews } from "@/lib/governance/server/views";

type Props = { params: Promise<{ code: string; token: string }>; searchParams: Promise<{ signin?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const form = FORM_CODE.test(code) ? await responderForm(code, null) : null;
  return { title: form?.title ?? "Form", robots: { index: false, follow: false }, referrer: "same-origin" };
}

/**
 * A team copy's own link: the form over the copy's answers, which everyone with access fills in together and which
 * save as they type (Responder, useCopy.ts). Its reference and details head the page and the share card holds the
 * copy's link as a QR code and an address. Someone signed in to the Hub is known by that account here, whatever
 * Google account was chosen on a form before (formWho). A private copy asks for Google sign-in with an account its
 * owner added or a request for access from its owner (CopyGate). Once sent, the link shows the receipt and where its sign-offs stand.
 */
export default async function CopyPage({ params, searchParams }: Props) {
  const { code, token } = await params;
  if (!FORM_CODE.test(code) || !COPY_TOKEN.test(token)) notFound();
  const record = await formByCode(code);
  if (!record?.copies) notFound();
  const [form, who, { office }, { signin }] = await Promise.all([responderForm(code, await getViewer()), formWho(), serverViews(), searchParams]);
  if (!form) notFound();
  const copy = await copyOf(record, token, who);
  if (!copy) notFound();

  if (copy === "denied" || copy === "requested") {
    return (
      <FormFrame form={form} office={office} link={{}} who={who}>
        <SignInReturn result={signin} />
        <CopyGate code={code} token={token} who={who} requested={copy === "requested"} />
      </FormFrame>
    );
  }

  return (
    <FormFrame
      form={form}
      office={office}
      link={{ path: copyPath(code, token), copied: "Copy link copied." }}
      above={<span className="fr-hero__copyref">{copy.ref}</span>}
      lead={null}
      details={[
        { label: "File name", value: copy.label },
        copy.access === "private" ? { label: "Access", icon: "lock-keyhole", value: "Only people added" } : { label: "Access", icon: "link", value: "Anyone with the link" },
        { label: "Started by", value: copy.owner },
      ]}
      note={<span id="fr-copy-link-actions" />}
      who={who}
    >
      <SignInReturn result={signin} />
      <Responder key={copy.token} form={form} copy={copy} who={who} directory={mayLookUp(await readState(), who)} />
    </FormFrame>
  );
}
