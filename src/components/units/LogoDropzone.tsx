"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { EMBLEM_MAX_MB, EMBLEM_PICK_TYPES, type UnitEmblem } from "@/lib/governance/unit-emblems";
import { UnitMark } from "./UnitMark";

export function LogoDropzone({ preview, code, fileName, fileSize, busy, disabled, progress, onPick, onRemove, removeLabel = "Remove logo" }: {
  preview: UnitEmblem | null;
  code: string;
  fileName?: string;
  fileSize?: number;
  busy: boolean;
  disabled: boolean;
  progress: number;
  onPick: (file: File) => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const hintId = useId();
  const locked = busy || disabled;
  const percentage = Math.round(progress * 100);
  const hasFile = !!preview || busy;
  return (
    <div
      className={`adm-logo-dropzone${over ? " is-over" : ""}${locked ? " is-disabled" : ""}`}
      aria-busy={busy}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!locked && event.dataTransfer.types.includes("Files")) { depth.current++; setOver(true); }
      }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = locked ? "none" : "copy"; }}
      onDragLeave={(event) => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        if (locked) return;
        const files = event.dataTransfer.files;
        if (files.length !== 1) return toast("Choose one logo at a time.", "error");
        onPick(files[0]);
      }}
    >
      <button type="button" className="adm-logo-dropzone__target" disabled={locked} aria-describedby={hintId} onClick={() => input.current?.click()}>
        <span className="adm-logo-dropzone__art" aria-hidden="true">
          <span className="adm-logo-dropzone__file adm-logo-dropzone__file--left"><Icon name="image" size={19} /><i>PNG</i></span>
          <span className="adm-logo-dropzone__file adm-logo-dropzone__file--right"><Icon name="image" size={19} /><i>JPG</i></span>
          <span className="adm-logo-dropzone__upload"><Icon name="upload" size={22} /></span>
        </span>
        <span className="adm-logo-dropzone__title">{busy ? "Uploading your logo…" : over ? "Drop your logo here" : preview ? "Drop a new logo or browse" : "Drop your logo here or browse"}</span>
        <span className="adm-logo-dropzone__hint" id={hintId}>{disabled ? "Choose a parent unit first" : `PNG or JPG · up to ${EMBLEM_MAX_MB} MB · compressed on upload`}</span>
      </button>
      <div className="adm-logo-dropzone__footer">
        {hasFile ? (
          <div className="adm-logo-dropzone__row">
            {preview ? <UnitMark emblem={preview} code={code} className="adm-logo-dropzone__preview" /> : <span className="adm-logo-dropzone__preview"><Icon name="image" size={24} /></span>}
            <div className="adm-logo-dropzone__details">
              <span className="adm-logo-dropzone__name">{fileName || "Unit logo"}</span>
              <span className="adm-logo-dropzone__meta">{busy ? `${percentage}%` : `${preview?.width} × ${preview?.height} px`}{fileSize ? ` · ${fileSize < 1024 * 1024 ? `${Math.ceil(fileSize / 1024)} KB` : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`}` : ""}</span>
              {busy && <div className="adm-logo-dropzone__progress" role="progressbar" aria-label="Logo upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{ width: `${percentage}%` }} /></div>}
            </div>
            {onRemove && <button type="button" className="adm-iconbtn adm-logo-dropzone__remove" disabled={busy} aria-label={removeLabel} onClick={onRemove}><Icon name="close" size={16} /></button>}
          </div>
        ) : <span className="adm-logo-dropzone__empty">No logo selected <span>Optional</span></span>}
      </div>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={locked} accept={Object.keys(EMBLEM_PICK_TYPES).join(",")} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onPick(file); }} />
    </div>
  );
}
