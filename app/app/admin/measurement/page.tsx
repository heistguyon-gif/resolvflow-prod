import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requirePlatformOwner } from "../../../lib/auth";
import { ownWorkspace } from "../../../lib/measurement/model";
import { MeasurementDashboard } from "../../components/MeasurementDashboard";

export const dynamic = "force-dynamic";
export const metadata = {title:"Aquisição e uso · ResolvFlow", robots:{index:false,follow:false}};

export default async function MeasurementAdmin() {
  const ctx = await requirePlatformOwner(new Request("https://resolvflow.online/admin/measurement", {headers: await headers()})).catch(() => null);
  if (!ctx || !ownWorkspace(ctx.email,ctx.workspaceOwnerUserId,ctx.role) || ctx.mustChangePassword) notFound();
  return <MeasurementDashboard/>;
}
