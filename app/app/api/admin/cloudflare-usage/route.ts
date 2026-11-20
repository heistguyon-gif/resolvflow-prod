import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { runtimeEnv } from "../../../../lib/runtime-env";

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const DAY_MS = 86_400_000;
const FREE_DAILY_REFERENCE = {
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  storageBytes: 5_000_000_000,
};
const PAID_MONTHLY_INCLUDED = { rowsRead: 25_000_000_000, rowsWritten: 50_000_000, storageBytes: 5_000_000_000 };

type AnalyticsRow = {
  sum?: { readQueries?: number; writeQueries?: number; rowsRead?: number; rowsWritten?: number };
  dimensions?: { date?: string; databaseId?: string };
};

type StorageRow = {
  max?: { databaseSizeBytes?: number };
  dimensions?: { date?: string; databaseId?: string };
};

type Subscription = {
  currency?: string;
  current_period_end?: string;
  current_period_start?: string;
  frequency?: string;
  price?: number;
  state?: string;
  rate_plan?: { id?: string; public_name?: string; scope?: string; sets?: string[] };
};

type GraphqlResponse<T> = { data?: T; errors?: Array<{ message?: string }> };

async function queryCloudflare<T>(token: string, query: string, variables: Record<string, string>) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as GraphqlResponse<T>;
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.map((item) => item.message).filter(Boolean).join(" · ") || `Cloudflare Analytics respondeu ${response.status}.`);
  }
  return payload.data;
}

async function querySubscriptions(token: string, accountTag: string) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountTag}/subscriptions`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await response.json() as { success?: boolean; result?: Subscription[]; errors?: Array<{ message?: string }> };
  if (!response.ok || !payload.success) {
    throw new Error(payload.errors?.map((item) => item.message).filter(Boolean).join(" · ") || `Cloudflare Billing respondeu ${response.status}.`);
  }
  return payload.result || [];
}

function number(value: unknown) {
  return Number(value) || 0;
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const values = runtimeEnv();
    const token = values.CLOUDFLARE_ANALYTICS_TOKEN?.trim();
    const accountTag = values.CLOUDFLARE_ACCOUNT_ID?.trim();
    const primaryDatabaseId = values.CLOUDFLARE_D1_DATABASE_ID?.trim();
    if (!token || !accountTag) {
      return Response.json({ error: "Cloudflare Analytics ainda não está configurado." }, { status: 503 });
    }

    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - 30 * DAY_MS).toISOString().slice(0, 10);
    const variables = { accountTag, start, end };
    const analyticsQuery = `
      query D1Usage($accountTag: string!, $start: Date, $end: Date) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1AnalyticsAdaptiveGroups(
              limit: 10000
              filter: { date_geq: $start, date_leq: $end }
              orderBy: [date_DESC]
            ) {
              sum { readQueries writeQueries rowsRead rowsWritten }
              dimensions { date databaseId }
            }
          }
        }
      }
    `;
    const storageQuery = `
      query D1Storage($accountTag: string!, $start: Date, $end: Date) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1StorageAdaptiveGroups(
              limit: 10000
              filter: { date_geq: $start, date_leq: $end }
              orderBy: [date_DESC]
            ) {
              max { databaseSizeBytes }
              dimensions { date databaseId }
            }
          }
        }
      }
    `;

    type AnalyticsData = { viewer?: { accounts?: Array<{ d1AnalyticsAdaptiveGroups?: AnalyticsRow[] }> } };
    type StorageData = { viewer?: { accounts?: Array<{ d1StorageAdaptiveGroups?: StorageRow[] }> } };
    const [analyticsData, storageResult, subscriptionsResult] = await Promise.all([
      queryCloudflare<AnalyticsData>(token, analyticsQuery, variables),
      queryCloudflare<StorageData>(token, storageQuery, variables).catch((error: unknown) => ({ error })),
      querySubscriptions(token, accountTag).catch((error: unknown) => ({ error })),
    ]);
    const analyticsRows = analyticsData.viewer?.accounts?.flatMap((account) => account.d1AnalyticsAdaptiveGroups || []) || [];
    const storageRows = "error" in storageResult ? [] : storageResult.viewer?.accounts?.flatMap((account) => account.d1StorageAdaptiveGroups || []) || [];
    const historyByDate = new Map<string, { date: string; rowsRead: number; rowsWritten: number; readQueries: number; writeQueries: number }>();
    for (const row of analyticsRows) {
      const date = row.dimensions?.date;
      if (!date) continue;
      const current = historyByDate.get(date) || { date, rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 };
      current.rowsRead += number(row.sum?.rowsRead);
      current.rowsWritten += number(row.sum?.rowsWritten);
      current.readQueries += number(row.sum?.readQueries);
      current.writeQueries += number(row.sum?.writeQueries);
      historyByDate.set(date, current);
    }
    const history = [...historyByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    const today = historyByDate.get(end) || { date: end, rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 };
    const rolling31 = history.reduce((total, day) => ({
      rowsRead: total.rowsRead + day.rowsRead,
      rowsWritten: total.rowsWritten + day.rowsWritten,
      readQueries: total.readQueries + day.readQueries,
      writeQueries: total.writeQueries + day.writeQueries,
    }), { rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 });
    const utcDayStartedAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const elapsedDayRatio = Math.max(1 / 1440, Math.min(1, (now.getTime() - utcDayStartedAt) / DAY_MS));
    const projectedToday = {
      rowsRead: Math.round(today.rowsRead / elapsedDayRatio),
      rowsWritten: Math.round(today.rowsWritten / elapsedDayRatio),
      readQueries: Math.round(today.readQueries / elapsedDayRatio),
      writeQueries: Math.round(today.writeQueries / elapsedDayRatio),
    };
    const latestStorageByDatabase = new Map<string, { date: string; bytes: number }>();
    for (const row of storageRows) {
      const databaseId = row.dimensions?.databaseId;
      const date = row.dimensions?.date;
      if (!databaseId || !date) continue;
      const current = latestStorageByDatabase.get(databaseId);
      if (!current || date > current.date) latestStorageByDatabase.set(databaseId, { date, bytes: number(row.max?.databaseSizeBytes) });
    }
    const storageBytes = [...latestStorageByDatabase.values()].reduce((total, item) => total + item.bytes, 0);
    const primaryStorageBytes = primaryDatabaseId ? latestStorageByDatabase.get(primaryDatabaseId)?.bytes || 0 : 0;
    const subscriptions = "error" in subscriptionsResult ? [] : subscriptionsResult.map((item) => ({
      name: item.rate_plan?.public_name || item.rate_plan?.id || "Assinatura Cloudflare",
      planId: item.rate_plan?.id || null,
      scope: item.rate_plan?.scope || null,
      sets: item.rate_plan?.sets || [],
      state: item.state || null,
      frequency: item.frequency || null,
      periodStart: item.current_period_start || null,
      periodEnd: item.current_period_end || null,
      price: number(item.price),
      currency: item.currency || null,
    }));
    const workersSubscription = subscriptions.find((item) => /worker/i.test(`${item.name} ${item.planId} ${item.scope} ${item.sets.join(" ")}`))
      || subscriptions.find((item) => item.scope === "account" && item.state === "Paid")
      || subscriptions.find((item) => item.state === "Paid")
      || null;
    const billingStart = workersSubscription?.periodStart?.slice(0, 10) || start;
    const billingEnd = workersSubscription?.periodEnd?.slice(0, 10) || end;
    const billingUsage = history.filter((day) => day.date >= billingStart && day.date <= billingEnd).reduce((total, day) => ({
      rowsRead: total.rowsRead + day.rowsRead,
      rowsWritten: total.rowsWritten + day.rowsWritten,
      readQueries: total.readQueries + day.readQueries,
      writeQueries: total.writeQueries + day.writeQueries,
    }), { rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 });

    return Response.json({
      checkedAt: now.toISOString(),
      source: "Cloudflare GraphQL Analytics",
      retentionDays: 31,
      resetAtUtc: "00:00",
      benchmarks: { freeDaily: FREE_DAILY_REFERENCE, paidMonthlyIncluded: PAID_MONTHLY_INCLUDED },
      today,
      projectedToday,
      rolling31,
      storage: {
        bytes: storageBytes,
        primaryDatabaseBytes: primaryStorageBytes,
        databases: latestStorageByDatabase.size,
        measuredAt: [...latestStorageByDatabase.values()].map((item) => item.date).sort().at(-1) || null,
        available: storageRows.length > 0,
      },
      history,
      storageError: "error" in storageResult ? (storageResult.error instanceof Error ? storageResult.error.message : "Métrica de armazenamento indisponível.") : null,
      billing: {
        available: !("error" in subscriptionsResult),
        subscription: workersSubscription,
        usage: billingUsage,
        subscriptions,
        error: "error" in subscriptionsResult ? (subscriptionsResult.error instanceof Error ? subscriptionsResult.error.message : "Cobrança indisponível.") : null,
      },
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o consumo da Cloudflare." }, { status: 502 });
  }
}
