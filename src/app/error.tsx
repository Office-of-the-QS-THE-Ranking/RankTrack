"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { Pattern } from "@/components/ui/primitives";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="nf">
      <div className="nf__card">
        <Pattern fade="up" />
        <Image className="seal" src="/brand/ust-seal.png" alt="" width={56} height={56} />
        <p className="dash-head__eyebrow">Something went wrong</p>
        <h1 className="nf__title">This page could not load</h1>
        <p className="text-2">Try again. If it keeps happening, tell the Office which page you were on{error.digest ? ` and quote reference ${error.digest}` : ""}.</p>
        <div className="btns-row">
          <button type="button" className="btn btn--dark" onClick={reset}>
            <Icon name="history" size={18} /> Try again
          </button>
          <Link href="/" className="btn">
            Public dashboard
          </Link>
          <a className="btn btn--ghost" href="mailto:rankings.office@ust.edu.ph?subject=Hub%20error">
            Contact the Office
          </a>
        </div>
      </div>
    </main>
  );
}
