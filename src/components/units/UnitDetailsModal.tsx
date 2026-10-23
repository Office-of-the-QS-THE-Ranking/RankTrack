"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function UnitDetailsModal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="unit-modal"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); router.back(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          router.back();
        }
      }}
    >
      <header className="unit-modal__head">
        <h2 id={titleId}>Unit details</h2>
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Close unit details" onClick={() => router.back()} autoFocus>
          <Icon name="close" />
        </button>
      </header>
      <div className="unit-modal__body">{children}</div>
    </dialog>
  );
}
