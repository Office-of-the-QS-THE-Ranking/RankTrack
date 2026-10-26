"use client";

/*
 * The post composer, laid out like a publishing tool: the editor on the right (DocEditor: title, subtitle and the
 * story on one page under a formatting ribbon) and the settings on the left: who is posting, the publication
 * layout, "Add to your post" (images, the thumbnail, SDGs and hashtags), then Preview, Save draft and Publish.
 * Each setting temporarily takes the editor's place (ComposerPanels); clicking anywhere else, Done or Esc brings the
 * editor back. Preview opens the post in a tab of the public website, kept current while the composer stays open. Images upload while the person writes; saving or posting sends one
 * governance command, which the server checks, applies and audits.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { discardUploads, startUploads } from "@/app/actions/posts";
import { SDG_NAMES } from "@/lib/data";
import type { PostInput } from "@/lib/governance/commands";
import type { PostRow } from "@/lib/governance/hub-types";
import { POST_LIMITS, type PostLayout } from "@/lib/governance/posts";
import { plainText, toRich } from "@/lib/rich-text";
import { initials } from "@/lib/governance/rbac";
import { PREVIEW_PATH, PREVIEW_WINDOW, writePreview } from "@/lib/post-preview";
import type { PostMedia, PostStatus } from "@/lib/governance/types";
import { useGovern } from "@/components/hub/HubProvider";
import { Face } from "@/components/ui/Face";
import { Icon, type IconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { recheckField } from "@/components/ui/validation";
import { Dropzone, HashtagList, LayoutPicker, Panel, SdgPicker, UploadRow, sizeOf, sizePair, timeLeft } from "./ComposerPanels";
import { DocEditor } from "./DocEditor";
import { postPickProblem, preparePostPicture, upload, type Prepared } from "./media";
import { PostAnalytics } from "./PostAnalytics";

type Pic = {
  key: string;
  /** The saved file, once uploaded. */
  src?: string;
  /** What to show: the saved file, or the local copy while it uploads. */
  preview: string;
  width: number;
  height: number;
  alt: string;
  /** The file's name and size, for pictures added in this composer. */
  name?: string;
  size?: number;
  /** 0–1 while uploading, and when the upload began. */
  progress?: number;
  started?: number;
  failed?: string;
};

/** What opens beside the post. */
type Side = "images" | "thumbnail" | "sdgs" | "hashtags" | "analytics";

const STATUS_TONE: Record<PostStatus, string> = { Published: "live", Draft: "draft", "In review": "review", Unpublished: "off" };

export function PostStatusPill({ status }: { status: PostStatus }) {
  return <span className={`pm-status pm-status--${STATUS_TONE[status]}`}>{status === "Unpublished" ? "Withdrawn" : status}</span>;
}

const fromMedia = (m: PostMedia, key = m.src): Pic => ({ key, src: m.src, preview: m.src, width: m.width, height: m.height, alt: m.alt });
const toMedia = (p: Pic): PostMedia => ({ src: p.src!, width: p.width, height: p.height, alt: p.alt.trim() });
const loading = (p: Pic | null | undefined) => p?.progress !== undefined;

/** What saving would change, to tell an untouched composer from one with edits. */
const signature = (v: { title: string; subtitle: string; body: string; sdgs: number[]; hashtags: string[]; layout: PostLayout; thumb: Pic | null; photos: Pic[] }) =>
  JSON.stringify([v.title.trim(), v.subtitle.trim(), v.body.trim(), [...v.sdgs].sort(), v.hashtags, v.layout, v.thumb?.src ?? v.thumb?.key ?? null, v.photos.map((p) => [p.src ?? p.key, p.alt])]);

/** Title and subtitle wrap like text but stay one paragraph. */
const oneLine = (v: string) => v.replace(/\s*[\r\n]+\s*/g, " ");

/** A text box as tall as what is written in it. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** The first name as people write it: directory names often arrive in capitals. */
function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first === first.toUpperCase() ? first.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, mark: string, letter: string) => mark + letter.toUpperCase()) : first;
}

/** Enter in a one-line field moves on instead of submitting the whole post. */
const nextOnEnter = (to?: () => HTMLElement | null) => (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
  e.preventDefault();
  to?.()?.focus();
};

/** A picture's upload state in words: "1.5 of 4.2 MB · 3s left", or its size once saved. */
function picMeta(p: Pic) {
  if (p.progress !== undefined) return p.size ? `${sizePair(p.size * p.progress, p.size)} · ${timeLeft(p.progress, p.started)}` : "Preparing…";
  const dims = p.width && p.height ? `${p.width} × ${p.height}` : "";
  return [p.size ? sizeOf(p.size) : "", dims].filter(Boolean).join(" · ") || "Uploaded";
}

export function PostComposer({
  row,
  me,
  needsApproval,
  canPublish,
  onClose,
}: {
  /** The post to edit; null writes a new one. */
  row: PostRow | null;
  me: { name: string; unit: string; avatar?: string };
  needsApproval: boolean;
  canPublish: boolean;
  onClose: () => void;
}) {
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyProxy = useRef<HTMLInputElement>(null);
  const sdgTrigger = useRef<HTMLButtonElement>(null);
  const sdgProxy = useRef<HTMLInputElement>(null);
  const { run } = useGovern();

  const [title, setTitle] = useState(row?.title ?? "");
  const [subtitle, setSubtitle] = useState(row?.subtitle ?? "");
  /** The story as the editor's clean HTML; a plain-text story from before the editor is converted on opening. */
  const [body, setBody] = useState(() => (row?.body ? toRich(row.body) : ""));
  const [sdgs, setSdgs] = useState<number[]>(row?.sdgs ?? []);
  const [hashtags, setHashtags] = useState<string[]>(row?.hashtags ?? []);
  const [layout, setLayout] = useState<PostLayout>(row?.layout ?? "cover");
  const [thumb, setThumb] = useState<Pic | null>(row?.thumbnail ? fromMedia(row.thumbnail, `thumb:${row.thumbnail.src}`) : null);
  const [photos, setPhotos] = useState<Pic[]>(() => row?.photos.map((m) => fromMedia(m)) ?? []);
  const [initial] = useState(() => signature({ title, subtitle, body, sdgs, hashtags, layout, thumb, photos }));
  const [side, setSide] = useState<Side | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const confirmation = leaveDialog.current;
    if (leaving && confirmation && !confirmation.open) confirmation.showModal();
  }, [leaving]);
  const [dropping, setDropping] = useState(false);
  const [saving, setSaving] = useState<false | "draft" | "publish">(false);
  const dragFrom = useRef<number | null>(null);

  /** Uploads made in this composer: whatever isn't saved leaves the bucket when it closes. */
  const fresh = useRef(new Set<string>());
  /** Prepared files by picture, for retrying a failed upload. */
  const prepared = useRef(new Map<string, Prepared>());
  const blobs = useRef(new Set<string>());
  const aborter = useRef(new AbortController());

  const author = row?.author ?? me;
  const status: PostStatus = row?.status ?? "Draft";
  const dirty = signature({ title, subtitle, body, sdgs, hashtags, layout, thumb, photos }) !== initial;
  const uploading = [thumb, ...photos].filter(loading).length;
  const failed = [thumb, ...photos].some((p) => p?.failed);
  const greet = firstName(me.name);
  const story = plainText(body);
  const prompt = greet ? `What’s the story, ${greet}?` : "What’s the story?";
  const analytics = !!row && (!!row.postedAt || row.status === "Published");

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    titleRef.current?.focus();
    aborter.current = new AbortController();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const urls = blobs.current;
    const uploads = aborter.current;
    return () => {
      root.style.overflow = overflow;
      uploads.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // The text boxes grow with what is written.
  useLayoutEffect(() => fit(titleRef.current), [title]);
  useLayoutEffect(() => fit(subtitleRef.current), [subtitle]);
  // …and with the page's width, which changes as the window does.
  useEffect(() => {
    const box = titleRef.current?.parentElement;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      fit(titleRef.current);
      fit(subtitleRef.current);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  /* ---------- Closing ---------- */

  const finish = (kept: string[] = []) => {
    const drop = [...fresh.current].filter((s) => !kept.includes(s));
    if (drop.length) void discardUploads(drop);
    onClose();
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty || uploading) setLeaving(true);
    else finish();
  };

  /* ---------- The side panel ---------- */

  const open = (s: Side) => {
    if (!leaving) setSide(s);
  };
  /** A tool opens its panel, or closes it when it is already open. */
  const toggle = (s: Side) => (side === s ? close() : open(s));

  /** Done and Esc go back to what opened the panel; clicking elsewhere leaves focus where the click put it. */
  const close = (refocus = true) => {
    const was = side;
    setSide(null);
    if (refocus && was) requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-side-trigger="${was}"]`)?.focus({ preventScroll: true }));
  };

  // A click anywhere but the panel, what opens one, or something that opened from them closes the panel. On the
  // click, not the press, so whatever was pressed (Post, say) still receives it.
  useEffect(() => {
    if (!side) return;
    const away = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".pc-doc, [data-side-trigger], .pick, .fieldwarn, .pc-leave, .toasts")) return;
      setSide(null);
    };
    document.addEventListener("click", away, true);
    return () => document.removeEventListener("click", away, true);
  }, [side]);

  const write = (html: string) => {
    setBody(html);
    if (plainText(html).trim()) contentChanged();
  };

  /** Esc steps back: out of the discard question, out of the panel, then out of the composer. */
  const back = () => {
    if (leaving) setLeaving(false);
    else if (side) close();
    else requestClose();
  };

  /* ---------- Pictures ---------- */

  const patch = (key: string, change: Partial<Pic>) => {
    setThumb((t) => (t?.key === key ? { ...t, ...change } : t));
    setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, ...change } : p)));
  };

  const remove = (key: string) => {
    setThumb((t) => (t?.key === key ? null : t));
    setPhotos((ps) => ps.filter((p) => p.key !== key));
  };

  /** An image counts as the story's content, so adding one clears a "write the story" warning. */
  const contentChanged = () => {
    bodyProxy.current?.setCustomValidity("");
    recheckField(bodyRef.current);
  };

  const send = async (items: { key: string; file: Prepared }[]) => {
    if (!items.length) return;
    items.forEach(({ key, file }) => patch(key, { progress: 0, started: undefined, size: file.blob.size, failed: undefined }));
    const started = await startUploads(items.map(({ file }) => ({ type: file.type, size: file.blob.size })));
    if (!started.ok) {
      items.forEach(({ key }) => patch(key, { progress: undefined, failed: "Not uploaded" }));
      toast(started.message, "error");
      return;
    }
    await Promise.all(
      items.map(async ({ key, file }, i) => {
        const ticket = started.tickets[i];
        patch(key, { started: Date.now() });
        try {
          await upload(ticket.url, file, (f) => patch(key, { progress: f }), aborter.current.signal);
          fresh.current.add(ticket.src);
          patch(key, { src: ticket.src, progress: undefined });
        } catch (e) {
          if ((e as Error).name !== "AbortError") patch(key, { progress: undefined, failed: "Upload failed" });
        }
      }),
    );
  };

  const add = async (list: FileList | File[], to: "photos" | "thumbnail") => {
    const all = [...list];
    const files = all.filter((f) => {
      const problem = postPickProblem(f);
      if (problem) toast(problem, "error");
      return !problem;
    });
    if (!files.length) return all.length ? undefined : toast("Choose a JPG or PNG picture up to 2 MB.", "error");
    const room = to === "thumbnail" ? 1 : POST_LIMITS.photos - photos.length;
    if (room < 1) return toast(`A post holds up to ${POST_LIMITS.photos} images.`, "info");
    if (to === "photos" && files.length > room) toast(`Added ${room} of ${files.length}. A post holds up to ${POST_LIMITS.photos} images.`, "info");
    const picked = files.slice(0, room);
    const pics = picked.map((f): Pic => {
      const preview = URL.createObjectURL(f);
      blobs.current.add(preview);
      return { key: crypto.randomUUID(), preview, width: 0, height: 0, alt: "", name: f.name, size: f.size, progress: 0 };
    });
    if (to === "thumbnail") setThumb(pics[0]);
    else {
      setPhotos((ps) => [...ps, ...pics]);
      contentChanged();
    }
    const ready = await Promise.all(picked.map((f) => preparePostPicture(f)));
    const good: { key: string; file: Prepared }[] = [];
    ready.forEach((r, i) => {
      const key = pics[i].key;
      if (typeof r === "string") {
        remove(key);
        toast(r, "error");
        return;
      }
      prepared.current.set(key, r);
      patch(key, { width: r.width, height: r.height });
      good.push({ key, file: r });
    });
    await send(good);
  };

  const retry = (key: string) => {
    const file = prepared.current.get(key);
    if (file) void send([{ key, file }]);
    else remove(key);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    setPhotos((ps) => {
      const next = [...ps];
      const [p] = next.splice(from, 1);
      next.splice(to, 0, p);
      return next;
    });
  };

  const makeThumbnail = (p: Pic) => {
    if (p.src) setThumb({ ...p, key: `thumb:${p.key}`, progress: undefined, failed: undefined });
  };

  // Files dropped or pasted on the post become images.
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDropping(false);
    void add(e.dataTransfer.files, "photos");
  };
  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    void add(files, "photos");
  };

  /* ---------- Tags ---------- */

  const toggleGoal = (n: number) => {
    setSdgs(sdgs.includes(n) ? sdgs.filter((x) => x !== n) : [...sdgs, n].sort((a, b) => a - b));
    recheckField(sdgTrigger.current);
  };

  /* ---------- Saving ---------- */

  /** Posting asks for more than a draft: set the checks the browser runs on the next submit. */
  const arm = (publish: boolean) => {
    if (sdgProxy.current) sdgProxy.current.required = publish;
    bodyProxy.current?.setCustomValidity(
      story.length > POST_LIMITS.body
        ? `Shorten the story to ${POST_LIMITS.body.toLocaleString("en")} characters.`
        : publish && !story.trim() && !photos.length
          ? "Write the story or add images."
          : "",
    );
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || uploading) return;
    if (failed) return toast("Retry or remove the images that didn’t upload.", "error");
    const publish = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.intent === "publish";
    const input: PostInput = {
      title,
      subtitle,
      body,
      sdgs,
      // Themes are no longer chosen here; a post keeps the ones it has.
      themes: row?.themes ?? [],
      hashtags,
      layout,
      thumbnail: thumb?.src ? toMedia(thumb) : null,
      photos: photos.filter((p) => p.src).map(toMedia),
    };
    setSaving(publish ? "publish" : "draft");
    const r = await run({ type: "post.save", id: row?.id, from: row?.legacy ? row.slug : undefined, input, publish });
    setSaving(false);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) finish([input.thumbnail, ...input.photos].flatMap((m) => (m ? [m.src] : [])));
  };

  /* ---------- Actions by where the post stands ---------- */

  const postLabel = needsApproval ? "Send for approval" : "Publish";
  const actions: { label: string; busy: string; intent: "draft" | "publish"; primary?: boolean }[] =
    status === "Published"
      ? [{ label: "Update", busy: "Updating…", intent: "publish", primary: true }]
      : status === "In review" && row?.requestId
        ? [{ label: "Save changes", busy: "Saving…", intent: "draft", primary: true }]
        : [
            { label: status === "In review" ? "Save changes" : "Save draft", busy: "Saving…", intent: "draft", primary: !canPublish },
            ...(canPublish ? [{ label: postLabel, busy: needsApproval ? "Sending…" : "Publishing…", intent: "publish" as const, primary: true }] : []),
          ];

  const panelId = `${ids}-panel`;
  const sending = photos.filter(loading);
  const sendingSize = sending.reduce((n, p) => n + (p.size ?? 0), 0);
  const sentSize = sending.reduce((n, p) => n + (p.size ?? 0) * (p.progress ?? 0), 0);

  /* ---------- Panels ---------- */

  const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

  /* ---------- Preview, in a tab of the public website ---------- */

  const [previewing, setPreviewing] = useState(false);
  const shown = (p: Pic) => ({ src: p.src ?? p.preview, width: p.width, height: p.height, alt: p.alt.trim() });
  const draft = () =>
    writePreview({
      title,
      unit: author.unit,
      postedAt: row?.postedAt ?? new Date().toISOString(),
      sdgs,
      themes: row?.themes ?? [],
      post: { id: row?.id ?? "preview", subtitle: subtitle.trim(), body, hashtags, layout, thumbnail: thumb && shown(thumb), photos: photos.map(shown) },
    });
  const openPreview = () => {
    draft();
    setPreviewing(true);
    window.open(PREVIEW_PATH, PREVIEW_WINDOW)?.focus();
  };
  // The open tab follows every change; closing the composer leaves it with nothing to show.
  useEffect(() => {
    if (previewing) draft();
  });
  useEffect(() => () => writePreview(null), []);

  const panels: Record<Side, () => ReactNode> = {
    images: () => (
      <Panel
        id={panelId}
        title="Images"
        note={`${photos.length} of ${POST_LIMITS.photos}`}
        onDone={() => close()}
        foot={
          sending.length ? (
            <>
              Uploading {sending.length} of {photos.length}
              {sendingSize > 0 && <> · {sizePair(sentSize, sendingSize)}</>}
            </>
          ) : photos.length > 1 ? (
            "Drag to reorder. The first image leads the gallery."
          ) : undefined
        }
      >
        <Dropzone multiple noun="images" disabled={photos.length >= POST_LIMITS.photos ? `A post holds up to ${POST_LIMITS.photos} images.` : undefined} onFiles={(files) => void add(files, "photos")} />
        {photos.length > 0 && (
          <ol className="dz-list" aria-label="Images">
            {photos.map((p, i) => {
              const name = p.name ?? (p.alt || `Image ${i + 1}`);
              const isThumb = !!p.src && thumb?.src === p.src;
              return (
                <li
                  key={p.key}
                  draggable
                  onDragStart={(e) => {
                    dragFrom.current = i;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (dragFrom.current === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    if (dragFrom.current === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    move(dragFrom.current, i);
                    dragFrom.current = null;
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                  }}
                >
                  <UploadRow
                    src={p.preview}
                    name={name}
                    meta={picMeta(p)}
                    progress={p.progress}
                    failed={p.failed}
                    onRetry={() => retry(p.key)}
                    onRemove={() => remove(p.key)}
                    removeLabel={`Remove image ${i + 1}`}
                    grip={
                      <button
                        type="button"
                        className="dz-row__grip"
                        aria-label={`Move image ${i + 1} of ${photos.length}. Use the arrow keys.`}
                        onKeyDown={(e) => {
                          const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                          if (to === null) return;
                          e.preventDefault();
                          move(i, to);
                          requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.focus());
                        }}
                      >
                        <Icon name="grip" size={16} />
                      </button>
                    }
                    actions={
                      <button
                        type="button"
                        className="dz-row__btn"
                        aria-label={`Use image ${i + 1} as the thumbnail`}
                        aria-pressed={isThumb}
                        data-tip={isThumb ? "Thumbnail" : "Use as thumbnail"}
                        disabled={!p.src}
                        onClick={() => (isThumb ? setThumb(null) : makeThumbnail(p))}
                      >
                        <Icon name="thumbnail" size={16} />
                      </button>
                    }
                  >
                    {p.src && (
                      <>
                        <label className="sr-only" htmlFor={`${ids}-alt-${p.key}`}>
                          Describe image {i + 1}
                        </label>
                        <input
                          id={`${ids}-alt-${p.key}`}
                          className="dz-row__alt"
                          value={p.alt}
                          onChange={(e) => patch(p.key, { alt: e.target.value })}
                          onKeyDown={nextOnEnter()}
                          placeholder="Describe this image for screen readers"
                          maxLength={POST_LIMITS.alt}
                          autoComplete="off"
                        />
                      </>
                    )}
                  </UploadRow>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    ),
    thumbnail: () => (
      <Panel id={panelId} title="Thumbnail" note={thumb ? "Set" : photos.some((p) => p.src) ? "The first image stands in" : "Not set"} onDone={() => close()}>
        <Dropzone noun="a picture" onFiles={(files) => void add(files, "thumbnail")} />
        {thumb && (
          <div className="dz-list">
            <UploadRow
              src={thumb.preview}
              wide
              name={thumb.name ?? "Thumbnail"}
              meta={picMeta(thumb)}
              progress={thumb.progress}
              failed={thumb.failed}
              onRetry={() => retry(thumb.key)}
              onRemove={() => setThumb(null)}
              removeLabel="Remove the thumbnail"
            />
          </div>
        )}
        {photos.some((p) => p.src) && (
          <section className="pc-thumbfrom" aria-labelledby={`${ids}-thumbfrom`}>
            <h4 id={`${ids}-thumbfrom`} className="pc-panel__label">
              Or use one of the post’s images
            </h4>
            <ul className="pc-thumbpick">
              {photos
                .filter((p) => p.src)
                .map((p, i) => (
                  <li key={p.key}>
                    <button type="button" className="pc-thumbpick__pic" aria-label={`Use image ${i + 1}`} aria-pressed={thumb?.src === p.src} onClick={() => makeThumbnail(p)}>
                      <img src={p.preview} alt="" />
                      <span className="pc-sdg__check" aria-hidden="true">
                        <Icon name="check" size={13} strokeWidth={2.8} />
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </Panel>
    ),
    sdgs: () => (
      <Panel
        id={panelId}
        title="SDGs"
        note={sdgs.length ? `${sdgs.length} selected` : "Select at least one"}
        onDone={() => close()}
        foot={
          sdgs.length > 0 && (
            <>
              <span className="pc-panel__picked">{sdgs.map((n) => `SDG ${n} ${SDG_NAMES[n]}`).join(" · ")}</span>
              <button
                type="button"
                className="pc-panel__clear"
                onClick={() => {
                  setSdgs([]);
                  recheckField(sdgTrigger.current);
                }}
              >
                Clear
              </button>
            </>
          )
        }
      >
        <SdgPicker value={sdgs} onToggle={toggleGoal} />
      </Panel>
    ),
    hashtags: () => (
      <Panel id={panelId} title="Hashtags" note={`${hashtags.length} of ${POST_LIMITS.hashtags}`} onDone={() => close()}>
        <HashtagList value={hashtags} onChange={setHashtags} />
      </Panel>
    ),
    analytics: () => (
      <Panel id={panelId} title="Analytics" onDone={() => close()}>
        {row && <PostAnalytics row={row} />}
      </Panel>
    ),
  };


  return (
    <dialog
      ref={dialog}
      className="pc"
      aria-labelledby={`${ids}-heading`}
      onCancel={(e) => {
        e.preventDefault();
        back();
      }}
      onKeyDown={(e) => {
        // Handled here so the browser never closes the composer behind the person's back.
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          back();
        }
      }}
    >
      <form className="pc__form" onSubmit={submit}>
        <header className="pc-head">
          <span className="pc-head__spacer" />
          <h2 id={`${ids}-heading`} className="pc-head__title">
            {row ? "Edit Publication" : "Create Publication"}
          </h2>
          <button type="button" className="pc-iconbtn" aria-label="Close" onClick={requestClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="pc-layout">
          <div className="pc-frame" inert={leaving}>
            <div className="pc-stage">
              {/* ---------- Settings ---------- */}
              <div className="pc-view pc-main" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onPaste={onPaste}>
                <div className="pc-author">
                  <span className="pc-avatar" aria-hidden="true">
                    <Face src={author.avatar}>{initials(author.name)}</Face>
                  </span>
                  <span className="pc-author__text">
                    <b>{author.name}</b>
                    <span className="pc-author__meta">
                      {author.unit}
                      {row?.legacy === "proposal" ? " · unit proposal" : ""}
                    </span>
                  </span>
                  <PostStatusPill status={status} />
                </div>

                <section className="pc-set" aria-labelledby={`${ids}-layout`}>
                  <LayoutPicker value={layout} name={`${ids}-layout-choice`} labelId={`${ids}-layout`} onChange={setLayout} />
                </section>

                <section className="pc-set" aria-labelledby={`${ids}-add`}>
                  <h3 id={`${ids}-add`} className="pc-set__label">
                    Add to your post
                  </h3>
                  <div className="pc-rows">
                    <Setting
                      side="images"
                      open={side}
                      panel={panelId}
                      icon="photo-stack"
                      tone="photo"
                      label="Images"
                      summary={photos.length ? `${plural(photos.length, "image")}${uploading ? " · uploading" : failed ? " · some didn’t upload" : ""}` : "None yet"}
                      onClick={() => toggle("images")}
                    />
                    <Setting
                      side="thumbnail"
                      open={side}
                      panel={panelId}
                      icon="thumbnail"
                      tone="thumb"
                      label="Thumbnail"
                      pic={thumb?.preview}
                      summary={thumb ? "Set" : photos.some((p) => p.src) ? "The first image stands in" : "Not set"}
                      onClick={() => toggle("thumbnail")}
                    />
                    <div className="pc-proxied pc-rows__wrap">
                      <Setting
                        ref={sdgTrigger}
                        side="sdgs"
                        open={side}
                        panel={panelId}
                        icon="target"
                        tone="sdg"
                        label="SDG"
                        summary={sdgs.length ? sdgs.map((n) => `SDG ${n}`).join(", ") : "Select at least one"}
                        onClick={() => toggle("sdgs")}
                      />
                      <input ref={sdgProxy} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={sdgs.join(",")} onChange={() => {}} data-missing="Select at least one SDG." />
                    </div>
                    <Setting
                      side="hashtags"
                      open={side}
                      panel={panelId}
                      icon="hash"
                      tone="tag"
                      label="Hashtag"
                      summary={hashtags.length ? hashtags.map((h) => `#${h}`).join(" ") : "None yet"}
                      onClick={() => toggle("hashtags")}
                    />
                    {analytics && (
                      <Setting side="analytics" open={side} panel={panelId} icon="activity" tone="stat" label="Analytics" summary="Views and reach" onClick={() => toggle("analytics")} />
                    )}
                  </div>
                </section>
              </div>
            </div>

            <footer className="pc-foot">
              {(uploading > 0 || row?.requestId) && (
                <span className="pc-actions__note" aria-live="polite">
                  {uploading ? `Uploading ${plural(uploading, "picture")}…` : "Waiting for approval"}
                </span>
              )}
              <div className="pc-actions">
                <button type="button" className="btn pc-actions__btn pc-actions__preview" onClick={openPreview}>
                  <Icon name="eye" size={16} /> Preview
                </button>
                {actions.map((a) => (
                  <button
                    key={a.intent}
                    type="submit"
                    data-intent={a.intent}
                    className={`btn ${a.primary ? "btn--dark" : ""} pc-actions__btn`}
                    disabled={!!saving || uploading > 0}
                    onClick={() => arm(a.intent === "publish")}
                  >
                    {saving === a.intent ? a.busy : a.label}
                  </button>
                ))}
              </div>
            </footer>

            {dropping && <DropHint text="Drop to add images" />}
          </div>

          {/* ---------- The post's document, with a tool's panel over it ---------- */}
          <div className="pc-right">
            <DocEditor
              id={`${ids}-doc`}
              html={body}
              placeholder={prompt}
              pageRef={bodyRef}
              inert={leaving || !!side}
              onChange={write}
              onPhotos={(files) => void add(files, "photos")}
              lead={
                <>
                  <label className="sr-only" htmlFor={`${ids}-title`}>
                    Title
                  </label>
                  <textarea
                    ref={titleRef}
                    id={`${ids}-title`}
                    className="pc-title"
                    rows={1}
                    value={title}
                    onChange={(e) => setTitle(oneLine(e.target.value))}
                    onKeyDown={nextOnEnter(() => subtitleRef.current)}
                    placeholder="Title"
                    required
                    minLength={4}
                    maxLength={POST_LIMITS.title}
                    data-missing="Add a title."
                    autoComplete="off"
                  />
                  <label className="sr-only" htmlFor={`${ids}-subtitle`}>
                    Subtitle
                  </label>
                  <textarea
                    ref={subtitleRef}
                    id={`${ids}-subtitle`}
                    className="pc-subtitle"
                    rows={1}
                    value={subtitle}
                    onChange={(e) => setSubtitle(oneLine(e.target.value))}
                    onKeyDown={nextOnEnter(() => bodyRef.current)}
                    placeholder="Add a subtitle"
                    maxLength={POST_LIMITS.subtitle}
                    autoComplete="off"
                  />
                </>
              }
              after={<input ref={bodyProxy} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={story} onChange={() => {}} />}
            />
            {side && (
              <div key={side} className="pc-sidewrap" inert={leaving}>
                {panels[side]()}
              </div>
            )}
          </div>
        </div>
      </form>

      {leaving && (
        <dialog ref={leaveDialog} className="pc-leave" role="alertdialog" aria-modal="true" aria-labelledby={`${ids}-leave`} aria-describedby={`${ids}-leave-text`} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setLeaving(false); }}>
          <div className="pc-leave__card">
            <h3 id={`${ids}-leave`} className="pc-leave__title">
              {row ? "Discard your changes?" : "Discard this post?"}
            </h3>
            <p id={`${ids}-leave-text`} className="pc-leave__text">
              {row ? "The post stays as it was." : "Nothing you wrote here is saved."}
            </p>
            <div className="pc-leave__actions">
              <button type="button" className="btn" onClick={() => setLeaving(false)} autoFocus>
                Keep editing
              </button>
              <button type="button" className="btn btn--danger pc-discard" onClick={() => finish()}>
                Discard
              </button>
            </div>
          </div>
        </dialog>
      )}
    </dialog>
  );
}

/** One of "Add to your post": its icon, name and what is set, as a settings row. Opens its panel over the editor. */
function Setting({
  side,
  open,
  panel,
  icon,
  tone,
  label,
  summary,
  pic,
  onClick,
  ref,
}: {
  side: Side;
  open: Side | null;
  panel: string;
  icon: IconName;
  tone: string;
  label: string;
  summary: string;
  pic?: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={`pc-setrow pc-setrow--${tone}`}
      aria-expanded={open === side}
      aria-controls={open === side ? panel : undefined}
      data-side-trigger={side}
      onClick={onClick}
    >
      <span className="pc-setrow__icon" aria-hidden="true">
        <Icon name={icon} size={21} strokeWidth={1.5} />
      </span>
      <span className="pc-setrow__text">
        <span className="pc-setrow__label">{label}</span>
        <span className="pc-setrow__summary">{summary}</span>
      </span>
      {pic && <img className="pc-setrow__pic" src={pic} alt="" />}
      <Icon name="chevron" size={16} className="pc-setrow__chev" />
    </button>
  );
}

function DropHint({ text }: { text: ReactNode }) {
  return (
    <span className="pc-drop" aria-hidden="true">
      <Icon name="upload" size={22} />
      {text}
    </span>
  );
}
