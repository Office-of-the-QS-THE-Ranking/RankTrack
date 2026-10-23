"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageHero } from "@/components/site/PageHero";

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageHero
      title={
        <>
          This page could <br className="w-br" />
          not load
        </>
      }
      lead={
        <p>Try again. If it keeps happening, tell the Office which page you were on{error.digest ? ` and quote reference ${error.digest}` : ""}.</p>
      }
      actions={
        <>
          <button type="button" className="w-btn" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="w-link">
            Home page
          </Link>
          <a href="mailto:rankings.office@ust.edu.ph?subject=Website%20error" className="w-link">
            Write to the Office
          </a>
        </>
      }
      figure={{ value: "!", note: "Something went wrong" }}
    />
  );
}
