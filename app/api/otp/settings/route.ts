import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { formatBrl, getInstacasterApiKey, getMercadoPagoToken, getOtpSettingsRow, publicOtpPrices, saveOtpSettings } from "../../../../lib/otp-billing";
import { recordAuditEvent } from "../../../../lib/audit";
import { getGlobalOtpBalance } from "../../../../lib/otp-global-balance";

function parseReais(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().replace(/[R$\s]/gi, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) ? cents : undefined;
}

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const [row, apiKey, mpToken, globalBalance] = await Promise.all([
      getOtpSettingsRow(), getInstacasterApiKey(), getMercadoPagoToken(),
      getGlobalOtpBalance(new URL(request.url).searchParams.get("refreshBalance") === "1"),
    ]);
    return Response.json({
      ...publicOtpPrices(row),
      supplierReady: Boolean(apiKey),
      pixReady: Boolean(mpToken),
      globalBalance,
      workspaceOwnerUserId: ctx.workspaceOwnerUserId,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível ler as configurações." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const payload = await request.json() as {
      priceReais?: string | number;
      pricePriorityReais?: string | number;
      priceRushReais?: string | number;
      minDepositReais?: string | number;
      supplierKey?: string;
      pixToken?: string;
    };
    const saved = await saveOtpSettings({
      priceCents: parseReais(payload.priceReais),
      pricePriorityCents: parseReais(payload.pricePriorityReais),
      priceRushCents: parseReais(payload.priceRushReais),
      minDepositCents: parseReais(payload.minDepositReais),
      instacasterKey: typeof payload.supplierKey === "string" ? payload.supplierKey : undefined,
      mercadoPagoToken: typeof payload.pixToken === "string" ? payload.pixToken : undefined,
    });
    await recordAuditEvent(request, {
      ownerUserId: ctx.workspaceOwnerUserId,
      action: "otp.settings",
      entityType: "otp_settings",
      entityId: "default",
      summary: `Preços Gmail OTP ${formatBrl(saved.priceCents)} / ${formatBrl(saved.pricePriorityCents)} / ${formatBrl(saved.priceRushCents)} · mín ${formatBrl(saved.minDepositCents)}`,
    });
    return Response.json(saved);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível salvar." }, { status: 502 });
  }
}
