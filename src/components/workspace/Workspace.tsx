"use client";

/*
 * The Workspace: a unit's files on the Resource Library and Archives, with the Office's shared folders and
 * files beside the unit's own. A shelf shows folders with files inside them.
 * A folder opens in a full-size modal: its path, the folders inside it and its files; folders inside open in the
 * same modal. Files from the computer go only into a folder: dropped on a folder card, or anywhere on an open folder
 * (an empty one shows the drop zone). Files and folders dragged onto a folder move there. Each shelf, and Archives, is its own page under the sidebar's
 * Workspace row.
 */
import { useMemo, useRef, useState } from "react";
import type { Command } from "@/lib/governance/commands";
import type { WorkspaceDesk, WorkspaceFolderItem, WorkspaceItem } from "@/lib/governance/hub-types";
import type { WorkspaceShelf } from "@/lib/governance/types";
import {
  fileSize,
  folderTrail,
  folderTree,
  shelfLabel,
  WORKSPACE_LIMITS,
  WORKSPACE_SHELVES,
  workspaceViewLabel as viewLabel,
  type WorkspaceView as View,
} from "@/lib/governance/workspace";
import { useGovern } from "@/components/hub/HubProvider";
import { Dropzone, sizeOf, UploadRow } from "@/components/publications/ComposerPanels";
import { RowMenu, SortMark, type MenuItem } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import { DeleteSheet, dropSheets, FileGlyph, FolderArt, FolderModal, MoveSheet, refusal, sendFiles, Sheet } from "./parts";
import { DocArt, ShelfHero } from "./ShelfHero";

type Sort = { by: "name" | "date" | "size"; dir: 1 | -1 };

/** A file on its way up: its row in the tray until it's filed. */
type Upload = {
  key: string;
  file: File;
  folderId: string;
  progress?: number;
  failed?: string;
};

/** Naming a folder: a new one inside `parentId` ("" for the top level), or renaming `id`. */
type Naming = { id?: string; parentId: string };

/** What's being dragged inside the page: a file or a folder, by id. */
type Carried = { kind: "file" | "folder"; id: string };

const CARRY = "application/x-hub-workspace";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Manila",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const when = (iso: string) =>
  (iso.slice(0, 4) === String(new Date().getFullYear()) ? DAY : DAY_YEAR).format(new Date(iso));

/** The pages this component shows: the shelves of files, and Archives. Digital Forms has its own. */
type FilesView = Exclude<View, "forms">;

const EMPTY: Record<FilesView, string> = {
  working: "No folders yet",
  library: "The library has no folders yet",
  archive: "Nothing archived",
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

let uploadSeq = 0;

export function Workspace({ desk, view }: { desk: WorkspaceDesk; view: FilesView }) {
  const { run, pending } = useGovern();
  const archive = view === "archive";
  const shelf = archive ? null : view;
  /** The folder open; null for the shelf's folders. */
  const [place, setPlace] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ by: "date", dir: -1 });
  const [moving, setMoving] = useState<WorkspaceItem | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceItem[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [tray, setTray] = useState<Upload[]>([]);
  /** Files from the computer are over the page. */
  const [dragging, setDragging] = useState(false);
  /** The folder a drag is over ("" for the top level). */
  const [target, setTarget] = useState<string | null>(null);
  /** Archives: the shelf archived files came from, picked on the header. */
  const [fromShelf, setFromShelf] = useState<WorkspaceShelf | null>(null);
  const carried = useRef<Carried | null>(null);
  const depth = useRef(0);
  const browse = useRef<HTMLInputElement>(null);
  /** Escape was pressed in a name field, so the blur that follows keeps nothing. */
  const dropped = useRef(false);

  /** Things written here are the viewer's to change; in a unit's Workspace the Office's shared ones are read-only. */
  const mine = (x: { shared: boolean }) => desk.canWrite && (desk.unitId ? !x.shared : x.shared);

  const inView = useMemo(
    () => desk.files.filter((f) => (archive ? f.archivedAt : !f.archivedAt && f.shelf === view)),
    [archive, desk.files, view],
  );
  const folders = useMemo(() => (shelf ? desk.folders.filter((f) => f.shelf === shelf) : []), [desk.folders, shelf]);
  const kids = useMemo(() => folderTree(folders), [folders]);
  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  /** Files in each folder, counting the folders inside it. */
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of inView) for (const x of folderTrail(folders, f.folderId)) n.set(x.id, (n.get(x.id) ?? 0) + 1);
    return n;
  }, [inView, folders]);

  const here = place ? (byId.get(place) ?? null) : null;
  const open = here?.id ?? null;
  const trail = folderTrail(folders, open ?? undefined);
  const term = q.trim().toLowerCase();

  /** Where a file sits, as words. */
  const whereOf = (f: WorkspaceItem) =>
    [...(archive ? [shelfLabel(f.shelf)] : []), ...folderTrail(desk.folders, f.folderId).map((x) => x.name)].join(
      " / ",
    );

  /** The files listed: search hits on the shelf, everything archived, or the open folder's own. */
  const shown = useMemo(() => {
    const hits = inView.filter((f) =>
      term
        ? [f.name, f.addedBy, ...folderTrail(desk.folders, f.folderId).map((x) => x.name)].some((t) =>
            t.toLowerCase().includes(term),
          )
        : archive || (open !== null && f.folderId === open),
    );
    const key = (f: WorkspaceItem) => (archive ? f.archivedAt! : f.updatedAt);
    return hits
      .filter((f) => !archive || !fromShelf || f.shelf === fromShelf)
      .sort(
        (a, b) =>
          (sort.by === "name"
            ? a.name.localeCompare(b.name)
            : sort.by === "size"
              ? a.bytes - b.bytes
              : key(a).localeCompare(key(b))) * sort.dir,
      );
  }, [inView, term, open, archive, sort, desk.folders, fromShelf]);

  /** Archives' header filters: one per shelf something was archived from. */
  const archivedFrom = WORKSPACE_SHELVES.map((s) => ({
    key: s.key,
    label: s.label,
    count: archive ? inView.filter((f) => f.shelf === s.key).length : 0,
    tone: s.key,
  })).filter((c) => c.count > 0);

  /** The shelf's own folders, as the page shows them; the open folder's, as its modal shows them. */
  const top = archive || term ? [] : kids("");
  const inside = here ? kids(here.id) : [];
  /** Folders can be made on the shelf, and inside a folder of the viewer's. */
  const canFoldTop = !archive && desk.canWrite;
  const canFold = canFoldTop && (here ? mine(here) : true);
  /** Files go only into a folder the viewer may write. */
  const canAdd = !archive && !!here && mine(here);
  const pendingHere = tray.filter((u) => u.folderId === open);
  /** A new folder's name field shows among the cards of the place it's going. */
  const draftIn = (parentId: string) => !!naming && !naming.id && naming.parentId === parentId;

  const act = async (cmd: Command) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    return r.ok;
  };

  /* ---------- Uploading ---------- */

  const patch = (keys: string[], change: Partial<Upload> | null) =>
    setTray((t) =>
      change === null
        ? t.filter((u) => !keys.includes(u.key))
        : t.map((u) => (keys.includes(u.key) ? { ...u, ...change } : u)),
    );

  /** Upload files into a folder. */
  const uploadTo = async (folderId: string, list: File[], retry?: string[]) => {
    if (!shelf || !folderId || !list.length) return;
    const bad = list.map((f) => refusal(f, desk.uploads)).find(Boolean);
    if (bad) toast(bad, "error");
    let files = list.filter((f) => !refusal(f, desk.uploads));
    if (files.length > WORKSPACE_LIMITS.batch) {
      toast(`Add at most ${WORKSPACE_LIMITS.batch} files at a time.`, "info");
      files = files.slice(0, WORKSPACE_LIMITS.batch);
    }
    if (!files.length) return;
    const keys = retry ?? files.map(() => `up-${++uploadSeq}`);
    if (retry) patch(keys, { progress: 0, failed: undefined });
    else setTray((t) => [...t, ...files.map((file, i) => ({ key: keys[i], file, folderId, progress: 0 }))]);

    const sent = await sendFiles(desk.unitId, files, (i, part) => patch([keys[i]], { progress: part }));
    if (!sent.ok) return patch(keys, { progress: undefined, failed: sent.message });
    const up = keys.filter((_, i) => sent.files[i]);
    const lost = keys.filter((_, i) => !sent.files[i]);
    if (lost.length) patch(lost, { progress: undefined, failed: "Didn’t upload. Check your connection and retry." });
    if (!up.length) return;
    const filed = await act({
      type: "workspace.add",
      unitId: desk.unitId ?? undefined,
      shelf,
      folderId,
      files: sent.files.filter((f) => f !== null),
    });
    patch(up, filed ? null : { progress: undefined, failed: "Uploaded but not filed. Retry to send it again." });
  };

  /* ---------- Folders ---------- */

  const saveName = async (typed: string) => {
    const n = naming;
    setNaming(null);
    if (dropped.current) return;
    const name = typed.trim();
    if (!n || !shelf || !name) return;
    if (n.id) {
      const f = byId.get(n.id);
      if (f && name !== f.name) await act({ type: "workspace.folder", id: n.id, shelf, name });
    } else {
      await act({
        type: "workspace.folder",
        unitId: desk.unitId ?? undefined,
        shelf,
        ...(n.parentId && { parentId: n.parentId }),
        name,
      });
    }
  };

  const go = (id: string | null) => {
    setPlace(id);
    setQ("");
    setNaming(null);
  };

  const newFolder = (parentId = open ?? "") => {
    go(parentId || null);
    setNaming({ parentId });
  };

  /** A folder's own menu: make one inside it, rename, delete when empty. */
  const folderMenu = (f: WorkspaceFolderItem) =>
    mine(f) && (
      <RowMenu
        label={`Actions for folder ${f.name}`}
        disabled={pending}
        items={[
          { label: "New folder inside", icon: "folder-plus", onSelect: () => newFolder(f.id) },
          { label: "Rename", icon: "pen", onSelect: () => setNaming({ id: f.id, parentId: f.parentId ?? "" }) },
          {
            label: "Delete",
            icon: "trash",
            danger: true,
            onSelect: () => void act({ type: "workspace.folderDelete", id: f.id }),
          },
        ]}
      />
    );

  /* ---------- Dragging ---------- */

  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes("Files");

  /** Whether what's dragged may land in folder `id` ("" for the top level, which takes folders only). */
  const takes = (id: string, e: React.DragEvent) => {
    if (!shelf) return false;
    const into = id ? byId.get(id) : null;
    if (into ? !mine(into) : !desk.canWrite) return false;
    if (hasFiles(e)) return !!into;
    const c = carried.current;
    if (!c || ![...e.dataTransfer.types].includes(CARRY)) return false;
    if (c.kind === "file") return !!into && desk.files.find((f) => f.id === c.id)?.folderId !== id;
    // A folder can't go inside itself or where it already is.
    const f = byId.get(c.id);
    return !!f && (f.parentId ?? "") !== id && !folderTrail(folders, id || undefined).some((x) => x.id === c.id);
  };

  /** Make an element a place to drop into folder `id`. */
  const dropInto = (id: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!takes(id, e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = hasFiles(e) ? "copy" : "move";
      setTarget(id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget((t) => (t === id ? null : t));
    },
    onDrop: (e: React.DragEvent) => {
      if (!takes(id, e)) return;
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      const c = carried.current;
      carried.current = null;
      if (e.dataTransfer.files.length) return void uploadTo(id, [...e.dataTransfer.files]);
      if (!c || !shelf) return;
      if (c.kind === "file") void act({ type: "workspace.edit", id: c.id, folderId: id });
      else {
        const f = byId.get(c.id);
        if (f) void act({ type: "workspace.folder", id: f.id, shelf, parentId: id, name: f.name });
      }
    },
  });

  const carry = (c: Carried) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      carried.current = c;
      e.dataTransfer.setData(CARRY, c.id);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => {
      carried.current = null;
      setTarget(null);
    },
  });

  const endDrag = () => {
    depth.current = 0;
    setDragging(false);
    setTarget(null);
  };

  const sortBy = (by: Sort["by"]) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "name" ? 1 : -1 }));
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);

  const rename = async (f: WorkspaceItem, typed: string) => {
    setRenaming(null);
    if (dropped.current) return;
    if (typed.trim() && typed.trim() !== f.name) await act({ type: "workspace.edit", id: f.id, name: typed });
  };

  /** The name field for the file being renamed. */
  const renameInput = (f: WorkspaceItem) => (
    <input
      className="ws-name__edit"
      defaultValue={f.name}
      aria-label={`Rename ${f.name}`}
      maxLength={WORKSPACE_LIMITS.name}
      autoFocus
      onFocus={(e) => {
        dropped.current = false;
        e.currentTarget.setSelectionRange(0, f.name.lastIndexOf(".") > 0 ? f.name.lastIndexOf(".") : f.name.length);
      }}
      onBlur={(e) => void rename(f, e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          dropped.current = true;
          setRenaming(null);
        }
      }}
    />
  );

  /** A file's row menu. */
  const menuFor = (f: WorkspaceItem): (MenuItem | false | "" | undefined)[] => [
    { label: "Download", icon: "download", onSelect: () => window.open(f.src, "_blank", "noopener") },
    mine(f) && !f.archivedAt && { label: "Rename", icon: "pen", onSelect: () => setRenaming(f.id) },
    mine(f) && !f.archivedAt && { label: "Move", icon: "move", onSelect: () => setMoving(f) },
    mine(f) &&
      !f.archivedAt && {
        label: "Archive",
        icon: "archive",
        onSelect: () => void act({ type: "workspace.archive", ids: [f.id], archived: true }),
      },
    mine(f) &&
      f.archivedAt && {
        label: `Restore to ${shelfLabel(f.shelf)}`,
        icon: "undo",
        onSelect: () => void act({ type: "workspace.archive", ids: [f.id], archived: false }),
      },
    mine(f) && f.archivedAt && { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting([f]) },
  ];

  /** Folders a moved file may go in, on each shelf. */
  const foldersOf = (s: WorkspaceShelf) => desk.folders.filter((f) => f.shelf === s && mine(f));

  const nameField = (initial: string, label: string) => (
    <input
      className="ws-namefield"
      defaultValue={initial}
      aria-label={label}
      placeholder="Folder name"
      maxLength={WORKSPACE_LIMITS.folder}
      autoFocus
      onFocus={(e) => {
        dropped.current = false;
        e.currentTarget.select();
      }}
      onBlur={(e) => void saveName(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          dropped.current = true;
          setNaming(null);
        }
      }}
    />
  );

  /* ---------- Pieces ---------- */

  const folderCards = (list: WorkspaceFolderItem[], parentId: string) => (
    <ul className="ws-tiles">
      {draftIn(parentId) && (
        <li>
          <div className="ws-tile ws-tile--new">
            <FolderArt />
            {nameField("", "New folder name")}
          </div>
        </li>
      )}
      {list.map((t) => {
        const inside = kids(t.id).length;
        const n = counts.get(t.id) ?? 0;
        return (
          <li key={t.id} className={target === t.id ? "is-target" : undefined} {...dropInto(t.id)}>
            {naming?.id === t.id ? (
              <div className="ws-tile ws-tile--new">
                <FolderArt />
                {nameField(t.name, `Rename folder ${t.name}`)}
              </div>
            ) : (
              <button
                type="button"
                className="ws-tile"
                onClick={() => go(t.id)}
                {...(mine(t) && carry({ kind: "folder", id: t.id }))}
              >
                <FolderArt
                  names={inView
                    .filter((f) => f.folderId === t.id)
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                    .map((f) => f.name)}
                />
                <span className="ws-tile__name">{t.name}</span>
                <span className="ws-tile__count">
                  {[inside > 0 && plural(inside, "folder"), plural(n, "file")].filter(Boolean).join(" · ")}
                </span>
                {t.shared && desk.unitId && <span className="ws-tile__tag">Office</span>}
                {mine(t) && (
                  <span className="ws-tile__drop" aria-hidden="true">
                    <Icon name="upload" size={14} /> Drop to add
                  </span>
                )}
              </button>
            )}
            {naming?.id !== t.id && <span className="ws-tile__menu">{folderMenu(t)}</span>}
          </li>
        );
      })}
    </ul>
  );

  const fileList = (where: boolean) => (
      <div className="ws-card">
        <table className="ws-table">
          <caption className="sr-only">{here ? here.name : viewLabel(view)}</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort("name")}>
                <button type="button" className="pm-sort" onClick={() => sortBy("name")}>
                  File <SortMark on={sort.by === "name"} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="ws-col-who">
                {archive ? "Archived by" : "Added by"}
              </th>
              <th scope="col" className="ws-col-date" aria-sort={ariaSort("date")}>
                <button type="button" className="pm-sort" onClick={() => sortBy("date")}>
                  {archive ? "Archived" : "Modified"} <SortMark on={sort.by === "date"} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="ws-col-size" aria-sort={ariaSort("size")}>
                <button type="button" className="pm-sort" onClick={() => sortBy("size")}>
                  Size <SortMark on={sort.by === "size"} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="ws-col-menu">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr
                key={f.id}
                className="ws-row"
                {...(!archive && mine(f) && renaming !== f.id && carry({ kind: "file", id: f.id }))}
              >
                <td className="ws-col-name">
                  <div className="ws-file">
                    <FileGlyph name={f.name} />
                    <span className="ws-name">
                      {renaming === f.id ? (
                        renameInput(f)
                      ) : (
                        <a className="ws-name__link" href={f.src} download={f.name} draggable={false}>
                          {f.name}
                        </a>
                      )}
                      <span className="ws-name__sub">
                        {f.shared && desk.unitId && <span className="ws-office">Office</span>}
                        {where && whereOf(f) && (
                          <span className="ws-name__where">
                            <Icon name="folder" size={12} />
                            {whereOf(f)}
                          </span>
                        )}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="ws-col-who">
                  <span className="ws-who">
                    <span className="ws-avatar" aria-hidden="true">
                      {initials(archive ? (f.archivedBy ?? "") : f.addedBy)}
                    </span>
                    <span className="ws-who__name">{archive ? f.archivedBy : f.addedBy}</span>
                  </span>
                </td>
                <td className="ws-col-date">
                  <time dateTime={archive ? f.archivedAt : f.updatedAt}>
                    {when(archive ? f.archivedAt! : f.updatedAt)}
                  </time>
                </td>
                <td className="ws-col-size">{fileSize(f.bytes)}</td>
                <td className="ws-col-menu">
                  <RowMenu label={`Actions for ${f.name}`} disabled={pending} items={menuFor(f)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const empty = (title: string, action?: React.ReactNode) => (
    <div className="ws-empty">
      <span className="ws-empty__art">
        <FolderArt />
      </span>
      <p className="ws-empty__title">{title}</p>
      {action}
    </div>
  );

  /* ---------- Render ---------- */

  return (
    <div
      className={`ws${dragging ? " is-dragging" : ""}${canAdd ? " ws--open" : ""}`}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        // Files land only in a folder: anywhere on an open folder, never loose on the shelf.
        e.preventDefault();
        e.dataTransfer.dropEffect = canAdd ? "copy" : "none";
      }}
      onDragLeave={() => {
        if (--depth.current <= 0) endDrag();
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files];
        endDrag();
        if (!files.length) return;
        e.preventDefault();
        if (canAdd && open) void uploadTo(open, files);
        else if (!archive && desk.canWrite) toast("Drop files onto a folder.", "info");
      }}
    >
      {view === "library" && (
        <ShelfHero
          title="Resource Library"
          tone="library"
          chips={[
            { key: "folders", label: "Folders", count: folders.length },
            { key: "files", label: "Files", count: inView.length },
          ]}
          art={(
            [
              ["pdf", "PDF"],
              ["doc", "DOCX"],
              ["sheet", "XLSX"],
            ] as const
          ).map(([k, label]) => (
            <DocArt key={k} kind={k} label={label} />
          ))}
        />
      )}
      {archive && (
        <ShelfHero
          title="Archives"
          tone="archive"
          chips={archivedFrom}
          total={inView.length}
          picked={fromShelf}
          onPick={(s) => setFromShelf(s as WorkspaceShelf | null)}
          filterLabel="Filter by shelf"
          art={["PDF", "DOCX", "XLSX"].map((label) => (
            <DocArt key={label} kind="archived" label={label} />
          ))}
        />
      )}

      {/* The shelves are sidebar pages, so the shared controls row carries no tabs, only its actions and search. */}
      <div className="content-tabs">
        <div className="content-tabs__controls">
          {canFoldTop && (
            <div className="content-tabs__actions">
              <button type="button" className="btn content-tabs__action" onClick={() => newFolder("")}>
                <Icon name="folder-plus" size={16} /> New folder
              </button>
            </div>
          )}
          <div className="content-tabs__search">
            <SearchField
              value={q}
              onChange={setQ}
              placeholder={`Search ${viewLabel(view).toLowerCase()}`}
              label={`Search ${viewLabel(view)}`}
              examples={["Search by file name", "Search by folder", "Search by who added it"]}
              shortcuts
            />
          </div>
        </div>
      </div>

      {term ? (
        <section className="ws-section" aria-label="Results">
          <h2 className="ws-h">
            Results <span className="ws-h__count">{shown.length}</span>
          </h2>
          {shown.length ? (
            fileList(true)
          ) : (
            <div className="ws-card ws-none">
              <p>No files match.</p>
              <button type="button" className="btn btn--sm" onClick={() => setQ("")}>
                Clear search
              </button>
            </div>
          )}
        </section>
      ) : archive ? (
        shown.length ? (
          fileList(true)
        ) : (
          empty(EMPTY.archive)
        )
      ) : top.length || draftIn("") ? (
        folderCards(top, "")
      ) : (
        empty(
          EMPTY[view],
          canFoldTop && (
            <button type="button" className="btn btn--dark" onClick={() => newFolder("")}>
              <Icon name="folder-plus" size={17} /> New folder
            </button>
          ),
        )
      )}

      {here && !archive && (
        <FolderModal label={here.name} onClose={() => go(null)}>
          <header className="ws-modal__head">
            <nav className="ws-crumbs" aria-label="Folder path">
              <ol>
                <li>
                  <button
                    type="button"
                    className={`ws-crumb${target === "" ? " is-target" : ""}`}
                    onClick={() => go(null)}
                    {...dropInto("")}
                  >
                    {viewLabel(view)}
                  </button>
                </li>
                {trail.map((f, i) => (
                  <li key={f.id}>
                    <Icon name="chevron" size={14} />
                    {naming?.id === f.id ? (
                      nameField(f.name, `Rename folder ${f.name}`)
                    ) : (
                      <button
                        type="button"
                        className={`ws-crumb${target === f.id ? " is-target" : ""}`}
                        aria-current={i === trail.length - 1 ? "page" : undefined}
                        onClick={() => go(f.id)}
                        {...(i < trail.length - 1 && dropInto(f.id))}
                      >
                        {f.name}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="ws-modal__actions">
              {canFold && (
                <button type="button" className="btn content-tabs__action" onClick={() => newFolder(here.id)}>
                  <Icon name="folder-plus" size={16} /> New folder
                </button>
              )}
              {canAdd && (
                <>
                  <button type="button" className="btn content-tabs__action" onClick={() => browse.current?.click()}>
                    <Icon name="upload" size={16} /> Upload
                  </button>
                  <input
                    ref={browse}
                    type="file"
                    multiple
                    accept={desk.uploads.types.map((t) => `.${t.toLowerCase()}`).join(",")}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      const list = e.currentTarget.files;
                      if (list?.length) void uploadTo(here.id, [...list]);
                      e.currentTarget.value = "";
                    }}
                  />
                </>
              )}
              {naming?.id !== here.id && folderMenu(here)}
              <button type="button" className="ws-modal__x" aria-label="Close folder" onClick={() => go(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
          </header>

          <div className={`ws-modal__body ws-folder${dragging && canAdd ? " is-over" : ""}`}>
            {(inside.length > 0 || draftIn(here.id)) && (
              <section className="ws-section" aria-label="Folders">
                <h2 className="ws-h">
                  Folders <span className="ws-h__count">{inside.length}</span>
                </h2>
                {folderCards(inside, here.id)}
              </section>
            )}

            {canAdd && pendingHere.length > 0 && (
              <ul className="dz-list ws-tray" aria-label="Uploading">
                {pendingHere.map((u) => (
                  <li key={u.key}>
                    <UploadRow
                      badge={<FileGlyph name={u.file.name} />}
                      name={u.file.name}
                      meta={
                        u.progress !== undefined
                          ? `${Math.round(u.progress * 100)}% · ${sizeOf(u.file.size)}`
                          : sizeOf(u.file.size)
                      }
                      progress={u.progress}
                      failed={u.failed}
                      onRetry={() => void uploadTo(u.folderId, [u.file], [u.key])}
                      onRemove={() => patch([u.key], null)}
                      removeLabel={`Remove ${u.file.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}

            {shown.length > 0 ? (
              <section className="ws-section" aria-label="Files">
                <h2 className="ws-h">
                  Files <span className="ws-h__count">{shown.length}</span>
                </h2>
                {fileList(false)}
              </section>
            ) : canAdd ? (
              <section className="ws-section ws-upload" aria-label="Add files">
                <Dropzone
                  multiple
                  noun="files"
                  accept={desk.uploads.types.map((t) => `.${t.toLowerCase()}`).join(",")}
                  sheets={dropSheets(desk.uploads.types)}
                  hint={
                    <>
                      {desk.uploads.types.join(", ")} · up to {desk.uploads.maxFileMB}&nbsp;MB each
                    </>
                  }
                  onFiles={(files) => {
                    endDrag();
                    void uploadTo(here.id, files);
                  }}
                />
              </section>
            ) : (
              !inside.length && empty("This folder is empty")
            )}

            {canAdd && shown.length > 0 && (
              <div className="ws-dropzone" aria-hidden="true">
                <span className="ws-dropzone__card">
                  <Icon name="upload" size={20} />
                  Drop to add to {here.name}
                </span>
              </div>
            )}
          </div>
        </FolderModal>
      )}

      {moving && (
        <MoveSheet
          file={moving}
          shelves={desk.shelves}
          foldersOf={foldersOf}
          onMove={(s, folderId) => act({ type: "workspace.edit", id: moving.id, shelf: s, folderId })}
          onClose={() => setMoving(null)}
        />
      )}

      {deleting && (
        <DeleteSheet
          files={deleting}
          onDelete={() => act({ type: "workspace.delete", ids: deleting.map((f) => f.id) })}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
