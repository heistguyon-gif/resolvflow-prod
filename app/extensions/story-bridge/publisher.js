// Adapted from Lucas's existing resolvflow stories extension; see PROVENANCE.md.
/* global chrome */
const IG_APP_ID = "936619743392459";
const IG_ASBD_ID = "359341";

export async function publishStory(payload) {
  if (!payload?.imageBase64) throw new Error("Escolha uma imagem.");
  const link = payload.url === "" ? "" : normalizeUrl(payload.url);
  if (payload.url !== "" && !link) throw new Error("Informe um link válido.");
  if (link && payload.rotation !== undefined && (!Number.isInteger(payload.rotation) || payload.rotation < -180 || payload.rotation > 180)) throw new Error("Inclinação inválida.");
  if (payload.createHighlight !== undefined && typeof payload.createHighlight !== "boolean") throw new Error("Opção de destaque inválida.");
  const createHighlight = payload.createHighlight !== false;
  // Validate rotated geometry before upload, not after the first side effect.
  const sticker = link ? linkSticker(payload, link) : null;

  if (createHighlight && (!payload.highlightTransport?.assertReady || !payload.highlightTransport?.createHighlight)) throw new Error("Native PAGE transport required before Story.");
  const [csrfCookie, userCookie, , sessionCookie] = await Promise.all([
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "csrftoken" }),
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "ds_user_id" }),
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "ig_did" }),
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "sessionid" })
  ]);
  if (!csrfCookie?.value || !sessionCookie?.value) {
    throw new Error("Sessão não encontrada. Atualize o Instagram e entre novamente.");
  }

  if (!userCookie?.value || userCookie.value !== payload.expectedInstagramUserId) {
    const error = new Error("A conta do Instagram mudou depois da ordem.");
    error.code = "session_changed";
    throw error;
  }
  await payload.onStage?.("uploading");
  // Validate the context's source session after the durable checkpoint and
  // before the first Instagram effect. The validator is an in-memory port.
  await payload.web?.assertSession?.({ userId: userCookie.value, sessionId: sessionCookie.value, csrf: csrfCookie.value });
  if (createHighlight) await payload.highlightTransport.assertReady();
  const bytes = base64ToBytes(payload.imageBase64);
  const uploadId = String(Date.now());
  const uploadName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000) + 1000000000}`;
  const uploadResponse = await instagramFetch(`https://i.instagram.com/rupload_igphoto/${uploadName}`, {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "*/*",
      offset: "0",
      "content-type": "application/octet-stream",
      "x-entity-type": "image/jpeg",
      "x-entity-name": uploadName,
      "x-entity-length": String(bytes.byteLength),
      "x-ig-app-id": IG_APP_ID,
      "x-instagram-rupload-params": JSON.stringify({
        retry_context: "{\"num_step_auto_retry\":0,\"num_reupload\":0,\"num_step_manual_retry\":0}",
        media_type: "1",
        xsharing_user_ids: "[]",
        upload_id: uploadId,
        image_compression: JSON.stringify({ lib_name: "moz", lib_version: "3.1.m", quality: "80" }),
        upload_media_width: 1080,
        upload_media_height: 1920
      })
    },
    body: bytes
  });
  const uploaded = await requireSuccess(uploadResponse, "envio da imagem");
  const confirmedUploadId = String(uploaded.upload_id || uploadId);

  const web = payload.web || {};
  const headers = webHeaders(csrfCookie.value, web);
  await payload.onStage?.("publishing");
  // The original compatibility fallback repeated the publication POST after a refusal.
  // A bridge order attempts the effect once; a response error must reach its result.
  const result = await configureStory(confirmedUploadId, sticker, headers, true);

  const mediaId = storyMediaId(result, userCookie?.value || "");
  if (mediaId) await payload.onStoryPublished?.(mediaId);
  let highlight = null;
  let highlightError = null;
  let highlightDiagnostic = null;
  if (createHighlight) {
    if (!mediaId) {
      highlightDiagnostic = { version: 1, stage: "highlight", kind: "missing_story_id" };
      highlightError = "Story sem ID confirmado para criar o Destaque.";
    } else {
      await payload.onStage?.("highlighting");
      try {
        await payload.web?.assertSession?.({ userId: userCookie.value, sessionId: sessionCookie.value, csrf: csrfCookie.value });
        const receipt = await payload.highlightTransport.createHighlight({ storyId: mediaId, title: String(payload.highlightTitle || "Destaque").trim().slice(0, 30) || "Destaque" });
        if (receipt?.status !== "confirmed" || receipt.ownerMatches !== true || receipt.storyMatches !== true || receipt.titleMatches !== true || !/^(?:highlight:)?\d+$/.test(receipt.reelId || "")) {
          const kind = receipt?.errorEnum === "html_response" ? "html_response" : receipt?.errorEnum === "invalid_json" ? "invalid_json" : receipt?.httpStatus >= 400 ? "http_error" : "network";
          throw Object.assign(new Error("Native highlight unconfirmed"), { responseKind: kind, status: receipt?.httpStatus });
        }
        highlight = { reel: { id: receipt.reelId } };
        const highlightId = highlight?.reel?.id ?? highlight?.id ?? highlight?.reel?.pk;
        if (!/^(?:highlight:)?\d+$/.test(typeof highlightId === "string" ? highlightId : Number.isSafeInteger(highlightId) ? String(highlightId) : "")) {
          highlightError = "Destaque sem confirmação de ID.";
          highlightDiagnostic = { version: 1, stage: "highlight", kind: "missing_highlight_id" };
        }
      } catch (error) {
        highlightError = "Destaque sem confirmação. Não repita a publicação do Story.";
        const kind = error?.responseKind || (["TimeoutError", "AbortError"].includes(error?.name) ? "timeout" : "network");
        highlightDiagnostic = { version: 1, stage: "highlight", kind, ...(Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? { httpStatus: error.status } : {}) };
      }
    }
  }
  return { mediaId, createHighlight, highlight, highlightError, ...(highlightDiagnostic ? { highlightDiagnostic } : {}) };
}

function linkSticker(payload, link) {
  const rotated = (payload.rotation ?? 0) !== 0;
  if (rotated && [payload.width, payload.height].some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1)) throw new Error("Geometria do adesivo inválida.");
  return {
    x: clamp(payload.x, 0.05, 0.95),
    y: clamp(payload.y, 0.05, 0.95),
    z: 0,
    // The renderer may produce height < .03 at 70% or after fitting long text.
    // Preserve its actual rectangle when tilted; keep the legacy zero contract.
    width: rotated ? payload.width : clamp(payload.width, 0.1, 0.9),
    height: rotated ? payload.height : clamp(payload.height, 0.03, 0.3),
    rotation: payload.rotation ?? 0,
    type: "story_link",
    link_type: "web",
    url: link,
    is_sticker: true,
    selected_index: 0,
    tap_state: 0,
    tap_state_str_id: "link_sticker_default"
  };
}

async function configureStory(uploadId, sticker, headers, modern) {
  const now = Math.floor(Date.now() / 1000);
  const fields = modern
    ? {
      upload_id: uploadId,
      source_type: "4",
      configure_mode: "1",
      story_media_creation_date: String(now - 5),
      client_shared_at: String(now - 3),
      client_timestamp: String(now),
      timezone_offset: String(-new Date().getTimezoneOffset() * 60),
      original_media_type: "1",
      capture_type: "normal",
      media_folder: "Camera",
      composition_id: crypto.randomUUID(),
      ...(sticker ? { story_sticker_ids: "link_sticker_default",
      story_link_stickers: JSON.stringify([sticker]),
      tap_models: JSON.stringify([sticker]) } : {})
    }
    : {
      upload_id: uploadId,
      ...(sticker ? { story_link_stickers: JSON.stringify([{
        x: sticker.x,
        y: sticker.y,
        width: sticker.width,
        height: sticker.height,
        rotation: sticker.rotation,
        link_type: "web",
        url: sticker.url
      }]) } : {})
    };
  const response = await instagramFetch("https://www.instagram.com/api/v1/media/configure_to_story/", {
    method: "POST",
    credentials: "include",
    headers,
    body: new URLSearchParams(fields).toString()
  });
  return requireSuccess(response, "publicação do Story");
}

function webHeaders(csrf, web) {
  const headers = {
    accept: "*/*",
    "content-type": "application/x-www-form-urlencoded",
    "x-csrftoken": csrf,
    "x-ig-app-id": IG_APP_ID,
    "x-asbd-id": IG_ASBD_ID,
    "x-ig-www-claim": web.claim || "0",
    "x-requested-with": "XMLHttpRequest"
  };
  if (web.ajax) headers["x-instagram-ajax"] = String(web.ajax);
  return headers;
}

function storyMediaId(result, userId) {
  const media = result?.media || {};
  if (typeof media.id === "string" && media.id.includes("_")) return media.id;
  const pk = media.pk || (typeof media.id === "string" || typeof media.id === "number" ? media.id : "");
  if (!pk) return null;
  return userId ? `${pk}_${userId}` : String(pk);
}

async function requireSuccess(response, stage, strictHighlight = false) {
  const text = await response.text();
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/&bull;/g, "•").replace(/\s+/g, " ").trim();
    const error = new Error(`${stage}: ${title || "resposta HTML"} (HTTP ${response.status})`);
    error.status = response.status;
    error.responseKind = "html_response";
    throw error;
  }
  let data = {};
  try { data = JSON.parse(text); } catch {
    if (strictHighlight) throw Object.assign(new Error("Resposta não JSON do Destaque."), { status: response.status, responseKind: "invalid_json" });
    data = { message: text.slice(0, 240) };
  }
  if (strictHighlight && (!data || typeof data !== "object" || Array.isArray(data))) throw Object.assign(new Error("Resposta inválida do Destaque."), { status: response.status, responseKind: "invalid_json" });
  if (!response.ok || (data.status && data.status !== "ok")) {
    const detail = data.message || data.error_type || data.feedback_message || `HTTP ${response.status}`;
    const error = new Error(`${stage}: ${detail}`);
    error.status = response.status;
    error.responseKind = response.ok ? "remote_rejection" : "http_error";
    throw error;
  }
  return data;
}

function normalizeUrl(value) {
  try {
    const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function clamp(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : 0.5));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retain the existing legacy error formatter unchanged.
function explainError(error) {
  if (error?.status === 401 || error?.status === 403) return "O Instagram recusou a sessão. Atualize a página e entre novamente.";
  return error?.message || "Não foi possível publicar o Story.";
}

// Story transport is unchanged. Highlight effects exclusively use the prepared PAGE port.
async function instagramFetch(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
}

export async function readInstagramSession() {
  const [user, csrf, session] = await Promise.all([
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "ds_user_id" }),
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "csrftoken" }),
    chrome.cookies.get({ url: "https://www.instagram.com/", name: "sessionid" }),
  ]);
  const id = /^\d{1,30}$/.test(user?.value || "") ? user.value : "";
  return { id, available: Boolean(id && csrf?.value && session?.value) };
}

