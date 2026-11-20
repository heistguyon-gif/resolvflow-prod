export type CampaignActivityFilter = "issues" | "failed" | "waiting" | "published" | "all";

export type CampaignDiagnosis = {
  category: string;
  title: string;
  explanation: string;
  action: string | null;
  severity: "info" | "warning" | "error";
};

export type CampaignAttempt = {
  id: string;
  stage: string;
  outcome: string;
  message: string | null;
  createdAt: string;
  metaCode: string | null;
  metaSubcode: number | null;
  httpStatus: number | null;
  requestId: string | null;
  endpoint: string | null;
  usage: Array<{
    type: string;
    callPercent: number | null;
    cpuPercent: number | null;
    timePercent: number | null;
    estimatedRecoveryMinutes: number | null;
  }>;
  retryAfterSeconds: number | null;
};

export type CampaignActivityAccount = {
  id: string;
  username: string;
  total: number;
  published: number;
  failed: number;
  blocked: number;
  waiting: number;
  healthStatus: string | null;
  connectionStatus: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
  quotaUsed: number | null;
  quotaTotal: number | null;
};

export type CampaignActivityPost = {
  id: string;
  accountId: string;
  username: string;
  fileName: string | null;
  status: string;
  scheduledFor: string;
  nextAttemptAt: string;
  publishedAt: string | null;
  updatedAt: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  insightsError: string | null;
  mediaViews: number | null;
  mediaReach: number | null;
  insightsSyncedAt: string | null;
  diagnosis: CampaignDiagnosis;
  lastAttempt: CampaignAttempt | null;
};

export type CampaignActivityResponse = {
  fetchedAt: string;
  campaign: { id: string; name: string; status: string; timezone: string };
  summary: {
    total: number;
    published: number;
    failed: number;
    blocked: number;
    waiting: number;
    delayed: number;
    pending: number;
    processing: number;
    paused: number;
    cancelled: number;
  };
  accounts: CampaignActivityAccount[];
  posts: CampaignActivityPost[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
};

export type CampaignPostActivityResponse = {
  fetchedAt: string;
  post: CampaignActivityPost;
  attempts: CampaignAttempt[];
  hasMoreAttempts: boolean;
};
