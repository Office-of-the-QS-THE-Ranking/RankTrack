"use client";

import { Icon } from "@/components/ui/Icon";

/** Says the page is a preview, and closes the tab the composer opened. */
export function PreviewStrip() {
  const exit = () => {
    window.close();
    // A tab the browser won't let a page close (opened by hand) goes back instead.
    if (window.closed) return;
    if (history.length > 1) history.back();
    else location.assign("/");
  };
  return (
    <div className="w-preview-strip" role="region" aria-label="Preview mode">
      <span className="w-preview-strip__label">
        <Icon name="eye" size={16} /> Preview mode
      </span>
      <span className="w-preview-strip__note">Not published. Changes in the composer show here.</span>
      <button type="button" className="w-preview-strip__exit" onClick={exit}>
        <Icon name="close" size={14} /> Exit preview
      </button>
    </div>
  );
}
