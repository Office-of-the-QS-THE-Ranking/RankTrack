import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyStart } from "@/components/forms/CopyStart";
import { SignInReturn } from "@/components/forms/copy-parts";
import { FormFrame } from "@/components/forms/FormFrame";
import { Responder } from "@/components/forms/Responder";
import { Icon } from "@/components/ui/Icon";
import { FORM_CODE } from "@/lib/forms/kinds";
import { copiesOf, formWho } from "@/lib/governance/server/form-copies";
import { formByCode, responderForm } from "@/lib/governance/server/forms";
import { mayLookUp } from "@/lib/governance/server/people-directory";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { serverViews } from "@/lib/governance/server/views";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ signin?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const form = FORM_CODE.test(code) ? await responderForm(code, null) : null;
  return { title: form?.title ?? "Form", description: form?.description, robots: { index: false, follow: false } };
}

/**
 * A digital form's responder link (FormFrame has the page around it). Anyone with the link can respond; someone who
 * runs the form can preview it first. A form with team copies opens on building one instead (CopyStart): each copy
 * is a response with its own reference and link, filled in together at /f/<code>/<token>.
 */
export default async function FormPage({ params, searchParams }: Props) {
  const { code } = await params;
  if (!FORM_CODE.test(code)) notFound();
  const form = await responderForm(code, await getViewer());
  if (!form) notFound();
  const { office } = await serverViews();

  if (form.copies && !form.preview) {
    const [record, who, { signin }] = await Promise.all([formByCode(code), formWho(), searchParams]);
    const copies = record ? await copiesOf(record, who) : [];
    return (
      <FormFrame
        form={form}
        office={office}
        link={{}}
        note={
          <>
            <Icon name="users" size={14} /> One copy per event, filled in together
          </>
        }
      >
        <SignInReturn result={signin} />
        <CopyStart form={{ code: form.code, prefix: form.prefix, title: form.title }} who={who} copies={copies} open={form.status === "open"} />
      </FormFrame>
    );
  }

  return (
    <FormFrame form={form} office={office} link={{}}>
      <Responder form={form} directory={mayLookUp(await readState(), await formWho())} />
    </FormFrame>
  );
}
