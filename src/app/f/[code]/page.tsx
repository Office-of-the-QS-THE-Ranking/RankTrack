import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyDoor } from "@/components/forms/CopyGate";
import { FormFrame } from "@/components/forms/FormFrame";
import { Responder } from "@/components/forms/Responder";
import { FORM_CODE } from "@/lib/forms/kinds";
import { formWho } from "@/lib/governance/server/form-copies";
import { formByCode, responderForm, rightsFor } from "@/lib/governance/server/forms";
import { mayLookUp } from "@/lib/governance/server/people-directory";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { serverViews } from "@/lib/governance/server/views";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const form = FORM_CODE.test(code) ? await responderForm(code, null) : null;
  return { title: form?.title ?? "Form", description: form?.description, robots: { index: false, follow: false } };
}

/**
 * A digital form's responder link (FormFrame has the page around it). Anyone with the link can respond; someone who
 * runs the form can preview it first. A Proposal or Terminal Report form is filled in as team copies, which student
 * organization secretaries build from the Student Portal: its own link only previews it for the people who run it,
 * and points everyone else there (CopyDoor). Each copy has its own link, /f/<code>/<token>.
 */
export default async function FormPage({ params }: Props) {
  const { code } = await params;
  if (!FORM_CODE.test(code)) notFound();
  const viewer = await getViewer();
  const form = await responderForm(code, viewer);
  if (!form) notFound();
  const [{ office }, who] = await Promise.all([serverViews(), formWho()]);

  if (form.copies) {
    // The people who run or read it preview its questions; nothing is sent from here.
    const record = await formByCode(code);
    const may = record ? rightsFor(viewer, record) : null;
    if (!may?.read && !may?.edit) {
      return (
        <FormFrame form={form} office={office} link={{}} share={false} who={who}>
          <CopyDoor kind={form.kind} open={form.status === "open"} />
        </FormFrame>
      );
    }
    return (
      <FormFrame form={form} office={office} link={{}} share={false} who={who}>
        <Responder form={{ ...form, preview: true }} directory={mayLookUp(await readState(), who)} />
      </FormFrame>
    );
  }

  return (
    <FormFrame form={form} office={office} link={{}} who={who}>
      <Responder form={form} directory={mayLookUp(await readState(), who)} />
    </FormFrame>
  );
}
