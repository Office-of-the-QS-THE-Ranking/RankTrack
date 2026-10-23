import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { ProposeStory } from "@/components/contribute/ProposeStory";

export const metadata = { title: "Propose an impact story" };

export default function ProposeStoryPage() {
  return (
    <Gate path="/portal/story" title="Propose an impact story">
      <PageHeader
        title="Propose an impact story"
        lede="Tell the story in the format other universities find most useful: the challenge, the Thomasian response, what changed and how they could do it too."
      />
      <ProposeStory />
    </Gate>
  );
}
