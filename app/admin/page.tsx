import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { PlatformAdminDashboard } from "../components/PlatformAdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Command Center · resolvflow",
  description: "Administração da plataforma resolvflow.",
};

export default async function AdminPage() {
  await requireChatGPTUser("/admin");
  return <PlatformAdminDashboard />;
}
