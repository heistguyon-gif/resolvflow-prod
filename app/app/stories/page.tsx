import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../chatgpt-auth";
import { requireWorkspaceContext, isPlatformOwnerEmail } from "../../lib/auth";
import { StoryTemplates } from "../components/StoryTemplates";
import { isFeatureEnabled } from "../../lib/feature-rollouts";
import { canUseStories } from "../../lib/story-permissions";
import { StoriesShell } from "../components/StoriesShell";
import { MASTER_STORY_OWNER } from "../../lib/story-bridge";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const user = await requireChatGPTUser("/stories");
  const requestHeaders = await headers();
  const context = await requireWorkspaceContext(new Request("https://app.local/stories", { headers: requestHeaders }));
  if (!await canUseStories(context)) redirect("/");
  const scopeKey = `${user.userId}:${context.workspaceOwnerUserId}`;
  const highlightManagementEnabled = context.email.trim().toLowerCase() === "lucasbgn.affiliate@gmail.com"
    && context.workspaceOwnerUserId === MASTER_STORY_OWNER;
  const henriqueStoriesOnly = context.email.trim().toLowerCase() === "henriquerbrandao06@gmail.com"
    && context.accountUserId === "7967f23c-e24f-41e7-a092-5b3e73caedcc"
    && context.workspaceOwnerUserId === "7967f23c-e24f-41e7-a092-5b3e73caedcc";
  const storiesOnly = henriqueStoriesOnly || (context.email.trim().toLowerCase() === "eumickaelcastro@gmail.com"
    && context.accountUserId === "77e2d810-abb8-48da-8b06-79f953173c5b"
    && context.workspaceOwnerUserId === "77e2d810-abb8-48da-8b06-79f953173c5b");
  return <StoriesShell email={user.email} name={context.displayName} role={context.role} owner={isPlatformOwnerEmail(context.email)}><StoryTemplates key={scopeKey} scopeKey={scopeKey} role={context.role} profileSetupEnabled={!storiesOnly && isFeatureEnabled("profileSetup", context.email)} storiesOnly={storiesOnly} singleExtensionDownload={henriqueStoriesOnly} highlightManagementEnabled={highlightManagementEnabled} /></StoriesShell>;
}
