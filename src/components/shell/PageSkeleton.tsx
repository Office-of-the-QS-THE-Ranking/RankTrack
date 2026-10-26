/**
 * What a workspace tab shows while its page renders on the server: the outline of a page header and a
 * card. Having it lets Next.js switch tabs at once and prefetch the shell of each tab.
 */
export function PageSkeleton() {
  return (
    <div className="skel" role="status">
      <span className="sr-only">Loading…</span>
      <div className="skel__head" aria-hidden="true">
        <span className="skel__bar skel__bar--title" />
        <span className="skel__bar skel__bar--lede" />
      </div>
      <div className="card skel__card" aria-hidden="true">
        <span className="skel__bar skel__bar--heading" />
        <span className="skel__bar" />
        <span className="skel__bar" />
        <span className="skel__bar" />
        <span className="skel__bar" />
      </div>
    </div>
  );
}
