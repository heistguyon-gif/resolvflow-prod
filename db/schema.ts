import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  instagramAccountId: text("instagram_account_id"),
  username: text("username").notNull(),
  displayName: text("display_name"),
  player: text("player").notNull().default("Sem player"),
  model: text("model").notNull().default("Sem modelo"),
  groupName: text("group_name"),
  niche: text("niche"),
  healthStatus: text("health_status").notNull().default("Desconhecida"),
  connectionStatus: text("connection_status").notNull().default("Não verificada"),
  priority: text("priority").notNull().default("Normal"),
  postsToday: integer("posts_today").notNull().default(0),
  postsTodayDate: text("posts_today_date"),
  queueCount: integer("queue_count").notNull().default(0),
  views30d: integer("views_30d").notNull().default(0),
  reach30d: integer("reach_30d").notNull().default(0),
  followersCount: integer("followers_count").notNull().default(0),
  followsCount: integer("follows_count").notNull().default(0),
  mediaCount: integer("media_count").notNull().default(0),
  profileViews30d: integer("profile_views_30d").notNull().default(0),
  newFollowers30d: integer("new_followers_30d").notNull().default(0),
  lastError: text("last_error"),
  notes: text("notes"),
  loginEmail: text("login_email"),
  recoveryEmail: text("recovery_email"),
  phoneNumber: text("phone_number"),
  twoFactorMethod: text("two_factor_method"),
  vaultReference: text("vault_reference"),
  loginPasswordCiphertext: text("login_password_ciphertext"),
  loginPasswordIv: text("login_password_iv"),
  emailPasswordCiphertext: text("email_password_ciphertext"),
  emailPasswordIv: text("email_password_iv"),
  emailTwoFactor: text("email_two_factor"),
  lifecycle: text("lifecycle").notNull().default("ativa"),
  archivedAt: text("archived_at"),
  source: text("source").notNull().default("manual"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("accounts_owner_username_uq").on(table.ownerUserId, table.username),
  index("accounts_owner_health_idx").on(table.ownerUserId, table.healthStatus),
  index("accounts_owner_priority_idx").on(table.ownerUserId, table.priority),
  index("accounts_owner_archived_idx").on(table.ownerUserId, table.archivedAt),
]);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  metaAppKey: text("meta_app_key").notNull().default("default"),
  createdByUserId: text("created_by_user_id"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("workspaces_meta_app_key_idx").on(table.metaAppKey),
]);

export const dashboardPreferences = sqliteTable("dashboard_preferences", {
  workspaceOwnerUserId: text("workspace_owner_user_id").primaryKey(),
  preferencesJson: text("preferences_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(1),
  lastLoginAt: text("last_login_at"),
  avatarMediaId: text("avatar_media_id"),
  notifyPublish: integer("notify_publish", { mode: "boolean" }).notNull().default(true),
  notifyErrors: integer("notify_errors", { mode: "boolean" }).notNull().default(true),
  notifyConnections: integer("notify_connections", { mode: "boolean" }).notNull().default(true),
  createdByUserId: text("created_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("app_users_email_uq").on(table.email),
  index("app_users_status_idx").on(table.status),
]);

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  firstFailedAt: text("first_failed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("login_attempts_updated_idx").on(table.updatedAt)]);

export const systemHealth = sqliteTable("system_health", {
  key: text("key").primaryKey(),
  status: text("status").notNull().default("unknown"),
  lastStartedAt: text("last_started_at"),
  lastCompletedAt: text("last_completed_at"),
  lastError: text("last_error"),
  detailsJson: text("details_json"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("system_health_updated_idx").on(table.updatedAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("audit_events_owner_created_idx").on(table.ownerUserId, table.createdAt),
  index("audit_events_entity_idx").on(table.entityType, table.entityId),
]);

export const workspaceMembers = sqliteTable("workspace_members", {
  id: text("id").primaryKey(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  accountUserId: text("account_user_id"),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("invited"),
  invitedByUserId: text("invited_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("workspace_members_workspace_email_uq").on(table.workspaceOwnerUserId, table.email),
  uniqueIndex("workspace_members_account_workspace_uq").on(table.accountUserId, table.workspaceOwnerUserId),
  index("workspace_members_workspace_role_idx").on(table.workspaceOwnerUserId, table.role),
]);

export const importRuns = sqliteTable("import_runs", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  fileName: text("file_name").notNull(),
  source: text("source").notNull().default("murphy_csv"),
  status: text("status").notNull().default("completed"),
  rowsRead: integer("rows_read").notNull().default(0),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("imports_owner_created_idx").on(table.ownerUserId, table.createdAt)]);

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("not_connected"),
  externalAppId: text("external_app_id"),
  accountCount: integer("account_count").notNull().default(0),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("integrations_owner_provider_uq").on(table.ownerUserId, table.provider)]);

export const sharkbotEvents = sqliteTable("sharkbot_events", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  eventKey: text("event_key").notNull(),
  eventType: text("event_type").notNull(),
  externalEventId: text("external_event_id"),
  paymentId: text("payment_id"),
  status: text("status"),
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("BRL"),
  payerName: text("payer_name"),
  productName: text("product_name"),
  botName: text("bot_name"),
  flowName: text("flow_name"),
  gateway: text("gateway"),
  occurredAt: text("occurred_at").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("sharkbot_events_owner_key_uq").on(table.ownerUserId, table.eventKey),
  index("sharkbot_events_owner_occurred_idx").on(table.ownerUserId, table.occurredAt),
  index("sharkbot_events_owner_type_idx").on(table.ownerUserId, table.eventType),
]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  accountUserId: text("account_user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  notifyNewLead: integer("notify_new_lead", { mode: "boolean" }).notNull().default(true),
  notifyPaymentCreated: integer("notify_payment_created", { mode: "boolean" }).notNull().default(false),
  notifyPaymentApproved: integer("notify_payment_approved", { mode: "boolean" }).notNull().default(true),
  lastSuccessAt: text("last_success_at"),
  disabledAt: text("disabled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("push_subscriptions_endpoint_uq").on(table.endpoint),
  index("push_subscriptions_owner_account_idx").on(table.ownerUserId, table.accountUserId),
  index("push_subscriptions_owner_active_idx").on(table.ownerUserId, table.disabledAt),
]);

export const sharkbotPushDeliveries = sqliteTable("sharkbot_push_deliveries", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  status: text("status").notNull().default("sending"),
  providerStatus: integer("provider_status"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("sharkbot_push_deliveries_event_subscription_uq").on(table.eventId, table.subscriptionId),
  index("sharkbot_push_deliveries_event_idx").on(table.eventId),
]);

export const metaConnections = sqliteTable("meta_connections", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  instagramUserId: text("instagram_user_id").notNull(),
  username: text("username").notNull(),
  accountType: text("account_type"),
  tokenCiphertext: text("token_ciphertext").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenExpiresAt: text("token_expires_at"),
  scopes: text("scopes").notNull().default(""),
  status: text("status").notNull().default("connected"),
  publishingLimitUsed: integer("publishing_limit_used").notNull().default(0),
  publishingLimitTotal: integer("publishing_limit_total").notNull().default(100),
  lastSyncAt: text("last_sync_at"),
  lastError: text("last_error"),
  metaAppKey: text("meta_app_key").notNull().default("default"),
  metaAppId: text("meta_app_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meta_connections_owner_ig_uq").on(table.ownerUserId, table.instagramUserId),
  index("meta_connections_owner_status_idx").on(table.ownerUserId, table.status),
]);

export const workspaceMetaApps = sqliteTable("workspace_meta_apps", {
  id: text("id").primaryKey(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  label: text("label").notNull(),
  appId: text("app_id").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  secretIv: text("secret_iv").notNull(),
  graphVersion: text("graph_version").notNull(),
  redirectUri: text("redirect_uri").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdByUserId: text("created_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("workspace_meta_apps_workspace_uq").on(table.workspaceOwnerUserId),
  index("workspace_meta_apps_status_idx").on(table.status),
]);

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  initiatedByUserId: text("initiated_by_user_id"),
  operationId: text("operation_id"),
  metaAppKey: text("meta_app_key").notNull().default("default"),
  redirectUri: text("redirect_uri").notNull().default(""),
  returnTo: text("return_to").notNull().default("/"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("oauth_states_owner_idx").on(table.ownerUserId)]);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull().default("IMAGE"),
  metaApiVersion: text("meta_api_version"),
  mediaUrl: text("media_url").notNull(),
  mediaCount: integer("media_count").notNull().default(1),
  coverMediaId: text("cover_media_id"),
  caption: text("caption").notNull().default(""),
  captionVariations: text("caption_variations").notNull().default("[]"),
  hashtags: text("hashtags").notNull().default(""),
  shareToFeed: integer("share_to_feed", { mode: "boolean" }).notNull().default(false),
  distributionMode: text("distribution_mode").notNull().default("all_accounts"),
  mediaOrder: text("media_order").notNull().default("sequential"),
  repeatCount: integer("repeat_count").notNull().default(1),
  stopAt: text("stop_at"),
  respectDailyLimit: integer("respect_daily_limit", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("draft"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  startAt: text("start_at"),
  intervalMinutes: integer("interval_minutes").notNull().default(5),
  totalAccounts: integer("total_accounts").notNull().default(0),
  publishedCount: integer("published_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("campaigns_owner_status_idx").on(table.ownerUserId, table.status),
  index("campaigns_owner_created_idx").on(table.ownerUserId, table.createdAt),
]);

export const campaignMedia = sqliteTable("campaign_media", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  publicUrl: text("public_url").notNull(),
  purpose: text("purpose").notNull().default("content"),
  caption: text("caption").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("campaign_media_campaign_order_uq").on(table.campaignId, table.sortOrder),
  index("campaign_media_owner_campaign_idx").on(table.ownerUserId, table.campaignId),
]);

export const scheduledPosts = sqliteTable("scheduled_posts", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  mediaItemId: text("media_item_id").references(() => campaignMedia.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").references(() => metaConnections.id, { onDelete: "set null" }),
  repeatIndex: integer("repeat_index").notNull().default(0),
  captionOverride: text("caption_override"),
  status: text("status").notNull().default("pending"),
  scheduledFor: text("scheduled_for").notNull(),
  nextAttemptAt: text("next_attempt_at").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  containerId: text("container_id"),
  containerCaptionHash: text("container_caption_hash"),
  publishedMediaId: text("published_media_id"),
  publishedPermalink: text("published_permalink"),
  captionFallback: text("caption_fallback"),
  captionFallbackCommentId: text("caption_fallback_comment_id"),
  mediaViews: integer("media_views").notNull().default(0),
  mediaReach: integer("media_reach").notNull().default(0),
  insightsSyncedAt: text("insights_synced_at"),
  insightsError: text("insights_error"),
  lastError: text("last_error"),
  lockedAt: text("locked_at"),
  lockToken: text("lock_token"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("scheduled_posts_due_idx").on(table.status, table.nextAttemptAt),
  index("scheduled_posts_owner_status_idx").on(table.ownerUserId, table.status),
  index("scheduled_posts_owner_published_idx").on(table.ownerUserId, table.status, table.publishedAt),
  index("scheduled_posts_campaign_idx").on(table.campaignId, table.scheduledFor),
  index("scheduled_posts_insights_idx").on(table.status, table.insightsSyncedAt),
  uniqueIndex("scheduled_posts_campaign_account_media_repeat_uq").on(table.campaignId, table.accountId, table.mediaItemId, table.repeatIndex),
]);

export const publicationAttempts = sqliteTable("publication_attempts", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  scheduledPostId: text("scheduled_post_id").notNull().references(() => scheduledPosts.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  outcome: text("outcome").notNull(),
  metaErrorCode: text("meta_error_code"),
  message: text("message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("publication_attempts_post_created_idx").on(table.scheduledPostId, table.createdAt)]);

export const otpSettings = sqliteTable("otp_settings", {
  id: text("id").primaryKey(),
  priceCents: integer("price_cents").notNull().default(200),
  pricePriorityCents: integer("price_priority_cents").notNull().default(250),
  priceRushCents: integer("price_rush_cents").notNull().default(300),
  minDepositCents: integer("min_deposit_cents").notNull().default(2000),
  instacasterCiphertext: text("instacaster_ciphertext"),
  instacasterIv: text("instacaster_iv"),
  mercadoPagoCiphertext: text("mercado_pago_ciphertext"),
  mercadoPagoIv: text("mercado_pago_iv"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const metaApps = sqliteTable("meta_apps", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  appId: text("app_id").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  secretIv: text("secret_iv").notNull(),
  graphVersion: text("graph_version").notNull(),
  redirectUri: text("redirect_uri").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdByUserId: text("created_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("meta_apps_app_id_idx").on(table.appId),
  index("meta_apps_status_idx").on(table.status),
]);

export const metaAppAssignments = sqliteTable("meta_app_assignments", {
  id: text("id").primaryKey(),
  metaAppId: text("meta_app_id").notNull(),
  accountUserId: text("account_user_id").notNull(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  status: text("status").notNull().default("active"),
  grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  revokedAt: text("revoked_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meta_app_assignments_target_uq").on(table.metaAppId, table.accountUserId, table.workspaceOwnerUserId),
  index("meta_app_assignments_user_workspace_idx").on(table.accountUserId, table.workspaceOwnerUserId, table.status),
]);

export const metaInvitePlatformSettings = sqliteTable("meta_invite_platform_settings", {
  key: text("key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const metaConnectionModes = sqliteTable("meta_connection_modes", {
  accountUserId: text("account_user_id").notNull(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  mode: text("mode").notNull().default("standard"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.accountUserId, table.workspaceOwnerUserId] })]);

export const metaAppUserPolicies = sqliteTable("meta_app_user_policies", {
  accountUserId: text("account_user_id").notNull(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  managedAt: text("managed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("meta_app_user_policies_target_uq").on(table.accountUserId, table.workspaceOwnerUserId)]);

export const otpWallets = sqliteTable("otp_wallets", {
  workspaceOwnerUserId: text("workspace_owner_user_id").primaryKey(),
  balanceCents: integer("balance_cents").notNull().default(0),
  billingMode: text("billing_mode"),
  supplierCiphertext: text("supplier_ciphertext"),
  supplierIv: text("supplier_iv"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const otpLedger = sqliteTable("otp_ledger", {
  id: text("id").primaryKey(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  type: text("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(),
  refId: text("ref_id"),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("otp_ledger_workspace_created_idx").on(table.workspaceOwnerUserId, table.createdAt),
]);

export const otpPayments = sqliteTable("otp_payments", {
  id: text("id").primaryKey(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  provider: text("provider").notNull().default("mercadopago"),
  providerPaymentId: text("provider_payment_id"),
  amountCents: integer("amount_cents").notNull(),
  gmailCount: integer("gmail_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  qrCode: text("qr_code"),
  ticketUrl: text("ticket_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  paidAt: text("paid_at"),
}, (table) => [
  uniqueIndex("otp_payments_provider_id_uq").on(table.provider, table.providerPaymentId),
  index("otp_payments_workspace_status_idx").on(table.workspaceOwnerUserId, table.status),
]);

export const otpPixWebhookEvents = sqliteTable("otp_pix_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  providerPaymentId: text("provider_payment_id").notNull(),
  status: text("status").notNull().default("received"),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  processedAt: text("processed_at"),
  lastError: text("last_error"),
}, (table) => [
  index("otp_pix_webhook_events_status_received_idx").on(table.status, table.receivedAt),
]);

export const otpSupplierApis = sqliteTable("otp_supplier_apis", {
  id: text("id").primaryKey(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  name: text("name").notNull(),
  keyCiphertext: text("key_ciphertext").notNull(),
  keyIv: text("key_iv").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("otp_supplier_apis_workspace_name_uq").on(table.workspaceOwnerUserId, table.name),
  index("otp_supplier_apis_workspace_enabled_idx").on(table.workspaceOwnerUserId, table.enabled),
]);

export const otpInbox = sqliteTable("otp_inbox", {
  id: text("id").primaryKey(),
  accountUserId: text("account_user_id").notNull(),
  workspaceOwnerUserId: text("workspace_owner_user_id").notNull(),
  supplierApiId: text("supplier_api_id").references(() => otpSupplierApis.id, { onDelete: "set null" }),
  orderId: text("order_id").notNull(),
  email: text("email").notNull(),
  product: text("product").notNull().default("ig_gmail_otp"),
  status: text("status").notNull().default("active"),
  price: text("price").notNull().default(""),
  codesJson: text("codes_json").notNull().default("[]"),
  closed: integer("closed").notNull().default(0),
  hiddenAt: text("hidden_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("otp_inbox_account_api_order_uq").on(table.accountUserId, table.supplierApiId, table.orderId),
  index("otp_inbox_account_created_idx").on(table.accountUserId, table.createdAt),
  index("otp_inbox_api_status_idx").on(table.supplierApiId, table.status),
]);

export const otpInboxState = sqliteTable("otp_inbox_state", {
  accountUserId: text("account_user_id").primaryKey(),
  activeOrderId: text("active_order_id"),
  activeSupplierApiId: text("active_supplier_api_id").references(() => otpSupplierApis.id, { onDelete: "set null" }),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const connectionRequests = sqliteTable("connection_requests", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  requestedByUserId: text("requested_by_user_id").notNull(),
  requestedByEmail: text("requested_by_email").notNull(),
  username: text("username").notNull(),
  metaAppKey: text("meta_app_key").notNull().default("default"),
  status: text("status").notNull().default("pending"),
  inviteMode: text("invite_mode").notNull().default("manual"),
  inviteClaimToken: text("invite_claim_token"),
  inviteLeaseUntil: text("invite_lease_until"),
  inviteAttempts: integer("invite_attempts").notNull().default(0),
  inviteLastError: text("invite_last_error"),
  invitedAt: text("invited_at"),
  invitedByEmail: text("invited_by_email"),
  connectedAt: text("connected_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("connection_requests_owner_username_uq").on(table.ownerUserId, table.username),
  index("connection_requests_status_app_idx").on(table.status, table.metaAppKey),
  index("connection_requests_owner_status_idx").on(table.ownerUserId, table.status),
  index("connection_requests_invite_agent_idx").on(table.inviteMode, table.metaAppKey, table.status, table.inviteLeaseUntil),
]);
