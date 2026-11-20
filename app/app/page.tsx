import type { Metadata } from "next";
import { requireChatGPTUser } from "./chatgpt-auth";
import { NexoFlowDashboard } from "./components/NexoFlowDashboard";
import { isFeatureEnabled } from "../lib/feature-rollouts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "resolvflow",
  description: "Operação, contas e conteúdo.",
};

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <NexoFlowDashboard initialTabPersistenceEnabled={isFeatureEnabled("dashboardTabPersistence", user.email)} />;
}
