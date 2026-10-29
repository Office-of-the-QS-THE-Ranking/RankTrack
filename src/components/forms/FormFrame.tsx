import Link from "next/link";
import type { ReactNode } from "react";
import { FootClock } from "@/components/forms/FootClock";
import { ClearableFields } from "@/components/forms/ClearableFields";
import { FormLink } from "@/components/forms/FormLink";
import { WhoChip } from "@/components/forms/copy-parts";
import { Lockup, UNIVERSITY } from "@/components/site/Lockup";
import { Stars } from "@/components/site/Stars";
import { siteFontVars } from "@/components/site/fonts";
import { Icon, type IconName } from "@/components/ui/Icon";
import { QrCode } from "@/components/ui/QrCode";
import { dayLabel } from "@/lib/forms/format";
import { formKindLabel } from "@/lib/forms/kinds";
import type { FormWho, ResponderForm } from "@/lib/governance/hub-types";
import { siteOrigin } from "@/lib/governance/server/origin";
import type { OfficeProfile } from "@/lib/reference";

/**
 * A form's public page around what it shows: the responder, a team copy, or the door to the Student Portal. The hero is in the
 * University's identity (the reverse seal with the issuing unit's mark on the night band: the University in Trajan
 * capitals, the unit in Minion capitals, a department under it in Minion; the form's number in the corner as on the
 * paper; beside it the account you're signed in as), without the site's navigation. Beside the title and lead, a share card holds the link as a QR code to
 * scan, a note, and the address to copy. The footer is one slim black strip in the hero's night: the University, the
 * issuing office and the Rankings Office, the policies and a contact link, and the time in Manila.
 */
export async function FormFrame({
  form,
  office,
  link,
  lead = form.description,
  details,
  above,
  note,
  share = true,
  who,
  children,
}: {
  form: ResponderForm;
  /** Who the page knows you as (server/form-copies.ts formWho), shown in the bar: your Hub account when signed in. */
  who?: FormWho | null;
  office: Pick<OfficeProfile, "name"> & Partial<Pick<OfficeProfile, "reportsTo" | "email">>;
  /** The link the pill shares: the form's, or a copy's. */
  link: { path?: string; copied?: string };
  lead?: ReactNode;
  /** A labelled row under the title: a copy's name, who can open it, who started it. */
  details?: { label: string; value: ReactNode; icon?: IconName }[];
  /** A line over the title, after the form's kind: a copy's reference and name. */
  above?: ReactNode;
  note?: ReactNode;
  /** The share card (QR code and address); left out where the page offers nothing to fill in. */
  share?: boolean;
  children: ReactNode;
}) {
  const url = new URL(link.path ?? `/f/${encodeURIComponent(form.code)}`, await siteOrigin()).href;
  const what = link.path ? "copy" : "form";
  const issuer = form.issuer?.replace(/\s*\(.*\)$/, "");
  const offices = [...new Set([issuer, office.name].filter((n): n is string => !!n))];
  return (
    <div className={`site fr ${siteFontVars}`}>
      <ClearableFields />
      <header className="fr-hero">
        <Stars sky="field" />
        <div className="fr-hero__in">
          <div className="fr-hero__bar">
            <Lockup unit={form.issuerUnit ?? issuer ?? office.name} department={form.issuerUnit ? issuer : undefined} reverse preload sizes="(max-width: 700px) 40.8px, 51px" />
            {(who || form.reference) && (
              <span className="fr-hero__end">
                {who && <WhoChip who={who} />}
                {form.reference && <span className="fr-hero__ref">{form.reference}</span>}
              </span>
            )}
          </div>
          <div className="fr-hero__grid" data-share={share || undefined}>
            <div className="fr-hero__text">
              <p className="fr-hero__kind">
                {formKindLabel(form.kind)}
                {above}
              </p>
              <h1 className="fr-hero__title">{form.title}</h1>
              {lead && <p className="fr-hero__lead">{lead}</p>}
              {details && (
                <dl className="fr-hero__details">
                  {details.map((d) => (
                    <div key={d.label}>
                      <dt>{d.label}</dt>
                      <dd>
                        {d.icon && <Icon name={d.icon} size={14} />}
                        <span>{d.value}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {share && (
            <aside className="fr-share" aria-label={`Share this ${what}`}>
              <div className="fr-share__main">
                <div className="fr-qr">
                  <div className="fr-qr__tile">
                    <QrCode value={url} label={`QR code that opens this ${what}`} />
                    <i className="fr-qr__scan" aria-hidden="true" />
                  </div>
                </div>
                <div className="fr-share__text">
                  <p className="fr-share__title">Scan to open</p>
                  <p className="fr-share__hint">This QR Code is specifically for your {formKindLabel(form.kind)}.</p>
                  <div className="fr-share__note">
                    {note ??
                      (form.closesOn ? (
                        <>
                          <Icon name="calendar" size={14} /> Open until {dayLabel(form.closesOn)}
                        </>
                      ) : (
                        <>
                          <Icon name="hard-drive" size={14} /> Autosaves on this device
                        </>
                      ))}
                  </div>
                </div>
              </div>
              <FormLink url={url} copied={link.copied} />
            </aside>
            )}
          </div>
        </div>
      </header>
      <main className="fr-page">{children}</main>
      <footer className="fr-foot">
        <Stars sky="bar" />
        <div className="fr-foot__in">
          <div className="fr-foot__who">
            <p className="fr-foot__uni">{UNIVERSITY}</p>
            <p className="fr-foot__offices">{offices.map((n) => (n === office.name && office.reportsTo ? `${n} (${office.reportsTo})` : n)).join("  ·  ")}</p>
            <nav className="fr-foot__links" aria-label="Policies and contact">
              {office.email && <a href={`mailto:${office.email}`}>Contact</a>}
              <Link href="/privacy">Data Privacy</Link>
              <Link href="/terms">Terms of Use</Link>
              <Link href="/cookies">Cookie Policy</Link>
              <span className="fr-foot__copy">© {new Date().getFullYear()}</span>
            </nav>
          </div>
          <FootClock />
        </div>
      </footer>
    </div>
  );
}
