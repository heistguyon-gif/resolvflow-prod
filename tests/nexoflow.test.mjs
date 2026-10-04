import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: {
    accept: "text/html",
    "oai-authenticated-user-id": "test-user",
    "oai-authenticated-user-email": "test@example.com",
  } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    DB: undefined,
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renderiza a central operacional NexoFlow", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>NexoFlow/);
  assert.match(html, /Central de operações/);
  assert.match(html, /contas conectadas/i);
  assert.match(html, /Importar contas/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("mantém o modelo de dados seguro e isolado por usuário", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const importRoute = await readFile(new URL("../app/api/imports/route.ts", import.meta.url), "utf8");
  const authHelper = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(schema, /ownerUserId/);
  assert.match(schema, /accounts_owner_username_uq/);
  assert.match(authHelper, /requireWorkspaceContext/);
  assert.match(authHelper, /workspaceMemo/);
  assert.match(importRoute, /10_000_000/);
  assert.match(importRoute, /Promise\.all\(batch\.map/);
  assert.match(importRoute, /imported: created, updated/);
  assert.match(importRoute, /case when.*connectionStatus.*Conectada/);
  assert.doesNotMatch(importRoute, /app_secret|access_token|password/i);
});

test("monitora infraestrutura, agendador e ações operacionais", async () => {
  const [schema, worker, healthRoute, auditRoute, auditHelper, dashboard, wrangler] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/system/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/audit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/audit.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /systemHealth/);
  assert.match(schema, /auditEvents/);
  assert.match(worker, /scheduler_run/);
  assert.match(worker, /sessionMemo/);
  assert.match(worker, /last_completed_at/);
  assert.match(worker, /console\.error\(JSON\.stringify/);
  assert.match(healthRoute, /getMediaBucket\(\)\.list/);
  assert.match(healthRoute, /requireOwnerId\(request, "viewer"\)/);
  assert.match(auditRoute, /limit\(100\)/);
  assert.match(auditHelper, /Never pass passwords, tokens, captions or recovery codes/);
  assert.doesNotMatch(auditHelper, /passwordHash|tokenCiphertext|captionOverride/);
  assert.match(dashboard, /Saúde da infraestrutura/);
  assert.match(dashboard, /Histórico operacional/);
  assert.match(dashboard, /Os números atualizam sozinhos a cada 5 minutos/);
  assert.match(dashboard, /readApiJson/);
  assert.match(wrangler, /"head_sampling_rate": 0\.05/);
});

test("inclui upload em lote, confirmação, fila e proteção de tokens", async () => {
  const [schema, queueEngine, metaRoute, dashboard, uploadRoute, campaignRoute, campaignManageRoute, metaApi] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/queue-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/upload/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta-api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /scheduledPosts/);
  assert.match(schema, /publicationAttempts/);
  assert.match(schema, /tokenCiphertext/);
  assert.match(queueEngine, /container_created/);
  assert.match(queueEngine, /lockToken/);
  assert.match(metaRoute, /encryptToken/);
  assert.doesNotMatch(metaRoute, /requireOwnerId/);
  assert.match(schema, /campaignMedia/);
  assert.match(schema, /scheduled_posts_campaign_account_media_repeat_uq/);
  assert.match(schema, /captionOverride/);
  assert.doesNotMatch(dashboard, /Gerar 25 variações automaticamente/);
  assert.match(dashboard, /Aguardando Meta/);
  assert.match(dashboard, /Ver contas importadas/);
  assert.match(dashboard, /nenhum comentário automático é enviado/i);
  assert.match(dashboard, /Publicação desligada/);
  assert.match(dashboard, /media\/upload/);
  assert.match(uploadRoute, /MAX_MEDIA_BYTES/);
  assert.match(campaignRoute, /CAMPAIGN_MEDIA_INSERT_BATCH_SIZE = 8/);
  assert.match(campaignRoute, /mediaRows\.slice\(index, index \+ CAMPAIGN_MEDIA_INSERT_BATCH_SIZE\)/);
  assert.match(dashboard, /Gerenciar/);
  assert.match(campaignManageRoute, /action === "pause"/);
  assert.match(campaignManageRoute, /action === "resume"/);
  assert.match(campaignManageRoute, /action === "cancel"/);
  assert.match(campaignManageRoute, /captionOverride: composeCampaignCaption/);
  assert.doesNotMatch(campaignManageRoute, /captionVariationCapacity/);
  assert.match(metaApi, /payload\.caption = input\.caption/);
  assert.match(metaApi, /url\.searchParams\.set\(key, String\(value\)\)/);
  assert.match(metaApi, /if \(input\.graphVersionOverride === "v23\.0"\)/);
  assert.match(metaApi, /const body = new FormData\(\)/);
  assert.doesNotMatch(metaApi, /body: JSON\.stringify\(payload\)/);
  assert.doesNotMatch(metaApi, /application\/x-www-form-urlencoded;charset=UTF-8/);
  assert.match(metaApi, /authorization: `Bearer \$\{input\.accessToken\}`/);
  assert.match(metaApi, /getPublishedMedia/);
  assert.doesNotMatch(dashboard, /META_APP_SECRET|TOKEN_ENCRYPTION_KEY/);
});

test("inclui organização, calendário, controles da fila, alertas e métricas Meta", async () => {
  const [schema, dashboard, styles, accountsRoute, queueRoute, queueItemRoute, alertsRoute, reportsRoute, metaApi, metaSync, jobsRoute] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/queue/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/queue/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/alerts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reports/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/run/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /reach30d/);
  assert.match(schema, /vaultReference/);
  assert.match(schema, /publishedPermalink/);
  assert.match(accountsRoute, /export async function PATCH/);
  assert.match(dashboard, /Organizar.*conta/);
  assert.match(dashboard, /Calendário operacional/);
  assert.match(dashboard, /Salvar alterações/);
  assert.match(queueItemRoute, /"reschedule" \| "cancel" \| "retry"/);
  assert.match(queueItemRoute, /resolve_publication/);
  assert.match(alertsRoute, /publishingLimitUsed/);
  assert.match(reportsRoute, /views30d/);
  assert.match(reportsRoute, /perMedia/);
  assert.match(reportsRoute, /searchParams\.get\("from"\)/);
  assert.match(reportsRoute, /mediaViews/);
  assert.match(reportsRoute, /publishedAt/);
  assert.match(metaApi, /read\("views,reach"/);
  assert.match(metaApi, /loadMetrics\("views,reach"\)/);
  assert.match(metaApi, /metric_type: "total_value"/);
  assert.match(metaApi, /getMediaInsights/);
  assert.match(schema, /mediaViews/);
  assert.match(schema, /insightsSyncedAt/);
  assert.doesNotMatch(metaSync, /Math\.max\(storedMediaViews/);
  assert.match(metaSync, /isRetryableConnectionError/);
  assert.match(metaSync, /asc\(scheduledPosts\.insightsSyncedAt\)/);
  assert.match(metaSync, /unsyncedUserIds/);
  assert.match(metaSync, /maxMediaPerConnection/);
  assert.match(metaSync, /case when \$\{scheduledPosts.insightsSyncedAt\} is null/);
  assert.match(dashboard, /accountsDone/);
  assert.match(dashboard, /metaSyncBusy/);
  assert.match(dashboard, /syncMeta\(\{ silent: true \}\)/);
  assert.match(metaSync, /skipAccountInsights/);
  assert.match(metaApi, /profileViewsAvailable/);
  assert.match(accountsRoute, /syncSummary/);
  assert.match(reportsRoute, /insightsCoverage/);
  assert.match(metaSync, /maxConnections/);
  assert.match(metaSync, /isWorkerBudgetError/);
  assert.match(jobsRoute, /processDuePosts\(ownerUserId, 8\)/);
  assert.match(dashboard, /Sincronizar dados/);
  assert.match(queueRoute, /mediaViews/);
  assert.match(accountsRoute, /\|\| 500/);
  assert.match(schema, /postsTodayDate/);
  assert.match(dashboard, /Sincronizar dados/);
  assert.match(dashboard, /filteredCampaigns/);
  assert.match(dashboard, /Dia específico/);
  assert.match(dashboard, /Desempenho por vídeo/);
  assert.match(dashboard, /filteredMediaPerformance/);
  assert.match(dashboard, /queuePageSize = 80/);
  assert.match(dashboard, /queue-tabs/);
  assert.match(queueRoute, /LIVE_STATUSES/);
  assert.match(queueRoute, /tab === "published"/);
  assert.match(reportsRoute, /groupBy\(scheduledPosts\.accountId\)/);
  assert.match(reportsRoute, /publishedInPeriod/);
  assert.match(styles, /--mint:#ff5a00/);
  assert.doesNotMatch(dashboard, /Stories automáticos/);
});

test("mantém a legenda opcional sem comentários automáticos", async () => {
  const [schema, captions, scheduleRoute, queueEngine, campaignRoute, dashboard, facebookConnect, facebookCallback, metaCallback, metaApi] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/captions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/schedule/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/queue-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/facebook/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/facebook/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta-api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /containerCaptionHash/);
  assert.match(schema, /metaApiVersion/);
  assert.match(captions, /captionFingerprint/);
  assert.doesNotMatch(captions, /captionVariationCapacity/);
  assert.doesNotMatch(captions, /INLINE_VARIATION_PATTERN/);
  assert.match(captions, /selectCaptionText/);
  assert.match(scheduleRoute, /composeCampaignCaption/);
  assert.doesNotMatch(scheduleRoute, /sem a legenda confirmada/);
  assert.match(queueEngine, /repairFutureCaptions/);
  assert.match(queueEngine, /verify_caption/);
  assert.match(queueEngine, /CAPTION_VERIFICATION_ATTEMPTS = 3/);
  assert.doesNotMatch(queueEngine, /caption_circuit_breaker/);
  assert.doesNotMatch(queueEngine, /pauseCampaignAfterCaptionIncident/);
  assert.match(queueEngine, /campaignStillAllowsPublishing/);
  assert.doesNotMatch(queueEngine, /FACEBOOK_CAPTION_CHANNEL_REQUIRED/);
  assert.doesNotMatch(scheduleRoute, /facebook_page_connection_required/);
  assert.match(queueEngine, /cooldownAccountQueue/);
  assert.match(captions, /CAPTION_CONTAINER_PROTOCOL = "caption-v7-legacy-query"/);
  assert.match(queueEngine, /post\.containerCaptionHash === expectedCaptionHash/);
  assert.doesNotMatch(campaignRoute, /sem texto confirmado/);
  assert.match(dashboard, /Legenda · opcional/);
  assert.match(dashboard, /Copiar legenda e abrir post/);
  assert.match(dashboard, /Conexões bloqueadas por segurança/);
  assert.match(dashboard, /não envia comentários automáticos/);
  assert.match(dashboard, /Instagram direto · conexão individual/);
  assert.match(facebookConnect, /facebookAuthorizationUrl/);
  assert.match(facebookCallback, /getFacebookInstagramAccounts/);
  assert.match(facebookCallback, /discovery\.linkedInstagramIds/);
  assert.match(facebookCallback, /instagram_content_publish/);
  assert.match(metaApi, /instagram_business_account/);
  assert.match(metaApi, /candidates\.slice\(index, index \+ 8\)/);
  assert.match(metaApi, /graph\.facebook\.com/);
  assert.match(metaApi, /url\.searchParams\.set\("access_token", input\.accessToken\)/);
  assert.match(metaApi, /const url = new URL\(graphUrl\(`\$\{input\.instagramUserId\}\/media`, input\.apiMode, input\.graphVersionOverride\)\)/);
  assert.match(metaApi, /for \(const \[key, value\] of Object\.entries\(payload\)\) url\.searchParams\.set/);
  assert.doesNotMatch(metaApi, /instagram_business_manage_comments/);
  assert.doesNotMatch(metaApi, /instagram_manage_comments/);
  assert.doesNotMatch(metaApi, /publishMediaComment/);
  assert.doesNotMatch(queueEngine, /caption_fallback_comment/);
  assert.doesNotMatch(queueEngine, /connectionCanManageComments/);
  assert.match(queueEngine, /[Nn]enhum comentário automático foi enviado/);
  assert.match(queueEngine, /a fila continuará normalmente/);
  assert.match(schema, /captionFallbackCommentId/);
  assert.match(metaCallback, /meta_account/);
  assert.doesNotMatch(metaCallback, /delete\(accounts\)/);
  assert.doesNotMatch(dashboard, /processQueueSilently/);
});

test("mantém a mesma legenda direta em todas as publicações", async () => {
  const { composeCampaignCaption, captionsMatch } = await import("../lib/captions.ts");
  const original = "Esta é a legenda exata da campanha.";
  const generated = Array.from({ length: 60 }, (_, index) => composeCampaignCaption(original, "#teste", index, { username: `perfil${index}` }));
  assert.equal(new Set(generated).size, 1);
  assert.equal(generated[0], `${original}\n\n#teste`);
  assert.equal(captionsMatch(generated[0], `${original}\n\n#teste`), true);
  assert.equal(captionsMatch(generated[0], ""), false);
});

test("separa o protocolo de publicação por Página do protocolo direto", async () => {
  const metaApi = await readFile(new URL("../lib/meta-api.ts", import.meta.url), "utf8");
  assert.match(metaApi, /includes\("instagram_content_publish"\) \? "facebook" : "instagram"/);
  assert.match(metaApi, /mode === "facebook" \? "graph\.facebook\.com" : "graph\.instagram\.com"/);
  assert.match(metaApi, /if \(input\.apiMode === "facebook"\)/);
  assert.match(metaApi, /url\.searchParams\.set\("access_token", input\.accessToken\)/);
  assert.match(metaApi, /for \(const \[key, value\] of Object\.entries\(payload\)\) url\.searchParams\.set/);
  assert.match(metaApi, /if \(input\.graphVersionOverride === "v23\.0"\)/);
  assert.match(metaApi, /transport: "multipart"/);
  assert.match(metaApi, /headers: \{ authorization: `Bearer \$\{input\.accessToken\}` \}/);
  assert.match(metaApi, /readMetaPayload/);
  assert.match(metaApi, /error code:/);
});

test("aplica limites conservadores ao agendamento", async () => {
  const [schema, campaignRoute, scheduleRoute, queueEngine, dashboard] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/schedule/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/queue-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /metaApiVersion: text\("meta_api_version"\)/);
  assert.match(campaignRoute, /payload\.metaApiVersion === "v23\.0"/);
  assert.match(scheduleRoute, /accountIds.*slice\(0, 200\)/);
  assert.match(scheduleRoute, /Math\.max\(Number\(payload\.intervalMinutes\) \|\| 60, 5\)/);
  assert.match(scheduleRoute, /Math\.min\(Math\.max\(Number\(payload\.repeatCount\) \|\| 1, 1\), 10\)/);
  assert.doesNotMatch(queueEngine, /caption_fallback_comment/);
  assert.match(dashboard, /Intervalo mínimo de 5 minutos/);
  assert.match(dashboard, /Capas dos Reels/);
  assert.match(dashboard, /coverMediaIds/);
  assert.match(dashboard, /Selecionar todas/);
});

test("envia Stories de imagem e vídeo pelo campo correto da Meta", async () => {
  const [metaApi, queueEngine, mediaStorage, campaignRoute] = await Promise.all([
    readFile(new URL("../lib/meta-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/queue-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/media-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(metaApi, /const isStoryImage = input\.mediaType === "STORIES" && input\.mediaContentType === "image\/jpeg"/);
  assert.match(metaApi, /input\.mediaType === "IMAGE" \|\| isStoryImage\) payload\.image_url/);
  assert.match(metaApi, /else payload\.video_url = input\.mediaUrl/);
  assert.match(queueEngine, /mediaContentType: mediaItem\?\.contentType/);
  assert.match(queueEngine, /Stories de imagem aceitam apenas JPG/);
  assert.doesNotMatch(mediaStorage, /"image\/jpeg", "image\/png", "video\/mp4", "video\/quicktime"/);
  assert.match(campaignRoute, /Stories de imagem aceitam apenas JPG/);
});

test("gera vídeos com copy incorporada sem alterar os arquivos originais", async () => {
  const [dashboard, generator] = await Promise.all([
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/video-generator.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /Copy incorporada ao vídeo/);
  assert.match(dashboard, /Editar uma copy diferente para cada vídeo/);
  assert.match(dashboard, /Processamento local e seguro/);
  assert.match(dashboard, /renderVideoWithCopy/);
  assert.match(generator, /cdn\.jsdelivr\.net\/npm\/@ffmpeg\/core@0\.12\.10/);
  assert.match(generator, /toBlobURL/);
  assert.match(generator, /fps=20,scale=720:1280/);
  assert.match(generator, /libx264/);
  assert.match(generator, /180_000/);
  assert.match(generator, /AbortSignal/);
  assert.match(dashboard, /Parar geração/);
  assert.match(generator, /new File\(\[data\.slice\(\)\.buffer\]/);
  assert.match(dashboard, /Imagem → Reel/);
  assert.match(dashboard, /imagens viram Reels automaticamente/);
  assert.match(dashboard, /renderImageAsReel/);
  assert.match(generator, /export async function renderImageAsReel/);
  assert.match(generator, /zoompan/);
  assert.match(generator, /options\.motion === "static"/);
  assert.match(generator, /force_original_aspect_ratio=decrease,pad=720:1280/);
  assert.match(dashboard, /Estática · imagem inteira/);
  assert.match(generator, /durationSeconds/);
  assert.match(dashboard, /Trilha sonora incorporada/);
  assert.match(dashboard, /MP3, M4A ou WAV/);
  assert.match(dashboard, /renderVideoWithMusic/);
  assert.match(generator, /export async function renderVideoWithMusic/);
  assert.match(generator, /-stream_loop/);
  assert.match(generator, /amix=inputs=2/);
  assert.match(generator, /"-c:v", "copy"/);
  assert.match(generator, /"-b:a", "128k"/);
  assert.match(generator, /"-ar", "48000"/);
});

test("usa modo seguro configurável e preserva rascunhos e histórico", async () => {
  const [quarantine, quarantineRoute, jobsRoute, scheduleRoute, campaignRoute, directConnect, pageConnect, syncRoute, queueItemRoute, uploadRoute, dashboard] = await Promise.all([
    readFile(new URL("../lib/quarantine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/quarantine/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/schedule/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/facebook/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/queue/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/upload/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(quarantine, /NEXOFLOW_PUBLISHING_ENABLED !== "true"/);
  assert.match(quarantine, /status: "cancelled"/);
  assert.match(quarantine, /status: "quarantined"/);
  assert.match(quarantine, /tokenCiphertext: ""/);
  assert.match(quarantine, /healthStatus: "Suspensa"/);
  assert.match(quarantine, /connectionStatus: "Em apelação"/);
  assert.doesNotMatch(quarantine, /delete\(/);
  assert.doesNotMatch(quarantineRoute, /enforceQuarantine/);
  for (const guardedRoute of [jobsRoute, scheduleRoute, pageConnect, syncRoute, queueItemRoute]) {
    assert.match(guardedRoute, /NEXOFLOW_QUARANTINE/);
  }
  assert.match(directConnect, /NEXOFLOW_META_CONNECTIONS_ENABLED/);
  assert.match(quarantineRoute, /connectionEnabled/);
  assert.doesNotMatch(jobsRoute, /enforceQuarantine/);
  assert.doesNotMatch(campaignRoute, /NEXOFLOW_QUARANTINE/);
  assert.doesNotMatch(uploadRoute, /NEXOFLOW_QUARANTINE/);
  assert.match(jobsRoute, /published: 0/);
  assert.match(dashboard, /authenticatedFetch\("\/api\/quarantine", \{ method: "POST" \}\)/);
  assert.match(dashboard, /Conectar conta/);
  assert.match(dashboard, /Histórico preservado para auditoria/);
  assert.match(dashboard, /Novo rascunho/);
});

test("prepara a instalação limpa e protegida na Cloudflare", async () => {
  const [worker, wrangler, auth, packageJson] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /ctx\.access\.getIdentity\(\)/);
  assert.match(worker, /oai-authenticated-user-email/);
  assert.match(worker, /isPublicRuntimePath/);
  assert.match(worker, /if \(NEXOFLOW_QUARANTINE\) \{/);
  assert.match(worker, /interface Env extends Cloudflare\.Env/);
  assert.match(worker, /isPublicRuntimePath\(url\.pathname, request\.method\)/);
  assert.ok(worker.includes('return (method === "GET" || method === "HEAD") && /^\\/api\\/media\\/[^/]+$/.test(pathname);'));
  assert.match(wrangler, /nexoflow-operacao-mk-db/);
  assert.match(wrangler, /"crons": \["\*\/5 \* \* \* \*"\]/);
  assert.match(packageJson, /deploy:cloudflare/);
  assert.match(auth, /\/__nexoflow\/logout/);
  assert.match(worker, /NEXOFLOW_LOGIN_PASSWORD_HASH/);
  assert.match(worker, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(worker, /MAX_LOGIN_FAILURES = 5/);
  assert.match(worker, /login_attempts/);
  assert.match(worker, /passwordNeedsUpgrade/);
  assert.match(worker, /x-content-type-options/);
  assert.match(worker, /isCrossSiteMutation/);
});

test("compartilha uma única operação com logins individuais e funções de equipe", async () => {
  const [schema, auth, teamRoute, dashboard, worker, passwords, reports] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/team/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/passwords.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reports/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /appUsers/);
  assert.match(schema, /app_users_email_uq/);
  assert.match(schema, /workspaceMembers/);
  assert.match(schema, /workspace_members_workspace_email_uq/);
  assert.match(schema, /loginAttempts/);
  assert.match(auth, /requireWorkspaceContext/);
  assert.match(auth, /NEXOFLOW_OWNER_EMAIL/);
  assert.match(auth, /roleRank/);
  assert.match(teamRoute, /requireWorkspaceContext\(request, "owner"\)/);
  assert.match(teamRoute, /hashPassword/);
  assert.match(teamRoute, /status: "active"/);
  assert.match(teamRoute, /change_own_password/);
  assert.match(worker, /SELECT id, email, password_hash, display_name, status, session_version FROM app_users/);
  assert.match(worker, /crypto\.subtle\.verify/);
  assert.match(passwords, /PBKDF2/);
  assert.match(passwords, /constantTimeEqual/);
  assert.match(passwords, /passwordNeedsUpgrade/);
  assert.match(dashboard, /window\.location\.assign\("\/__nexoflow\/login"\)/);
  assert.match(dashboard, /Criar acesso/);
  assert.match(dashboard, /workspaceKind: inviteKind/);
  assert.match(dashboard, /\/acessos/);
  assert.match(dashboard, /Central de contas/);
  assert.match(dashboard, /Toda a sua operação, finalmente organizada/);
  assert.match(dashboard, /purgeDeadQueue/);
  assert.match(dashboard, /clearVaultPassword/);
  assert.match(dashboard, /createVaultAccount/);
  assert.match(dashboard, /createVaultAccountList/);
  assert.match(dashboard, /Nova conta/);
  assert.match(dashboard, /Cadastrar lista/);
  assert.match(dashboard, /vault-row-toggle/);
  assert.match(dashboard, /vault-group-head/);
  assert.match(dashboard, /Inventário central/);
  assert.match(dashboard, /Pendências/);
  assert.match(dashboard, /\/api\/accounts\?limit=500/);
  assert.match(dashboard, /Independente · painel vazio/);
  assert.match(teamRoute, /workspaceKind === "independent"/);
  assert.match(auth, /canSeeRanking/);
  assert.match(teamRoute, /canSeeRanking/);
  assert.match(reports, /canSeeRanking/);
  assert.match(reports, /!viewerIsAdmin && isPlatformAdminEmail\(email\)/);
  assert.match(dashboard, /current === "otp"/);
  assert.match(dashboard, /lite=1/);
  assert.match(queueRoute, /LIVE_STATUSES/);
  assert.match(schema, /loginPasswordCiphertext/);
  assert.match(secretRoute, /accounts.secret_reveal/);
  assert.match(secretRoute, /decryptToken/);
  const accountsRoute = await readFile(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8");
  assert.match(accountsRoute, /export async function POST/);
  assert.match(accountsRoute, /source: "manual"/);
  assert.match(accountsRoute, /payload.usernames/);
  assert.match(accountsRoute, /accounts.create_bulk/);
  assert.match(accountsRoute, /cadastrada no cofre/);
  assert.match(dashboard, /senha temporária/);
  assert.match(dashboard, /\/__nexoflow\/logout/);
  assert.match(dashboard, /Somente leitura/);
});

test("fila de conexão esconde o painel da Meta do usuário e libera o convite só no admin", async () => {
  const [schema, route, queueLib, dashboard, component, auth] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/connect-queue/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/connection-queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ConnectQueue.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /connectionRequests/);
  assert.match(route, /requirePlatformAdmin/);
  assert.match(route, /invite_user/);
  assert.match(route, /canDirectMetaConnect/);
  assert.match(auth, /canDirectMetaConnect/);
  assert.match(queueLib, /accounts\/manage_access/);
  assert.match(dashboard, /ConnectQueue/);
  assert.match(dashboard, /Peça conexão, aceite o convite/);
  assert.match(dashboard, /from "\.\/ConnectQueue"/);
  assert.match(dashboard, /Q=async t=>\{t\|\|ct\(!0\)/);
  assert.match(dashboard, /setInterval\(\(\)=>\{Q\(!0\)\},9e4\)/);
  assert.match(dashboard, /__nexoflowHardNav/);
  assert.match(dashboard, /!lt&&\(0,_\.jsx\)\(qe/);
  assert.match(component, /Aguardando liberação/);
  assert.match(component, /Aceitar no Instagram/);
  assert.match(component, /Conectar contas/);
  assert.match(component, /Pedir conexão/);
  assert.match(component, /exemplo\.user01/);
  assert.match(component, /canDirectConnect/);
  assert.match(component, /Conectar direto/);
  assert.match(component, /Como conectar\?/);
  assert.match(component, /Colocar os @/);
  assert.match(component, /Instagram já aberto neste navegador/);
  assert.match(component, /Continuar no Instagram/);
  assert.match(component, /window\.location\.replace/);
  assert.match(component, /action: "cancel"/);
  assert.match(component, /Remover/);
  assert.doesNotMatch(component, /href=\{`\/api\/meta\/connect/);
  assert.doesNotMatch(dashboard, /href:`\/api\/meta\/connect/);
  assert.doesNotMatch(component, /maykikelvin09/);
  assert.doesNotMatch(component, /Funções do app/);
});

test("oferece mini ferramenta de Gmail OTP sem guardar a chave no banco", async () => {
  const [dashboard, otpRoute, inboxLib, billing, walletRoute, pixRoute, styles] = await Promise.all([
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/otp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/otp-inbox.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/otp-billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/otp/wallet/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/otp/pix/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(inboxLib, /accountUserId/);
  assert.match(otpRoute, /upsertInboxOrder/);
  assert.match(otpRoute, /getOwnedInboxOrder/);
  assert.match(dashboard, /Este mesmo e-mail recebe os próximos códigos/);
  assert.match(dashboard, /Pedir e-mail/);
  assert.match(dashboard, /Na hora/);
  assert.match(dashboard, /Gmails anteriores/);
  assert.match(dashboard, /Usar de novo/);
  assert.match(dashboard, /otp-history-code/);
  assert.match(dashboard, /je\(`codes`\)/);
  assert.match(dashboard, /anteriores/);
  assert.match(dashboard, /entre na resolv/i);
  assert.match(dashboard, /Painel restrito/);
  assert.doesNotMatch(dashboard, /sk_live_[A-Za-z0-9]/);
  assert.doesNotMatch(dashboard, /lucasbgn\.affiliate/);
  assert.doesNotMatch(dashboard, /APP_USR/);
  assert.doesNotMatch(dashboard, /x-instacaster-key/);
  assert.doesNotMatch(dashboard, /resolvflow_otp_key/);
  assert.match(otpRoute, /requireWorkspaceContext\(request, "editor"\)/);
  assert.match(otpRoute, /https:\/\/instacaster\.top/);
  assert.match(otpRoute, /X-API-Key/);
  assert.match(otpRoute, /isPlatformAdminEmail/);
  assert.match(otpRoute, /workspaceUsesOtpSupplierBalance/);
  assert.match(otpRoute, /action === "codes"/);
  assert.match(otpRoute, /listInbox\(ctx.accountUserId\)/);
  assert.match(dashboard, /Tipo de Gmail da API/);
  assert.match(dashboard, /Depósito mínimo PIX/);
  assert.match(dashboard, /Chave da sua API/);
  assert.match(billing, /isOtpSelfSupplyEmail/);
  assert.doesNotMatch(dashboard, /maykikelvin09/);
  assert.match(otpRoute, /MAX_OTP_BATCH = 13/);
  assert.match(otpRoute, /quantity/);
  assert.match(dashboard, /Quantidade/);
  assert.match(otpRoute, /ig_gmail_otp/);
  assert.match(otpRoute, /!admin && product !== "ig_gmail_otp"/);
  assert.doesNotMatch(billing, /bp_live_/);
  assert.doesNotMatch(dashboard, /bp_live_/);
  assert.doesNotMatch(otpRoute, /localStorage/);
  assert.match(billing, /formatBrl/);
  assert.match(billing, /createPixCharge/);
  assert.match(billing, /DEFAULT_OTP_MIN_DEPOSIT_CENTS/);
  assert.match(walletRoute, /save_key/);
  assert.match(walletRoute, /isOtpSelfSupplyEmail/);
  assert.match(billing, /bravopay.club/);
  assert.match(billing, /amount_cents/);
  assert.match(billing, /settleBravoPayNotification/);
  assert.match(styles, /\.otp-page/);
  assert.match(styles, /\.otp-email/);
  assert.match(styles, /\.otp-priority/);
  assert.match(dashboard, /otp-pix-qr/);
  assert.match(dashboard, /Aponte a câmera do celular/);
  assert.match(inboxLib, /ownedMemo/);
  assert.match(billing, /settingsMemo/);
  assert.match(dashboard, /Ranking de hoje/);
});
