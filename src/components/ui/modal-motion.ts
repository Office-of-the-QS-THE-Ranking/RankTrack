const exits = new WeakMap<HTMLElement, { animation: Animation; wasInert: boolean }>();

/** A quick reopen cancels a pending exit instead of letting it close the new window. */
export function cancelModalClose(element: HTMLElement | null): void {
  if (!element) return;
  const exit = exits.get(element);
  if (!exit) return;
  exits.delete(element);
  exit.animation.cancel();
  element.inert = exit.wasInert;
  delete element.dataset.modalClosing;
}

export function openModal(element: HTMLDialogElement | null): void {
  if (!element) return;
  cancelModalClose(element);
  if (!element.open) element.showModal();
}

/** Keep a modal mounted and modal until its exit finishes, then run its existing close action. */
export function closeModal(element: HTMLElement | null, complete?: () => void): void {
  const finish = () => {
    if (complete) complete();
    else if (element instanceof HTMLDialogElement && element.open) element.close();
  };
  if (!element) return finish();
  if (element.dataset.modalClosing) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") {
    finish();
    return;
  }

  const style = window.getComputedStyle(element);
  const from = { opacity: style.opacity, translate: style.translate, scale: style.scale };
  const wasInert = element.inert;
  // Nested confirmations live in the top layer independently of their parent.
  for (const child of element.querySelectorAll<HTMLDialogElement>("dialog[open]")) closeModal(child);
  element.dataset.modalClosing = "true";
  element.inert = true;
  const drawer = element.matches(".drawer, .adm-sheet:not(.adm-sheet--modal)");
  const animation = element.animate([
    from,
    { opacity: 0, translate: drawer ? "24px 0" : "0 10px", scale: drawer ? "1" : "0.985" },
  ], { duration: 240, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
  const exit = { animation, wasInert };
  exits.set(element, exit);
  // Cancellation (for example on navigation) must never strand the close callback.
  void animation.finished.catch(() => {}).then(() => {
    if (exits.get(element) !== exit) return;
    if (element.isConnected === false) {
      exits.delete(element);
      animation.cancel();
      return;
    }
    try {
      if (!complete) element.inert = wasInert;
      finish();
    } finally {
      // Custom callbacks remove their own modal (possibly after a route change).
      // Keep the final frame until removal so a slow navigation never flashes it open again.
      if (!complete) {
        exits.delete(element);
        animation.cancel();
        delete element.dataset.modalClosing;
      }
    }
  });
}
