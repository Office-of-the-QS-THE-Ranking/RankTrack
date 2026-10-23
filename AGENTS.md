<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Notifications and alerts are toasts

Every notification or alert is a toast at the top right that closes itself after 8 seconds. That covers anything reporting an outcome or event: "You signed out.", "Changes saved.", "Request sent.", "Could not save: …".

- Call `toast(message, tone)` from `src/components/ui/toast.tsx`. Tone is `"ok"`, `"error"` or `"info"`. For a server result, use `toast(r.message, r.ok ? "ok" : "error")`. In the Administration console, `notify` and `useAct` call the same toast.
- `<Toaster />` is mounted once in `src/app/layout.tsx`. Don't mount another. For an outcome, don't build a local toast, a banner, a `Notice`, or a status line inside the page.
- Don't override the timing or position. `TOAST_MS` is 8000 ms for every toast. The timer pauses while the pointer or keyboard focus is on a toast, and each toast has a close button. Toasts stack newest first, up to four. A repeated message restarts its timer instead of adding a copy. They sit 16px from the top right (full width minus 16px gutters on phones) and show above modal dialogs.
- When a message arrives with a redirect (for example `/signin?ended=signed-out`), show it as a toast on arrival and remove the parameter from the URL.
- These stay inline and are not toasts: validation for the field someone is filling in (shown next to that field), standing page context (read-only, locked, scope or data warnings), the admin-set site notice banner, the bell's notification inbox, and a form's own confirmation screen that replaces the form after it is sent.
