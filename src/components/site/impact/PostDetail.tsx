import type { Story, StoryPost } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { PostArticle, relatedStories } from "./PostArticle";

/** A published post, with the stories that share its goals or themes. */
export async function PostDetail({ story, post }: { story: Story; post: StoryPost }) {
  const { stories } = await siteData();
  return <PostArticle story={story} post={post} related={relatedStories(stories, story)} />;
}
