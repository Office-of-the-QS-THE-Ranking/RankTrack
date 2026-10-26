"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * A unit's profile over the directory, which keeps its scroll position and blurs behind it. The dialog
 * fills the viewport so the close button can sit just outside the box; a click on the blur closes it too.
 */
export function UnitDetailsModal({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a press that starts and ends on the blur closes: a text selection dragged out of the box doesn't.
  const pressedOutside = useRef(false);
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
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        router.back();
      }}
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOutside.current) router.back();
      }}
    >
      <div className="unit-modal__frame">
        <button type="button" className="unit-modal__close" aria-label="Close" onClick={() => router.back()} autoFocus>
          <Icon name="close" size={18} strokeWidth={2} />
        </button>
        <div className="unit-modal__panel">{children}</div>
      </div>
    </dialog>
  );
}
