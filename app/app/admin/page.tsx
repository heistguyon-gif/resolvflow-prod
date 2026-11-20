import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { PlatformAdminDashboard } from "../components/PlatformAdminDashboard";
import { isPlatformOwnerEmail } from "../../lib/platform-access";
import { isFeatureEnabled } from "../../lib/feature-rollouts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Command Center · resolvflow",
  description: "Administração da plataforma resolvflow.",
};

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  return <PlatformAdminDashboard viewerEmail={user.email} viewerRole={isPlatformOwnerEmail(user.email) ? "owner" : "admin"} walletHistoryEnabled={isFeatureEnabled("adminWalletHistory",user.email)} />;
}
