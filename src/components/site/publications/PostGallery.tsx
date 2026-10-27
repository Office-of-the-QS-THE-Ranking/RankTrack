"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { StoryPicture } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";

/** A post's photos as a collage, the way a post shows them; any photo opens the set full screen. */
export function PostGallery({ photos, title }: { photos: StoryPicture[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = photos.slice(0, 5);
  const only = photos.length === 1 ? photos[0] : null;
  // One photo keeps its own shape, within reason.
  const ratio = only?.width && only.height ? Math.min(2, Math.max(0.8, only.width / only.height)) : undefined;
  return (
    <>
      <ul className={`w-gallery w-gallery--${shown.length}`} style={ratio ? ({ "--ratio": ratio } as CSSProperties) : undefined} data-reveal>
        {shown.map((p, i) => (
          <li key={p.src} className="w-gallery__tile">
            <button type="button" className="w-gallery__open" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${photos.length}${p.alt ? `: ${p.alt}` : ""}`}>
              <Image src={p.src} alt={p.alt} fill sizes={shown.length === 1 ? "(max-width: 900px) 100vw, 66vw" : "(max-width: 900px) 50vw, 33vw"} />
              {i === 4 && photos.length > 5 && <span className="w-gallery__more">+{photos.length - 5}</span>}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox photos={photos} start={open} title={title} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ photos, start, title, onClose }: { photos: StoryPicture[]; start: number; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [at, setAt] = useState(start);
  const swipe = useRef<number | null>(null);
  const many = photos.length > 1;
  const go = (step: number) => setAt((i) => (i + step + photos.length) % photos.length);
  const p = photos[at];

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLButtonElement>(".w-lightbox__btn--close")?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="w-lightbox"
      aria-label={`Photos from “${title}”`}
      onClose={onClose}
      onKeyDown={(e) => {
        if (!many || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      onPointerDown={(e) => {
        swipe.current = e.clientX;
      }}
      onPointerUp={(e) => {
        const from = swipe.current;
        swipe.current = null;
        if (many && from !== null && Math.abs(e.clientX - from) > 48) go(e.clientX < from ? 1 : -1);
      }}
    >
      <figure className="w-lightbox__fig">
        <div className="w-lightbox__pic">
          <Image key={p.src} src={p.src} alt={p.alt} fill sizes="92vw" />
        </div>
        <figcaption className="w-lightbox__cap">
          <span>{p.alt}</span>
          {many && (
            <span className="w-lightbox__count" aria-live="polite">
              {at + 1} / {photos.length}
            </span>
          )}
        </figcaption>
      </figure>
      {many && (
        <>
          <button type="button" className="w-lightbox__btn w-lightbox__btn--prev" aria-label="Previous photo" onClick={() => go(-1)}>
            <Icon name="arrow-left" size={22} />
          </button>
          <button type="button" className="w-lightbox__btn w-lightbox__btn--next" aria-label="Next photo" onClick={() => go(1)}>
            <Icon name="arrow" size={22} />
          </button>
        </>
      )}
      <button type="button" className="w-lightbox__btn w-lightbox__btn--close" aria-label="Close" onClick={() => ref.current?.close()}>
        <Icon name="close" size={22} />
      </button>
    </dialog>
  );
}
