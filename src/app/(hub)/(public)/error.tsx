"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageHero } from "@/components/site/PageHero";
import { useOptionalReference } from "@/components/reference/ReferenceProvider";

export default function PublicError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const email = useOptionalReference()?.office.email;
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
          <button type="button" className="w-btn" onClick={retry}>
            Try again
          </button>
          <Link href="/" className="w-link">
            Home page
          </Link>
          <a href={email ? `mailto:${email}?subject=Website%20error` : "/about#contact"} className="w-link">
            Write to the Office
          </a>
        </>
      }
      figure={{ value: "!", note: "Something went wrong" }}
    />
  );
}
