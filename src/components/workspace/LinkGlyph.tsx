/*
 * What a link opens, at a glance: Google Docs, Sheets, Slides, Forms and Drive, Word, Excel and PowerPoint in
 * their own colours, a red PDF, or a plain link (lib/governance/workspace.ts linkKind). Working Documents lists
 * links with it; Digital Forms marks link answers with it.
 */
import type { LinkKind } from "@/lib/governance/workspace";

/** A link's own icon: Google Docs, Sheets, Slides, Forms and Drive, Word, Excel and PowerPoint in their colours, a red PDF, or a plain link. */
export function LinkGlyph({ kind, size = 22 }: { kind: LinkKind; size?: number }) {
  const page = "M6.5 2h8L20 7.5v13A1.5 1.5 0 0 1 18.5 22h-12A1.5 1.5 0 0 1 5 20.5v-17A1.5 1.5 0 0 1 6.5 2z";
  const fold = <path d="M14.5 2v4a1.5 1.5 0 0 0 1.5 1.5h4z" fill="#fff" fillOpacity={0.45} />;
  return (
    <svg className={`ws-link ws-link--${kind}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {kind === "gdoc" && (
        <>
          <path d={page} fill="#4285F4" />
          {fold}
          <path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
      {kind === "gsheet" && (
        <>
          <path d={page} fill="#0F9D58" />
          {fold}
          <rect x={8} y={10.5} width={8.5} height={8} rx={0.8} fill="none" stroke="#fff" strokeWidth={1.4} />
          <path d="M8 14.5h8.5M11.5 10.5v8" stroke="#fff" strokeWidth={1.4} />
        </>
      )}
      {kind === "gslides" && (
        <>
          <path d={page} fill="#F4B400" />
          {fold}
          <rect x={8} y={11} width={8.5} height={6.5} rx={0.8} fill="none" stroke="#fff" strokeWidth={1.5} />
        </>
      )}
      {kind === "gform" && (
        <>
          <path d={page} fill="#7248B9" />
          {fold}
          <circle cx={9.3} cy={11.8} r={1} fill="#fff" />
          <circle cx={9.3} cy={14.8} r={1} fill="#fff" />
          <circle cx={9.3} cy={17.8} r={1} fill="#fff" />
          <path d="M11.8 11.8h4.4M11.8 14.8h4.4M11.8 17.8h4.4" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
      {(kind === "word" || kind === "excel" || kind === "powerpoint") && (
        <>
          <path d={page} fill={{ word: "#2B579A", excel: "#217346", powerpoint: "#C43E1C" }[kind]} />
          {fold}
          <text x={12.5} y={18.2} textAnchor="middle" fill="#fff" fontSize={8} fontWeight={700} fontFamily="Arial, sans-serif">
            {{ word: "W", excel: "X", powerpoint: "P" }[kind]}
          </text>
        </>
      )}
      {kind === "gdrive" && (
        <g fill="none" strokeWidth={4} strokeLinejoin="round">
          <path d="M3.4 18.5 9.6 7.8" stroke="#0F9D58" strokeLinecap="round" />
          <path d="M8.2 18.5h12.4" stroke="#4285F4" strokeLinecap="round" />
          <path d="M9.6 4.4h4.8l6.6 11.3" stroke="#F4B400" strokeLinecap="round" />
        </g>
      )}
      {kind === "pdf" && (
        <>
          <path d={page} fill="#E2382C" />
          {fold}
          <text x={12.5} y={17.6} textAnchor="middle" fill="#fff" fontSize={5.6} fontWeight={700} fontFamily="Arial, sans-serif" letterSpacing={0.2}>
            PDF
          </text>
        </>
      )}
      {kind === "web" && (
        <>
          <rect x={3} y={3} width={18} height={18} rx={5} fill="currentColor" fillOpacity={0.1} />
          <path d="M10.6 13.4a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.6.6M13.4 10.6a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.6-.6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
