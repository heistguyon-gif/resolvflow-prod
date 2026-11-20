import { authErrorResponse, requirePlatformOwner } from "../../../../lib/auth";
import { getMediaBucket } from "../../../../lib/media-storage";
import { featureInventory, isFeatureEnabled } from "../../../../lib/feature-rollouts";
import { readGmailPilotAccess, setGmailPilotAccess } from "../../../../lib/gmail-pilot-access";
import { storyAdminTargets, validateStoryAdminTarget } from "../../../../lib/admin-stories";
import { hasStoryGrant } from "../../../../lib/story-access";
import { bridgeError, jsonBody, noStore, sameOrigin } from "../../../../lib/story-bridge-http";
import { fail, onlyKeys, record, textField, uuid } from "../../../../lib/story-bridge";
import { isPlatformOwnerEmail } from "../../../../lib/platform-access";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const url = new URL(request.url), actor = url.searchParams.get("account"), owner = url.searchParams.get("workspace");
    if (!actor && !owner) return noStore(Response.json({ targets: await storyAdminTargets() }));
    if (!actor || !owner) fail();
    const target = await validateStoryAdminTarget(actor!, owner!, false), bucket = getMediaBucket();
    const access = await readGmailPilotAccess(bucket, owner!, actor!);
    const features = featureInventory(target.email).map(item => item.id === "gmailCentral" ? { ...item,
      enabled: item.enabled || access.enabled, configurable: !isFeatureEnabled("gmailCentral", target.email),
      scope: item.enabled ? "principal" : access.enabled ? "individual" : "off" } : item);
    features.push({ id: "stories", label: "Stories e destaques", scope: "individual", configurable: false,
      enabled: isPlatformOwnerEmail(target.email) || await hasStoryGrant(bucket, owner!, actor!) });
    return noStore(Response.json({ target, features, history: access.history, historySince: "Histórico desta liberação disponível a partir da criação deste controle. Pilotos anteriores são configuração da versão." }));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
export async function POST(request: Request) {
  try {
    const context = await requirePlatformOwner(request); sameOrigin(request);
    const body = record(await jsonBody(request));
    onlyKeys(body, ["accountUserId", "workspaceOwnerUserId", "enabled", "requestId", "feature"]);
    if (body.feature !== "gmailCentral" || typeof body.enabled !== "boolean") fail();
    const actor = textField(body.accountUserId, 180), owner = textField(body.workspaceOwnerUserId, 180), requestId = textField(body.requestId, 36); uuid(requestId);
    const target = await validateStoryAdminTarget(actor, owner, body.enabled);
    if (isFeatureEnabled("gmailCentral", target.email)) fail("principal_access", "A conta principal já participa do piloto desta versão.", 409);
    const access = await setGmailPilotAccess(getMediaBucket(), owner, actor, body.enabled, context.email, requestId);
    return noStore(Response.json({ access }));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
