import Image from "next/image";
import Link from "next/link";
import { PageHero } from "./PageHero";
import { serverViews } from "@/lib/governance/server/views";


/** The public site's missing-page screen: the gold disc holds the status instead of a result. */
export async function NotFoundContent() {
  const { photos } = await serverViews();
  const NEXT = [
    { href: "/rankings", title: "The eight rankings", text: "Where UST stands in each of them, exactly as the ranking bodies published it.", photo: photos.aerial },
    { href: "/impact", title: "Impact stories", text: "Thomasian practices with a measured outcome, told so other universities can adapt them.", photo: photos["arch-aerial"] },
    { href: "/knowledge", title: "How the rankings work", text: "Every method in plain language, the shared indicators and the evidence standard.", photo: photos.library },
    { href: "/about", title: "About the Office", text: "Who keeps the University’s ranking record, how the data is governed and how to write in.", photo: photos.day },
  ];

  return (
    <>
      <PageHero
        title={
          <>
            We could not <br className="w-br" />
            find that page
          </>
        }
        lead={<p>The address may have changed when a ranking page or a story was renamed. These are good places to continue.</p>}
        actions={
          <>
            <Link href="/" className="w-btn">
              Go to the home page
            </Link>
            <Link href="/rankings" className="w-link">
              Rankings
            </Link>
          </>
        }
        figure={{ value: "404", note: "Page not found" }}
      />
      <section className="w-section w-wrap" aria-labelledby="next-title">
        <h2 id="next-title" className="w-head w-next__title" data-reveal>
          Where to go next
        </h2>
        <ul className="w-next">
          {NEXT.map((n, i) => (
            <li key={n.href} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
              <Link href={n.href} className="w-next__item">
                <span className="w-next__pic">
                  <Image src={n.photo.src} alt="" fill sizes="(max-width: 900px) 100vw, 25vw" style={{ objectPosition: n.photo.pos }} />
                </span>
                <span className="w-next__name">{n.title}</span>
                <span className="w-next__text">{n.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
