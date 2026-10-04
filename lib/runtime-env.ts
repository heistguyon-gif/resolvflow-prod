import { env } from "cloudflare:workers";

type RuntimeSecrets = {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_GRAPH_VERSION?: string;
  META_REDIRECT_URI?: string;
  META_APP_OPERATION_2_ID?: string;
  META_APP_OPERATION_2_SECRET?: string;
  META_APP_OPERATION_2_REDIRECT_URI?: string;
  META_APP_OPERATION_3_ID?: string;
  META_APP_OPERATION_3_SECRET?: string;
  META_APP_OPERATION_3_REDIRECT_URI?: string;
  META_LMS_LEANDRO_ID?: string;
  META_LMS_LEANDRO_SECRET?: string;
  META_LMS_WGB_ID?: string;
  META_LMS_WGB_SECRET?: string;
  META_LMS_WGB02_ID?: string;
  META_LMS_WGB02_SECRET?: string;
  META_LMS_PRADO_ID?: string;
  META_LMS_PRADO_SECRET?: string;
  META_LMS_FABRICIO_ID?: string;
  META_LMS_FABRICIO_SECRET?: string;
  META_FACEBOOK_APP_ID?: string;
  META_FACEBOOK_APP_SECRET?: string;
  META_FACEBOOK_REDIRECT_URI?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  SCHEDULER_SECRET?: string;
  NEXOFLOW_OWNER_EMAIL?: string;
  NEXOFLOW_PUBLISHING_ENABLED?: string;
  NEXOFLOW_META_CONNECTIONS_ENABLED?: string;
  INSTACASTER_API_KEY?: string;
  OTP_GLOBAL_API_CUTOVER_AT?: string;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  BRAVOPAY_API_KEY?: string;
  LEZTYPAY_API_KEY?: string;
  LEZTYPAY_WEBHOOK_SECRET?: string;
  SHARKBOT_WEBHOOK_SECRET?: string;
  SHARKBOT_WEBHOOK_SECRET_2?: string;
  SHARKBOT_WORKSPACE_OWNER_ID?: string;
  SHARKBOT_START_PUSH_SIMULATION?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
};

export type MetaAppKey = "default" | "operation_2" | "operation_3" | "leandro" | "wgb" | "wgb02" | "prado" | "fabricio" | "teste";

export const LEANDRO_WORKSPACE_OWNER_ID = "d15157f5-f0af-4d4a-a14b-d6bd1f845c30";
export const WGB_WORKSPACE_OWNER_ID = "f84b6f38-6b98-4ab0-bc5a-302aa6657e79";
export const PRADO_WORKSPACE_OWNER_ID = "af97a499-5b64-45e9-87c1-0854c152da26";
export const FABRICIO_WORKSPACE_OWNER_ID = "c417bcbb-1d3a-421f-a8b2-7f7d4077d221";
export const TESTE_WORKSPACE_OWNER_ID = "2b1be4ed-cf2d-4566-823e-f16f813b3744";
const STANDARD_META_APP_KEYS: MetaAppKey[] = ["default", "operation_2", "operation_3"];

export function runtimeEnv() {
  return env as unknown as RuntimeSecrets;
}

export function normalizeMetaAppKey(value?: string | null): MetaAppKey {
  if (value === "operation_2") return "operation_2";
  if (value === "operation_3") return "operation_3";
  if (value === "leandro") return "leandro";
  if (value === "wgb") return "wgb";
  if (value === "wgb02") return "wgb02";
  if (value === "prado") return "prado";
  if (value === "fabricio") return "fabricio";
  if (value === "teste") return "teste";
  return "default";
}

export function metaAppKeysForWorkspace(workspaceOwnerUserId: string, allowLeandro = false): MetaAppKey[] {
  if (workspaceOwnerUserId === TESTE_WORKSPACE_OWNER_ID) return ["teste"];
  if (workspaceOwnerUserId === PRADO_WORKSPACE_OWNER_ID) return ["prado"];
  if (workspaceOwnerUserId === FABRICIO_WORKSPACE_OWNER_ID) return ["fabricio"];
  if (workspaceOwnerUserId === WGB_WORKSPACE_OWNER_ID) {
    return (["wgb", "wgb02"] as MetaAppKey[]).filter((key) => metaConfig(key).configured);
  }
  if (workspaceOwnerUserId === LEANDRO_WORKSPACE_OWNER_ID) return ["leandro"];
  return allowLeandro ? [...STANDARD_META_APP_KEYS, "leandro"] : [...STANDARD_META_APP_KEYS];
}

export function metaAppKeyForWorkspace(workspaceOwnerUserId: string, requested?: string | null, allowLeandro = false): MetaAppKey {
  const normalized = normalizeMetaAppKey(requested);
  if (workspaceOwnerUserId === TESTE_WORKSPACE_OWNER_ID) return "teste";
  if (workspaceOwnerUserId === PRADO_WORKSPACE_OWNER_ID) return "prado";
  if (workspaceOwnerUserId === FABRICIO_WORKSPACE_OWNER_ID) return "fabricio";
  if (workspaceOwnerUserId === WGB_WORKSPACE_OWNER_ID) return normalized === "wgb02" ? "wgb02" : "wgb";
  if (workspaceOwnerUserId === LEANDRO_WORKSPACE_OWNER_ID) return "leandro";
  if (normalized === "wgb" || normalized === "wgb02" || normalized === "prado" || normalized === "fabricio" || normalized === "teste") return "default";
  return normalized === "leandro" && !allowLeandro ? "default" : normalized;
}

export function metaAppLabel(key?: string | null) {
  if (key === "operation_2") return "MK 2";
  if (key === "operation_3") return "MK 1";
  if (key === "leandro") return "App 01";
  if (key === "wgb") return "App 01 - WGB";
  if (key === "wgb02") return "App 02 - WGB";
  if (key === "prado") return "App Prado";
  if (key === "fabricio") return "App Fabricio";
  if (key === "teste") return "App Teste";
  return "MK 3";
}

export function metaConfig(key: MetaAppKey | string = "default") {
  const values = runtimeEnv();
  const appKey = normalizeMetaAppKey(key);
  const graphVersion = values.META_GRAPH_VERSION ?? "";
  const encryptionKey = values.TOKEN_ENCRYPTION_KEY ?? "";
  const fallbackRedirect = values.META_REDIRECT_URI ?? "";
  if (appKey === "operation_2") {
    const appId = values.META_APP_OPERATION_2_ID ?? "";
    const appSecret = values.META_APP_OPERATION_2_SECRET ?? "";
    const redirectUri = values.META_APP_OPERATION_2_REDIRECT_URI || fallbackRedirect;
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri, encryptionKey };
  }
  if (appKey === "operation_3") {
    const appId = values.META_APP_OPERATION_3_ID ?? "";
    const appSecret = values.META_APP_OPERATION_3_SECRET ?? "";
    const redirectUri = values.META_APP_OPERATION_3_REDIRECT_URI || fallbackRedirect;
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri, encryptionKey };
  }
  if (appKey === "leandro") {
    const appId = values.META_LMS_LEANDRO_ID ?? "";
    const appSecret = values.META_LMS_LEANDRO_SECRET ?? "";
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri: fallbackRedirect, encryptionKey };
  }
  if (appKey === "wgb") {
    const appId = values.META_LMS_WGB_ID ?? "";
    const appSecret = values.META_LMS_WGB_SECRET ?? "";
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri: fallbackRedirect, encryptionKey };
  }
  if (appKey === "wgb02") {
    const appId = values.META_LMS_WGB02_ID ?? "";
    const appSecret = values.META_LMS_WGB02_SECRET ?? "";
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri: fallbackRedirect, encryptionKey };
  }
  if (appKey === "prado") {
    const appId = values.META_LMS_PRADO_ID ?? "";
    const appSecret = values.META_LMS_PRADO_SECRET ?? "";
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri: fallbackRedirect, encryptionKey };
  }
  if (appKey === "fabricio" || appKey === "teste") {
    const appId = values.META_LMS_FABRICIO_ID ?? "";
    const appSecret = values.META_LMS_FABRICIO_SECRET ?? "";
    return { key: appKey, configured: Boolean(appId && appSecret && graphVersion && encryptionKey), appId, appSecret, graphVersion, redirectUri: fallbackRedirect, encryptionKey };
  }
  const configured = Boolean(values.META_APP_ID && values.META_APP_SECRET && graphVersion && encryptionKey);
  return {
    key: appKey,
    configured,
    appId: values.META_APP_ID ?? "",
    appSecret: values.META_APP_SECRET ?? "",
    graphVersion,
    redirectUri: fallbackRedirect,
    encryptionKey,
  };
}

export function facebookMetaConfig() {
  const values = runtimeEnv();
  const configured = Boolean(values.META_FACEBOOK_APP_ID && values.META_FACEBOOK_APP_SECRET && values.META_GRAPH_VERSION && values.TOKEN_ENCRYPTION_KEY);
  return {
    configured,
    appId: values.META_FACEBOOK_APP_ID ?? "",
    appSecret: values.META_FACEBOOK_APP_SECRET ?? "",
    graphVersion: values.META_GRAPH_VERSION ?? "",
    redirectUri: values.META_FACEBOOK_REDIRECT_URI ?? "",
  };
}
