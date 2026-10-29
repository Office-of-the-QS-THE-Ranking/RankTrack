"use client";

import { closeModal, openModal } from "@/components/ui/modal-motion";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * A contribution over the table, in the unit profile's modal: the page blurs behind it and the close button
 * sits just outside the box, with previous and next under it to work down the list. A click on the blur closes it.
 */
export function RecordModal({
  label,
  onClose,
  onPrev,
  onNext,
  page,
  children,
}: {
  label: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Changes with the record shown, so the box starts again at the top. */
  page: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only a press that starts and ends on the blur closes: a text selection dragged out of the box doesn't.
  const pressedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousOverflow = document.documentElement.style.overflow;
    if (!dialog.open) openModal(dialog);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <dialog
      ref={ref}
      className="unit-modal cv-modal"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        closeModal(ref.current, onClose);
      }}
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOutside.current) closeModal(ref.current, onClose);
      }}
    >
      <div className="unit-modal__frame cv-modal__frame">
        <div className="cv-modal__rail">
          <button type="button" className="unit-modal__close" aria-label="Close" onClick={() => closeModal(ref.current, onClose)} autoFocus>
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
          {(onPrev || onNext) && (
            <>
              <button type="button" className="cv-modal__step" aria-label="Previous contribution" title="Previous" disabled={!onPrev} onClick={onPrev}>
                <Icon name="arrow-up" size={18} strokeWidth={2} />
              </button>
              <button type="button" className="cv-modal__step" aria-label="Next contribution" title="Next" disabled={!onNext} onClick={onNext}>
                <Icon name="arrow-down" size={18} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
        <div className="unit-modal__panel cv-modal__panel">
          <div ref={scrollRef} className="cv-modal__scroll">
            {children}
          </div>
        </div>
      </div>
    </dialog>
  );
}
