import Image from "next/image";
import Link from "next/link";
import { PHOTOS } from "@/lib/site";
import { OFFICE } from "@/lib/office";

/** Inset panel with a shaped portrait: the Office, its rule of reporting, and the Arch of the Centuries in a circle. */
export function OfficePanel() {
  return (
    <section className="w-office" aria-labelledby="office-title">
      <div className="w-office__panel w-on-dark">
        <h2 id="office-title" className="w-office__title w-head" data-reveal>
          Every result, as published
        </h2>
        <div className="w-office__disc" data-reveal="disc">
          <Image src={PHOTOS.arch.src} alt={PHOTOS.arch.alt} fill sizes="(max-width: 900px) 86vw, 40vw" style={{ objectPosition: PHOTOS.arch.pos }} />
        </div>
        <div className="w-office__text">
          <div data-reveal>
            <h3 className="w-office__sub">What the Office does</h3>
            <p>
              {OFFICE.summary}
            </p>
          </div>
          <div data-reveal style={{ ["--d" as string]: "90ms" }}>
            <h3 className="w-office__sub">Our vision for 2030</h3>
            <p>
              {OFFICE.vision}
            </p>
          </div>
          <div data-reveal style={{ ["--d" as string]: "160ms" }}>
            <Link href="/about" className="w-btn">
              About the Office
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
