import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeModal, openModal } from "@/components/ui/modal-motion";

class Dialog {
  open = true;
  inert = false;
  dataset: Record<string, string> = {};
  close = vi.fn(() => { this.open = false; });
  showModal = vi.fn(() => { this.open = true; });
  matches = vi.fn(() => false);
  querySelectorAll = vi.fn(() => []);
  finish!: () => void;
  cancel = vi.fn();
  animate = vi.fn(() => ({
    finished: new Promise<void>((resolve) => { this.finish = resolve; }),
    cancel: this.cancel,
  }));
}
const element = (dialog: Dialog) => dialog as unknown as HTMLDialogElement;
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

beforeEach(() => {
  vi.stubGlobal("HTMLDialogElement", Dialog);
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ opacity: "1", translate: "none", scale: "none" }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("shared modal motion", () => {
  it("keeps the dialog open until exit ends and ignores repeated close requests", async () => {
    const dialog = new Dialog();
    closeModal(element(dialog));
    closeModal(element(dialog));
    expect(dialog.open).toBe(true);
    expect(dialog.inert).toBe(true);
    expect(dialog.animate).toHaveBeenCalledTimes(1);
    dialog.finish();
    await tick();
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(dialog.inert).toBe(false);
    expect(dialog.dataset.modalClosing).toBeUndefined();
  });

  it("waits before unmount callbacks and keeps a slow route transition hidden", async () => {
    const dialog = new Dialog();
    const remove = vi.fn();
    closeModal(element(dialog), remove);
    expect(remove).not.toHaveBeenCalled();
    dialog.finish();
    await tick();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.inert).toBe(true);
    expect(dialog.cancel).not.toHaveBeenCalled();
  });

  it("cancels a pending exit when the same dialog is reopened", async () => {
    const dialog = new Dialog();
    closeModal(element(dialog));
    openModal(element(dialog));
    dialog.finish();
    await tick();
    expect(dialog.open).toBe(true);
    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.inert).toBe(false);
    expect(dialog.dataset.modalClosing).toBeUndefined();
  });

  it("closes immediately for reduced motion and when animation isn't available", () => {
    const dialog = new Dialog();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    closeModal(element(dialog));
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(dialog.animate).not.toHaveBeenCalled();
    const done = vi.fn();
    closeModal(null, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("animates nested confirmations before removing the containing modal", async () => {
    const parent = new Dialog();
    const child = new Dialog();
    parent.querySelectorAll = vi.fn(() => [element(child)]) as unknown as typeof parent.querySelectorAll;
    closeModal(element(parent));
    expect(child.animate).toHaveBeenCalledTimes(1);
    child.finish();
    parent.finish();
    await tick();
    expect(child.close).toHaveBeenCalledTimes(1);
    expect(parent.close).toHaveBeenCalledTimes(1);
  });
});
