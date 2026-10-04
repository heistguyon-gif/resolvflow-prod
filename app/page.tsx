import type { Metadata } from "next";
import { requireChatGPTUser } from "./chatgpt-auth";
import { NexoFlowDashboard } from "./components/NexoFlowDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "resolvflow",
  description: "Operação, contas e conteúdo.",
};

export default async function Home() {
  await requireChatGPTUser("/");
  return <NexoFlowDashboard />;
}