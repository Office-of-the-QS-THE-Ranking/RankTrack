import { Gate } from "@/components/hub/Gate";
import { PostManager } from "@/components/publications/PostManager";
import { postDesk } from "@/lib/governance/server/posts";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Stories & News" };

/** The unit's own posts; each reaches the public website once the Rankings Office approves it. */
export default async function Stories() {
  const viewer = await getViewer();
  const desk = viewer && viewerCan(viewer, "posts", "view") ? await postDesk(viewer) : null;
  return (
    <Gate path="/portal/publications" title="Stories & News">
      {desk && <PostManager desk={desk} />}
    </Gate>
  );
}
