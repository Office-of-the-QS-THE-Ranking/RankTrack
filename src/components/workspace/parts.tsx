"use client";

/*
 * The Workspace's small pieces: a file's glyph (its type at a glance), a folder's art, sending uploads, and the
 * dialogs for moving and deleting. Workspace.tsx puts them together.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { startWorkspaceUploads } from "@/app/actions/workspace";
import { upload } from "@/components/publications/media";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/pickers";
import { fileExt } from "@/lib/governance/evidence-files";
import type { WorkspaceFolderItem, WorkspaceItem } from "@/lib/governance/hub-types";
import type { WorkspaceShelf } from "@/lib/governance/types";
import { fileFamily, folderTree, shelfLabel } from "@/lib/governance/workspace";

export function FileGlyph({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`ws-glyph ws-glyph--${fileFamily(name)} ws-glyph--${size}`}
      aria-hidden="true"
    >
      <i>{(fileExt(name) || "FILE").slice(0, 4)}</i>
    </span>
  );
}

/** A folder drawn as one: its back, two sheets peeking out, a frosted front. */
export function FolderArt({ names = [] }: { names?: string[] }) {
  return (
    <span className="ws-fold" aria-hidden="true">
      <span className="ws-fold__back" />
      <span className="ws-fold__sheet ws-fold__sheet--2" />
      <span className="ws-fold__sheet">
        {names[0] && <FileGlyph name={names[0]} size="sm" />}
      </span>
      <span className="ws-fold__front" />
    </span>
  );
}

/** The colour of each file family, as the glyphs show it; the drop zone's sheets use it too. */
const FAMILY_COLOR: Record<ReturnType<typeof fileFamily>, string> = {
  pdf: "#d14b3f",
  doc: "#2f6bd6",
  sheet: "#1f8a4d",
  slides: "#dc7428",
  image: "#8656d0",
  text: "#6e6e73",
};

/** The drop zone's two sheets: the first two accepted types, in their family colours. */
export function dropSheets(types: string[]): [[string, string], [string, string]] {
  const [a = "PDF", b = "DOCX"] = types;
  return [
    [a.slice(0, 4), FAMILY_COLOR[fileFamily(`x.${a}`)]],
    [b.slice(0, 4), FAMILY_COLOR[fileFamily(`x.${b}`)]],
  ];
}

/** Why the Hub won't take a file, or null when it will. */
export function refusal(f: File, uploads: { types: string[]; maxFileMB: number }) {
  const ext = fileExt(f.name) === "JPEG" ? "JPG" : fileExt(f.name);
  if (!uploads.types.includes(ext)) return `${f.name} can’t be added. Use ${uploads.types.join(", ")}.`;
  if (f.size > uploads.maxFileMB * 1_048_576) return `${f.name} is over ${uploads.maxFileMB} MB.`;
  if (!f.size) return `${f.name} is empty.`;
  return null;
}

/** A modal shell that opens on mount and reports every way it closes. */
export function Sheet({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: (close: () => void, titleId: string) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      className={`ws-sheet ${className}`}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <header className="ws-sheet__head">
        <h2 id={titleId} className="ws-sheet__title">
          {title}
        </h2>
        <button
          type="button"
          className="ws-sheet__x"
          aria-label="Close"
          onClick={close}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      {children(close, titleId)}
    </dialog>
  );
}

/** A full-size modal that opens on mount; Escape or its close button report through `onClose`. */
export function FolderModal({
  label,
  onClose,
  className = "",
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`ws-modal ${className}`} aria-label={label} onClose={onClose}>
      {children}
    </dialog>
  );
}

export type Added = { name: string; src: string };

/**
 * Send files to storage through the server's signed URLs. `onProgress` hears each file's 0 to 1; a file that
 * fails comes back as null in `files`, so the rest can still be filed.
 */
export async function sendFiles(
  unitId: string | null,
  files: File[],
  onProgress: (i: number, f: number) => void,
): Promise<{ ok: true; files: (Added | null)[] } | { ok: false; message: string }> {
  const started = await startWorkspaceUploads({
    unitId,
    files: files.map((f) => ({ name: f.name, size: f.size })),
  });
  if (!started.ok) return started;
  const sent = await Promise.allSettled(
    files.map((f, i) =>
      upload(
        started.tickets[i].url,
        { blob: f, type: started.tickets[i].type, width: 0, height: 0 },
        (part) => onProgress(i, part),
      ),
    ),
  );
  return {
    ok: true,
    files: files.map((f, i) =>
      sent[i].status === "fulfilled" ? { name: f.name, src: started.tickets[i].src } : null,
    ),
  };
}

/** Folders as picker options, indented by depth under the shelf's top level. */
function folderOptions(folders: WorkspaceFolderItem[]) {
  const kids = folderTree(folders);
  const walk = (id: string, depth: number): ReactNode[] =>
    kids(id).flatMap((f) => [
      <option key={f.id} value={f.id} data-depth={depth}>
        {f.name}
      </option>,
      ...walk(f.id, depth + 1),
    ]);
  return walk("", 0);
}

export function MoveSheet({
  file,
  shelves,
  foldersOf,
  onMove,
  onClose,
}: {
  file: WorkspaceItem;
  shelves: WorkspaceShelf[];
  /** The folders a file may go in on each shelf. */
  foldersOf: (s: WorkspaceShelf) => WorkspaceFolderItem[];
  onMove: (shelf: WorkspaceShelf, folderId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [shelf, setShelf] = useState<WorkspaceShelf>(file.shelf);
  const [pick, setPick] = useState(file.folderId ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Move file" onClose={onClose}>
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await onMove(shelf, pick)) close();
            else setBusy(false);
          }}
        >
          <p className="ws-sheet__file">
            <FileGlyph name={file.name} size="sm" />
            <span>{file.name}</span>
          </p>
          {shelves.length > 1 && (
            <label className="field">
              <span className="field__label">Shelf</span>
              <Select
                className="select"
                value={shelf}
                onChange={(v) => {
                  setShelf(v as WorkspaceShelf);
                  setPick("");
                }}
              >
                {shelves.map((s) => (
                  <option key={s} value={s}>
                    {shelfLabel(s)}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="field">
            <span className="field__label">Folder</span>
            <Select
              className="select"
              value={pick}
              onChange={setPick}
              required
              placeholder="Choose a folder"
            >
              {folderOptions(foldersOf(shelf))}
            </Select>
          </label>
          <footer className="ws-sheet__foot">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={busy}>
              Move
            </button>
          </footer>
        </form>
      )}
    </Sheet>
  );
}

export function DeleteSheet({
  files,
  onDelete,
  onClose,
}: {
  files: WorkspaceItem[];
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const one = files.length === 1;
  return (
    <Sheet
      title={one ? "Delete this file?" : `Delete ${files.length} files?`}
      onClose={onClose}
      className="ws-sheet--confirm"
    >
      {(close) => (
        <div className="ws-sheet__body">
          <p className="ws-sheet__text">
            {one
              ? `“${files[0].name}” can’t be restored after this.`
              : "They can’t be restored after this."}
          </p>
          <footer className="ws-sheet__foot">
            <button type="button" className="btn" onClick={close} autoFocus>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                if (await onDelete()) close();
                else setBusy(false);
              }}
            >
              <Icon name="trash" size={16} /> Delete
            </button>
          </footer>
        </div>
      )}
    </Sheet>
  );
}
