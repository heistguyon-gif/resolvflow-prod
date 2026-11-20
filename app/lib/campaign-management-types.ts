/** Shared API DTOs. archived is logical deletion, never deletion of Instagram posts. */
export type { CampaignConfiguration } from "./campaign-configuration";
export type CampaignManagementCampaign = {
  id: string; name: string; status: string; timezone: string;
  mediaType: string; mediaOrder: string; metaApiVersion: string | null;
  startAt: string | null; stopAt: string | null;
  distributionMode: string; intervalMinutes: number; repeatCount: number; respectDailyLimit: boolean;
  publishedCount: number; failedCount: number; totalAccounts: number;
  createdAt: string; updatedAt: string;
};

export type CampaignUpdateResult = {
  updated: true; futurePosts: number; campaign: CampaignManagementCampaign; warnings: string[];
};
export type CampaignCancelResult = {
  cancelled: number; campaign?: CampaignManagementCampaign;
  protectedPosts: number; inFlightPosts: number; warnings: string[];
};

export type CampaignArchiveResult = {
  campaign: { id: string; status: "archived" };
  archived: true;
  alreadyArchived: boolean;
  cancelledPosts: number;
  protectedPosts: number;
  inFlightPosts: number;
  warnings: string[];
};

export type CampaignBulkItemResult = {
  id: string; ok: boolean; status?: number;
  campaign?: CampaignManagementCampaign;
  archive?: CampaignArchiveResult;
  archived?: boolean;
  error?: string;
  warnings?: string[];
};
export type CampaignBulkResponse = {
  results: CampaignBulkItemResult[]; successes: number; failures: number;
};

export type CampaignMetricCoverage = {
  knownSum: number | null;
  knownPosts: number;
  unknownPosts: number;
  eligiblePosts: number;
  complete: boolean;
  staleOrPartialPosts: number;
};
export type CampaignOverviewSummary = {
  total: number; published: number; failed: number; blocked: number;
  waiting: number; delayed: number; distinctAccountCount: number;
  byStatus: Record<string, number>;
  metrics: { views: CampaignMetricCoverage; reach: CampaignMetricCoverage };
  warnings: string[];
};
export type CampaignOverviewResponse = {
  fetchedAt: string; consistency: "eventual"; scope: "workspace";
  summary: CampaignOverviewSummary & { campaignCount: number };
  campaigns: Array<{
    id: string; name: string; status: string; timezone: string;
    startAt: string | null; createdAt: string; summary: CampaignOverviewSummary;
  }>;
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
};
