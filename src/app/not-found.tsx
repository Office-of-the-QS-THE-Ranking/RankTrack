import { NotFoundContent } from "@/components/site/NotFoundContent";
import { SiteFrame } from "@/components/site/SiteFrame";

/** Unmatched addresses get the public website's frame (most arrive from outside), without the loader. */
export default function NotFound() {
  return (
    <SiteFrame loader={false}>
      <NotFoundContent />
    </SiteFrame>
  );
}
