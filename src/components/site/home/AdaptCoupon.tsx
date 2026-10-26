"use client";

import { useState, type FormEvent } from "react";
import { Select } from "@/components/ui/pickers";

const OFFICE = "rankings.office@ust.edu.ph";

/**
 * Clip-out coupon: the request to adapt a Thomasian practice. There is no form backend, so sending
 * opens the visitor's email app with the message already written (and plain mailto without script).
 */
export function AdaptCoupon({
  practice,
  headingLevel = 2,
  stories: PUBLISHED_STORIES,
}: {
  practice?: string;
  headingLevel?: 2 | 3;
  /** Published practices, from the governance layer. */
  stories: { slug: string; title: string; unit: string }[];
}) {
  const [chosen, setChosen] = useState(practice ?? PUBLISHED_STORIES[0]?.slug ?? "");
  const H = headingLevel === 2 ? "h2" : "h3";

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const story = PUBLISHED_STORIES.find((s) => s.slug === chosen);
    const subject = `Adapting a Thomasian practice: ${story?.title ?? "a practice"}`;
    const body = [
      "Dear Office of QS/THE Rankings,",
      "",
      `We would like to adapt “${story?.title}” (${story?.unit}) at our institution. Could you share the guidance and any design files or templates available?`,
      "",
      `Name: ${f.get("name")}`,
      `Institution: ${f.get("org")}`,
      `Email: ${f.get("email")}`,
      story ? `Story: ${window.location.origin}/impact/${story.slug}` : "",
    ].join("\n");
    window.location.href = `mailto:${OFFICE}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section className="w-adapt w-section w-wrap" id="adapt" aria-labelledby="adapt-title">
      <form className="w-coupon" action={`mailto:${OFFICE}`} method="post" encType="text/plain" onSubmit={send} data-reveal>
        <div className="w-coupon__left">
          <H id="adapt-title" className="w-coupon__title">
            Adapt a practice
          </H>
          <p>
            Tell us which Thomasian practice and where you work. Contact the Office to discuss guidance, templates and design
            files the story lists.
          </p>
        </div>
        <div className="w-coupon__right">
          <label className="w-field">
            <span className="w-field__label">Your name</span>
            <input name="name" autoComplete="name" required />
          </label>
          <label className="w-field">
            <span className="w-field__label">Institution</span>
            <input name="org" autoComplete="organization" required />
          </label>
          <label className="w-field">
            <span className="w-field__label">Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="w-field">
            <span className="w-field__label">Practice</span>
            <Select className="w-field__select" name="practice" value={chosen} onChange={setChosen}>
              {PUBLISHED_STORIES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className="w-coupon__submit">
            Write to the Office
          </button>
          <p className="w-coupon__alt">
            Opens your email app with the message written. Or write to <a href={`mailto:${OFFICE}`}>{OFFICE}</a>.
          </p>
        </div>
      </form>
    </section>
  );
}
