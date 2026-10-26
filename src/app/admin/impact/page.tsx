import { Gate } from "@/components/hub/Gate";
import { PostManager } from "@/components/impact/PostManager";
import { postDesk } from "@/lib/governance/server/posts";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Impact and Innovation" };

export default async function Impact() {
  const viewer = await getViewer();
  const desk = viewer && viewerCan(viewer, "posts", "view") ? await postDesk(viewer) : null;
  return (
    <Gate path="/admin/impact" title="Impact and Innovation">
      {desk && <PostManager desk={desk} />}
    </Gate>
  );
}
