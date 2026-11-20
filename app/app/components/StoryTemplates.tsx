"use client";

import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import styles from "./StoryTemplates.module.css";
import { ProfileSetup } from "./ProfileSetup";
import { bindIdentityClock, confirmedInstagramUsername } from "./storyBrowserIdentity";
import { StoryInviteCapture } from "./StoryInviteCapture";
const StoryHighlightManager = lazy(() => import("./StoryHighlightManager").then(module => ({ default: module.StoryHighlightManager })));

type StickerStyle = "blue" | "dark" | "gradient" | "orange" | "mint" | "violet" | "custom";
type Placement = { style: StickerStyle; size: number; x: number; y: number; rotation: number; background?: string; foreground?: string };
type Template = { id: string; name: string; linkUrl: string; linkTitle: string; createHighlight?: boolean; highlightName: string; stickerStyle?: StickerStyle; stickerSize?: number; stickerX?: number; stickerY?: number; stickerRotation?: number; stickerBackground?: string; stickerForeground?: string; imageUrl: string; createdAt: string };
type Browser = { id: string; sessionId: string; label: string; instagramUserId: string | null; instagramUsername?: string | null; instagramUsernameSeenAt?: string | null; available: boolean; lastSeenAt: string; extensionSource?: "principal"; capabilities?: { storyOptions?: number; stickerRotation?: number } | null };
type Job = { id: string; browserId: string; label: string; status: string; message: string; storyId?: string; highlightId?: string };
type Dispatch = { id: string; templateName: string; createHighlight?: boolean; createdAt: string; jobs: Job[] };
type Snapshot = { templates: Template[]; browsers: Browser[]; dispatches: Dispatch[]; pollAfterMs: number; extensionConfigured?: boolean; serverTime?: number };
type Target = { browserId: string; sessionId: string; instagramUserId: string };
type Attempt = { templateId: string; requestId: string; targets: Target[] };
const empty: Snapshot = { templates: [], browsers: [], dispatches: [], pollAfterMs: 5000 };
const statusLabels: Record<string, string> = { queued: "Aguardando navegador", claimed: "Em execução", published: "Story e destaque publicados", partial: "Parcial · story publicado", uncertain: "Incerto · verificar no Instagram", expired: "Expirado · não será enviado", failed: "Falhou" };
const messageLabels: Record<string, string> = {
  queued: "Aguardando o próximo sinal do navegador aberto; o comando expira após 60 segundos.",
  claimed: "O navegador recebeu o comando e está preparando a publicação.",
  queue_expired: "O navegador não recebeu o comando no prazo. Não será enviado ao reabrir o perfil.",
  claim_timeout: "O navegador não confirmou o resultado em até 120 segundos. Confira o perfil; o comando não será reenviado.",
  session_changed: "A sessão mudou ou foi encerrada. O comando antigo não será reenviado; confira qualquer execução já iniciada.",
  published: "Story e destaque confirmados.",
  story_published: "Story confirmado. Criação de destaque não solicitada.",
  extension_update_required: "O comando não foi executado porque a extensão não suporta estas opções. Atualize a extensão antes de uma nova solicitação.",
  highlight_failed: "O story foi confirmado, mas o destaque falhou.",
  highlight_unconfirmed: "O story foi confirmado, mas não foi possível confirmar o destaque. Confira o perfil.",
  story_unconfirmed: "Não foi possível confirmar o story. Confira o perfil antes de publicar novamente.",
  interrupted: "A execução foi interrompida. Confira o perfil; não haverá reenvio automático.",
  publish_failed: "Não foi possível publicar.",
  session_unavailable: "A sessão não está mais disponível. Abra o perfil com o Instagram conectado para uma nova publicação.",
  image_failed: "Não foi possível preparar a imagem.",
  execution_uncertain: "Não há confirmação da execução. Confira o perfil antes de publicar novamente.",
};
const errorLabels: Record<string, string> = {
  no_browsers: "Nenhum navegador com sessão Instagram está pronto. Abra os perfis e aguarde o próximo sinal.",
  selection_required: "Selecione pelo menos um navegador para publicar.",
  selected_browsers_unavailable: "Um navegador selecionado ficou indisponível ou mudou de sessão/conta. Confira a lista e selecione os destinatários novamente.",
  extension_update_required: "Atualize a extensão dos navegadores selecionados para usar estas opções de Story e rotação do link.",
  state_limit: "A ponte atingiu o limite de armazenamento. Peça suporte para preservar e ampliar o histórico.",
  busy: "A ponte está ocupada. Aguarde antes de tentar novamente.",
  unavailable: "O armazenamento da ponte está indisponível. Tente novamente mais tarde.",
  image_size: "A imagem deve ter até 10 MB.", image_type: "Envie uma imagem JPEG ou PNG.",
  invalid_input: "Revise os campos obrigatórios e seus limites antes de enviar.",
  idempotency_conflict: "Esta solicitação já pertence a outro template ou seleção de navegadores. Confira os resultados antes de continuar.",
};

class BridgeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isTemplate(value: unknown): value is Template {
  return isRecord(value) && (value.createHighlight === undefined || typeof value.createHighlight === "boolean") && (value.stickerRotation === undefined || validRotation(value.stickerRotation)) && ["id", "name", "linkUrl", "linkTitle", "highlightName", "imageUrl", "createdAt"].every(key => typeof value[key] === "string");
}
function isDispatch(value: unknown): value is Dispatch {
  return isRecord(value) && (value.createHighlight === undefined || typeof value.createHighlight === "boolean") && typeof value.id === "string" && typeof value.templateName === "string" && typeof value.createdAt === "string" && Array.isArray(value.jobs) && value.jobs.every(job => isRecord(job) && ["id", "browserId", "label", "status", "message"].every(key => typeof job[key] === "string"));
}
const createsHighlight = (item: { createHighlight?: boolean }) => item.createHighlight !== false;
const hasLink = (item: { linkUrl: string }) => !!item.linkUrl.trim();
function validRotation(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= -180 && value <= 180; }
function rotationOf(template?: Partial<Template>) { return validRotation(template?.stickerRotation) ? template.stickerRotation : 0; }
function wrapRotation(value: number) {
  const rounded = Math.round(value);
  const wrapped = ((rounded + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && rounded > 0 ? 180 : wrapped;
}
function supportsTemplate(browser: Browser, template?: Template) {
  if (!template) return true;
  const link = hasLink(template);
  if (link && template.stickerRotation !== undefined && !validRotation(template.stickerRotation)) return false;
  return ((createsHighlight(template) && link) || browser.capabilities?.storyOptions === 1)
    && (!link || rotationOf(template) === 0 || browser.capabilities?.stickerRotation === 1);
}
function targetOf(browser: Browser): Target | null {
  return browser.available === true && typeof browser.id === "string" && !!browser.id && typeof browser.sessionId === "string" && !!browser.sessionId && typeof browser.instagramUserId === "string" && /^\d{1,30}$/.test(browser.instagramUserId)
    ? { browserId: browser.id, sessionId: browser.sessionId, instagramUserId: browser.instagramUserId } : null;
}
function matchesTarget(browser: Browser, target: Target) {
  return browser.id === target.browserId && browser.sessionId === target.sessionId && browser.instagramUserId === target.instagramUserId;
}
async function check(response: Response, owner = false) {
  if (response.ok) return response;
  if (response.status === 403) throw new BridgeError(owner ? "Somente o proprietário pode baixar e renovar a extensão do workspace." : "Acesso somente leitura. É necessária permissão de editor para esta ação.", 403);
  if (response.status === 401) throw new BridgeError("Sua sessão expirou. Entre novamente para continuar.", 401);
  const body: unknown = await response.json().catch(() => null);
  const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
  const detail = isRecord(body) && typeof body.error === "string" ? body.error : "A ponte não respondeu. Tente novamente.";
  throw new BridgeError(errorLabels[code] || detail, response.status);
}

const stickerStyles: StickerStyle[] = ["blue", "dark", "gradient", "orange", "mint", "violet", "custom"];
const stickerStyleLabels: Record<StickerStyle, string> = { blue: "Azul", dark: "Preto", gradient: "Colorido", orange: "Laranja", mint: "Menta", violet: "Violeta", custom: "Personalizado" };
const palettes = { blue: { background: "#ffffff", foreground: "#386FA0" }, dark: { background: "#151515", foreground: "#ffffff" }, gradient: { background: "#D62976", foreground: "#ffffff" }, orange: { background: "#FF5A00", foreground: "#211006" }, mint: { background: "#34F5AA", foreground: "#10251B" }, violet: { background: "#7C3AED", foreground: "#FFFFFF" } };
const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
function paletteOf(placement: Placement) {
  return placement.style === "custom" ? { background: placement.background || "#FF5A00", foreground: placement.foreground || "#211006" } : palettes[placement.style];
}
function clampAxis(value: number) {
  return Math.round(Math.min(0.95, Math.max(0.05, value)) * 10000) / 10000;
}
function placementOf(template?: Partial<Template>): Placement {
  const validColors = isColor(template?.stickerBackground) && isColor(template?.stickerForeground);
  const style = stickerStyles.includes(template?.stickerStyle as StickerStyle) && (template?.stickerStyle !== "custom" || validColors) ? template?.stickerStyle as StickerStyle : "blue";
  const size = Number.isInteger(template?.stickerSize) && (template?.stickerSize as number) >= 70 && (template?.stickerSize as number) <= 320 ? template?.stickerSize as number : 100;
  const axis = (value: number | undefined, fallback: number) => typeof value === "number" && value >= 0.05 && value <= 0.95 ? value : fallback;
  return { style, size, x: axis(template?.stickerX, 0.5), y: axis(template?.stickerY, 0.75), rotation: rotationOf(template), ...(style === "custom" ? { background: template?.stickerBackground, foreground: template?.stickerForeground } : {}) };
}
function PositionInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const percent = Math.round(value * 10000) / 100;
  return <label htmlFor={id}>{label}<input id={id} type="number" min={5} max={95} step={0.01} required value={editing ? text : percent}
    onFocus={() => { setText(String(percent)); setEditing(true); }}
    onChange={event => {
      setText(event.target.value);
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && next >= 5 && next <= 95) onChange(clampAxis(next / 100));
    }}
    onBlur={() => {
      const next = text.trim() ? Number(text) : percent;
      onChange(clampAxis(Number.isFinite(next) ? next / 100 : value));
      setEditing(false);
    }}
  /></label>;
}
function Preview({ image, title, name, placement, showLink, onMove, onRotate }: { image?: string; title: string; name: string; placement: Placement; showLink: boolean; onMove?: (x: number, y: number) => void; onRotate?: (angle: number) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const movable = useRef<HTMLButtonElement>(null);
  const rotationGesture = useRef<{ pointerId: number; centerX: number; centerY: number; startAngle: number; startRotation: number } | null>(null);
  const rotationEnabled = showLink && !!onRotate;
  const rotationHelpId = useId();
  const gradientId = useId();
  const label = title.trim().toUpperCase() || "SEU LINK";
  const [textWidth, setTextWidth] = useState(0);
  useEffect(() => {
    if (!rotationEnabled) rotationGesture.current = null;
    return () => { rotationGesture.current = null; };
  }, [rotationEnabled]);
  useEffect(() => {
    if (!showLink) return;
    let active = true;
    void document.fonts.ready.then(() => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context || !active) return;
      context.font = "400 34px 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
      setTextWidth(context.measureText(label).width);
    });
    return () => { active = false; };
  }, [label, showLink]);
  // Match render.js / sticker-metrics.js in the 1080px canvas coordinate system.
  const scale = Math.min(placement.size / 100, 842 / Math.max(160, textWidth + 124));
  const width = Math.min(842, Math.max(160 * scale, (textWidth + 124) * scale));
  const height = 76 * scale;
  const palette = paletteOf(placement);
  const stickerStyle = { "--sx": String(placement.x), "--sy": String(placement.y), "--rotation": `${placement.rotation}deg`, color: palette.foreground, width: `${width / 10.8}cqw`, height: `${height / 10.8}cqw` } as CSSProperties;
  const sticker = <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    <defs><linearGradient id={gradientId}>{["#FEDA75", "#FA7E1E", "#D62976", "#962FBF", "#4F5BD5"].map((color, index) => <stop key={color} offset={`${index * 25}%`} stopColor={color} />)}</linearGradient></defs>
    <rect width={width} height={height} rx={20 * scale} fill={placement.style === "gradient" ? `url(#${gradientId})` : palette.background} />
    <g transform={`translate(${54 * scale} ${height / 2}) scale(${scale})`} fill="none" stroke="currentColor" strokeWidth={5.04} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-17 -3.2 C-23 1.8 -23.2 11 -18 17 C-12 23 -2.2 23 3.4 16 M-7 7.5 L7 -6.8 M-3.2 -16.8 C1.8 -22.8 11.8 -22.8 17 -17.8 C23 -11.8 23 -1.8 17 4.2" />
    </g>
    <text x={93 * scale} y={height / 2 + 1} dominantBaseline="central" fill="currentColor" fontSize={34 * scale} fontFamily="'Arial Narrow', 'Roboto Condensed', Arial, sans-serif" fontWeight={400}>{label}</text>
  </svg>;
  function point(event: { clientX: number; clientY: number }) {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !onMove || rotationGesture.current) return;
    onMove(clampAxis((event.clientX - box.left) / box.width), clampAxis((event.clientY - box.top) / box.height));
  }
  function nudge(event: KeyboardEvent<HTMLButtonElement>) {
    if (!onMove || rotationGesture.current) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const next = { x: placement.x, y: placement.y };
    if (event.key === "ArrowLeft") next.x -= step;
    else if (event.key === "ArrowRight") next.x += step;
    else if (event.key === "ArrowUp") next.y -= step;
    else if (event.key === "ArrowDown") next.y += step;
    else return;
    event.preventDefault();
    onMove(clampAxis(next.x), clampAxis(next.y));
  }
  function beginRotation(event: PointerEvent<HTMLButtonElement>) {
    if (!rotationEnabled || event.button !== 0 || event.isPrimary === false || rotationGesture.current) return;
    const stickerBox = movable.current?.getBoundingClientRect();
    const frameBox = frame.current?.getBoundingClientRect();
    if (!stickerBox || !frameBox || !stickerBox.width || !stickerBox.height) return;
    const cx = stickerBox.left + stickerBox.width / 2, cy = stickerBox.top + stickerBox.height / 2;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || Math.hypot(event.clientX - cx, event.clientY - cy) < 4) return;
    event.preventDefault(); event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
    event.currentTarget.focus({ preventScroll: true });
    rotationGesture.current = { pointerId: event.pointerId, centerX: cx - frameBox.left, centerY: cy - frameBox.top, startAngle: Math.atan2(event.clientY - cy, event.clientX - cx), startRotation: placement.rotation };
  }
  function rotatePointer(event: PointerEvent<HTMLButtonElement>) {
    const gesture = rotationGesture.current;
    if (!rotationEnabled || !onRotate || !gesture || gesture.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = frame.current?.getBoundingClientRect(); if (!box) return;
    const dx = event.clientX - box.left - gesture.centerX, dy = event.clientY - box.top - gesture.centerY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 4) return;
    event.preventDefault(); event.stopPropagation();
    onRotate(wrapRotation(gesture.startRotation + (Math.atan2(dy, dx) - gesture.startAngle) * 180 / Math.PI));
  }
  function endRotation(event: PointerEvent<HTMLButtonElement>) {
    if (rotationGesture.current?.pointerId !== event.pointerId) return;
    rotationGesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function rotateKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!onRotate || rotationGesture.current) return;
    const step = event.shiftKey ? 15 : 1;
    const next = event.key === "Home" ? 0 : ["ArrowLeft", "ArrowDown"].includes(event.key) ? Math.max(-180, placement.rotation - step) : ["ArrowRight", "ArrowUp"].includes(event.key) ? Math.min(180, placement.rotation + step) : null;
    if (next === null) return;
    event.preventDefault(); event.stopPropagation(); onRotate(next);
  }
  return <figure className={styles.previewBlock}>
    <div className={`${styles.preview} ${rotationEnabled ? styles.previewEditing : ""}`} ref={frame}>
      <div className={styles.previewClip}>
      {/* Authenticated and local blob images must retain their original URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image} alt={`Prévia do story: ${name || "novo template"}`} /> : <span>Escolha uma imagem<br />JPEG ou PNG</span>}
      {showLink && (onMove ? <button ref={movable} type="button" className={styles.sticker} data-style={placement.style} style={stickerStyle} aria-label="Posição do botão do link. Arraste ou use as setas." onPointerDown={event => { if (!rotationGesture.current) event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event: PointerEvent<HTMLButtonElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event); }} onKeyDown={nudge}>{sticker}</button> : <span className={styles.sticker} data-style={placement.style} style={stickerStyle} role="img" aria-label={`Botão do link: ${label}. Rotação ${placement.rotation} graus.`}>{sticker}</span>)}
      </div>
      {rotationEnabled && <div className={styles.rotationPivot} style={stickerStyle}><span className={styles.rotationStem} aria-hidden="true" /><button type="button" className={styles.rotationHandle} aria-label="Girar botão do link" aria-describedby={rotationHelpId} onPointerDown={beginRotation} onPointerMove={rotatePointer} onPointerUp={endRotation} onPointerCancel={endRotation} onLostPointerCapture={endRotation} onKeyDown={rotateKeyboard}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" /></svg></button></div>}
    </div>
    <figcaption>{!showLink ? "Prévia do story com recorte central, sem botão de link." : onMove ? "Arraste o botão para mover ou a alça circular para girar. Imagem com recorte central; nas bordas, o botão pode ser cortado." : "Prévia do template salvo, com recorte central. Nas bordas, o botão pode ser cortado."}{rotationEnabled && <span id={rotationHelpId} className={styles.rotationHelp}>Na alça, use as setas para 1°, Shift para 15° ou Home para zerar. O controle abaixo também ajusta o giro.</span>}{showLink && scale < placement.size / 100 - .001 && <span className={styles.widthHint}>O título limita o tamanho para caber na imagem. Encurte-o para ampliar o botão.</span>}</figcaption>
  </figure>;
}

function Results({ dispatches, compact = false }: { dispatches: Dispatch[]; compact?: boolean }) {
  const entries = dispatches.map(dispatch => <article key={dispatch.id} className={styles.dispatch}>
      <h3>{dispatch.templateName}</h3><time dateTime={dispatch.createdAt}>{new Date(dispatch.createdAt).toLocaleString("pt-BR")}</time>
      <ul className={styles.list}>{dispatch.jobs.map(job => {
        const storyOnly = !createsHighlight(dispatch);
        const missingStoryReceipt = storyOnly && job.status === "published" && (!job.storyId || job.message !== "story_published");
        const label = storyOnly && job.status === "published" ? missingStoryReceipt ? "Story · confirmação incompleta" : "Story publicado" : statusLabels[job.status] || job.status;
        return <li key={job.id}>
          <div className={styles.row}><strong>{job.label}</strong><span className={styles.badge} data-status={missingStoryReceipt ? "uncertain" : job.status}>{label}</span></div>
          {missingStoryReceipt ? <p>Confira o perfil: o recibo não confirma o story. Não repita a publicação por este estado.</p> : messageLabels[job.message] && <p>{messageLabels[job.message]}</p>}
          <div className={styles.identifiers}><span>Story: {job.storyId || "não confirmado"}</span><span>Destaque: {storyOnly ? "não solicitado" : job.highlightId || "não confirmado"}</span></div>
        </li>;
      })}</ul>
    </article>);
  const Heading = compact ? "h3" : "h2";
  return <section className={styles.panel} aria-labelledby="results-title" data-story-results={compact || undefined}>
    <span className={styles.kicker}>03 · Acompanhamento</span>
    <Heading id="results-title">Resultados por navegador</Heading>
    <p className={styles.muted}>Parcial confirma apenas o story. Incerto exige conferência no perfil; não há reenvio automático.</p>
    {!dispatches.length && <p>Nenhuma publicação registrada neste workspace.</p>}
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A bounded scroll region needs an explicit keyboard target across browsers. */}
    {compact ? <div className={styles.historyList} role="region" aria-label="Publicações de Stories e destaques" tabIndex={0}>{entries}</div> : entries}
  </section>;
}

export function StoryTemplates({ scopeKey, role, profileSetupEnabled = false, storiesOnly = false, singleExtensionDownload = false, highlightManagementEnabled = false }: { scopeKey: string; role: "owner" | "editor" | "viewer"; profileSetupEnabled?: boolean; storiesOnly?: boolean; singleExtensionDownload?: boolean; highlightManagementEnabled?: boolean }) {
  const [section, setSection] = useState("publish");
  const [highlightAccess, setHighlightAccess] = useState(highlightManagementEnabled);
  const highlightsAllowed = highlightManagementEnabled && highlightAccess;
  const revokeHighlightAccess = useCallback(() => {
    setHighlightAccess(false);
    setSection(current => current === "highlights" ? "publish" : current);
  }, []);
  const [extensionOrigin, setExtensionOrigin] = useState<"workspace" | "principal" | null>(null);
  // The page keys this client boundary by authenticated user and workspace.
  const [data, setData] = useState<Snapshot>(empty);
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [draft, setDraft] = useState({ name: "", includeLink: false, linkUrl: "", linkTitle: "", createHighlight: false, highlightName: "", stickerStyle: "blue" as StickerStyle, stickerSize: 100, stickerX: 0.5, stickerY: 0.75, stickerRotation: 0, stickerBackground: "#FF5A00", stickerForeground: "#211006" });
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [pending, setPending] = useState<"save" | "publish" | "package" | null>(null);
  const [uncertain, setUncertain] = useState<Attempt | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<Attempt | null>(null);
  const [packageWarning, setPackageWarning] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const canEdit = role !== "viewer" && !forbidden;
  const template = data.templates.find(item => item.id === selected);
  const origin = storiesOnly ? "workspace" : extensionOrigin ?? (data.browsers.some(b => !b.extensionSource) ? "workspace" : "principal");
  const poolBrowsers = data.browsers.filter(b => (b.extensionSource || "workspace") === origin);
  const available = poolBrowsers.filter(browser => targetOf(browser) !== null && supportsTemplate(browser, template));
  const orderedBrowsers = [...poolBrowsers].sort((left, right) => Number(targetOf(right) !== null && supportsTemplate(right, template)) - Number(targetOf(left) !== null && supportsTemplate(left, template)));
  const frozenAttempt = uncertain || activeAttempt;
  const shownTargets = frozenAttempt?.targets || targets;
  const selectionDisabled = !canEdit || !fresh || !!pending || !!uncertain;
  const incompatibleTargets = targets.some(target => !available.some(browser => matchesTarget(browser, target)));
  const optionsUpdateRequired = poolBrowsers.some(browser => targetOf(browser) !== null && !supportsTemplate(browser, template));
  const sizeProgress = (draft.stickerSize - 70) / 250 * 100;
  const sizeLabel = `${Math.round(sizeProgress)}%`;

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    if (readController.current && !readController.current.signal.aborted) return;
    const controller = new AbortController();
    readController.current = controller;
    const currentEpoch = ++epoch.current;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await check(await fetch("/api/story-bridge", { signal: controller.signal, cache: "no-store" }));
      const snapshot: Snapshot = await response.json();
      if (!Array.isArray(snapshot.templates) || !Array.isArray(snapshot.browsers) || !Array.isArray(snapshot.dispatches)) throw new Error("Resposta inválida da ponte.");
      if (!mounted.current || currentEpoch !== epoch.current || controller.signal.aborted) return;
      bindIdentityClock(snapshot.browsers, snapshot.serverTime);
      setData(snapshot); setLoaded(true); setFresh(true); setReadError("");
      setTargets(current => current.filter(target => snapshot.browsers.some(browser => targetOf(browser) !== null && matchesTarget(browser, target))));
    } catch (error) {
      if (!mounted.current || currentEpoch !== epoch.current) return;
      setFresh(false);
      setReadError(error instanceof Error && error.name !== "AbortError" ? error.message : "A atualização demorou demais. A lista anterior foi preservada.");
    } finally {
      window.clearTimeout(timeout);
      if (readController.current === controller) readController.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    const visibility = () => {
      ++epoch.current; readController.current?.abort(); setFresh(false);
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      // This is a request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++epoch.current;
      readController.current?.abort(); writeController.current?.abort();
      window.clearTimeout(initial); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh, scopeKey]);

  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  async function write(kind: "save" | "publish" | "package", body?: BodyInit, attempt?: Attempt) {
    if (busy.current || !canEdit) return;
    busy.current = true; setPending(kind); setWriteError(""); setNotice("");
    if (kind === "publish" && attempt) setActiveAttempt(attempt);
    const controller = new AbortController(); writeController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await check(await fetch(`/api/story-bridge/${kind === "save" ? "templates" : kind}`, {
        method: "POST", body, signal: controller.signal,
        ...(kind === "publish" ? { headers: { "Content-Type": "application/json" } } : {}),
      }), kind === "package");
      if (kind === "package") {
        const blob = await response.blob();
        if (!mounted.current || controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = "story-extension-workspace.zip";
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        setPackageWarning(false);
        setNotice("ZIP novo baixado. A credencial anterior foi invalidada: instale este ZIP em todos os perfis do workspace.");
      } else {
        const result: unknown = await response.json();
        if (!mounted.current || controller.signal.aborted) return;
        if (kind === "save") {
          if (!isRecord(result) || !isTemplate(result.template) || !result.template.id) throw new Error("Não foi possível confirmar o template salvo.");
          const saved = result.template;
          setData(previous => ({ ...previous, templates: [saved, ...previous.templates.filter(item => item.id !== saved.id)] }));
          setSelected(saved.id); setNotice("Template salvo e selecionado. Pronto para publicar.");
        } else {
          if (!isRecord(result) || !isDispatch(result.dispatch) || !result.dispatch.id) throw new Error("Não foi possível confirmar a publicação.");
          const dispatch = result.dispatch;
          setUncertain(null);
          setData(previous => ({ ...previous, dispatches: [dispatch, ...previous.dispatches.filter(item => item.id !== dispatch.id)] }));
          setNotice(`Comando registrado somente para os ${attempt?.targets.length || 0} navegadores selecionados. Acompanhe os resultados abaixo.`);
        }
      }
      // A pre-write snapshot must not replace the acknowledged mutation.
      ++epoch.current; readController.current?.abort();
      void refresh();
    } catch (error) {
      if (!mounted.current) return;
      const definitive = error instanceof BridgeError && error.status >= 400 && error.status < 500;
      if (kind === "publish" && attempt) setUncertain(definitive ? null : attempt);
      if (error instanceof BridgeError && error.status === 403 && kind !== "package") setForbidden(true);
      const detail = error instanceof Error && error.name !== "AbortError" ? error.message : "A conexão demorou demais ou foi interrompida.";
      setWriteError(kind === "package" ? `${detail} A credencial pode ter sido rotacionada; um novo download exige outra ação sua e invalida o ZIP anterior.` : detail);
    } finally {
      window.clearTimeout(timeout); busy.current = false;
      if (mounted.current) { setPending(null); if (kind === "publish") setActiveAttempt(null); }
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.createHighlight && draft.highlightName.length > 30) { setWriteError("O nome do destaque excedeu o limite de 30 caracteres."); return; }
    if (draft.includeLink) {
      if (!validRotation(draft.stickerRotation)) { setWriteError("A rotação deve ser um inteiro entre -180° e 180°."); return; }
      if (draft.linkTitle.length > 40) { setWriteError("O título do link excedeu o limite de 40 caracteres."); return; }
      let url: URL;
      try { url = new URL(draft.linkUrl); } catch { setWriteError("Informe uma URL http:// ou https:// válida."); return; }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) { setWriteError("Use um link HTTP ou HTTPS sem credenciais."); return; }
      if (!draft.linkTitle.trim()) { setWriteError("Informe o título do link."); return; }
    }
    if (!draft.name.trim() || (draft.createHighlight && !draft.highlightName.trim())) { setWriteError("Preencha o nome do template e, quando ativado, o nome do destaque."); return; }
    if (!image || !["image/jpeg", "image/png"].includes(image.type) || image.size > 10 * 1024 * 1024 || !image.size) { setWriteError("Escolha uma imagem JPEG ou PNG de até 10 MB."); return; }
    if (draft.includeLink && draft.stickerStyle === "custom" && (!isColor(draft.stickerBackground) || !isColor(draft.stickerForeground))) { setWriteError("Use cores no formato #RRGGBB para fundo e texto."); return; }
    const form = new FormData();
    const fields = {
      name: draft.name, createHighlight: String(draft.createHighlight), stickerRotation: draft.includeLink ? draft.stickerRotation : 0,
      highlightName: draft.createHighlight ? draft.highlightName : "",
      linkUrl: draft.includeLink ? draft.linkUrl : "", linkTitle: draft.includeLink ? draft.linkTitle : "",
      ...(draft.includeLink ? { stickerStyle: draft.stickerStyle, stickerSize: draft.stickerSize, stickerX: draft.stickerX, stickerY: draft.stickerY,
        ...(draft.stickerStyle === "custom" ? { stickerBackground: draft.stickerBackground, stickerForeground: draft.stickerForeground } : {}) } : {}),
    };
    Object.entries(fields).forEach(([key, value]) => form.append(key, typeof value === "string" ? value.trim() : String(value)));
    form.append("image", image);
    void write("save", form);
  }

  function publish(retry = false) {
    if (!canEdit || busy.current) return;
    if (!retry && (!fresh || !targets.length || targets.length > 100 || !template || uncertain || targets.some(target => !available.some(browser => matchesTarget(browser, target))))) return;
    const attempt = retry ? uncertain : { templateId: selected, requestId: crypto.randomUUID(), targets: targets.map(target => ({ ...target })) };
    if (attempt) void write("publish", JSON.stringify(attempt), attempt);
  }

  const extensionSetup = <section className={styles.setup} aria-labelledby="setup-title"><div><h2 id="setup-title">Conectar os navegadores deste workspace</h2><p>Instale a extensão em cada navegador e mantenha o Instagram conectado. No AdsPower, você pode usar as Extensões do time; a API do AdsPower não é necessária.</p><p>Use o pacote do próprio workspace. A atualização do código preserva a configuração existente.</p><p>Gerar uma nova credencial invalida o pacote anterior em todos os perfis que o utilizam, incluindo navegadores vinculados a outras contas.</p></div>
      <button type="button" disabled={role !== "owner" || !!pending} onClick={() => setPackageWarning(true)}>Baixar extensão do workspace</button>
      {role !== "owner" && <p>Somente o proprietário pode baixar e renovar o pacote.</p>}
      {packageWarning && <div className={styles.warning}><p>Ao baixar, o ZIP anterior para de autenticar. Instale o novo ZIP em todos os perfis do workspace. Comandos pendentes podem expirar ou ficar incertos.</p><div className={styles.actions}><button type="button" disabled={!!pending} onClick={() => void write("package")}>{pending === "package" ? "Gerando ZIP…" : "Renovar credencial e baixar ZIP"}</button><button type="button" disabled={!!pending} onClick={() => setPackageWarning(false)}>Cancelar</button></div></div>}
    </section>;
  const storyNotices = <>{!canEdit && <p className={styles.warning}>Modo somente leitura. Peça permissão de editor para salvar templates e publicar.</p>}
    {readError && <div role="alert" className={styles.warning}>{readError} <button type="button" onClick={() => void refresh()}>Atualizar lista</button></div>}
    {writeError && <p role="alert" className={styles.warning}>{writeError}</p>}
    <p role="status" className={styles.notice}>{notice}</p></>;
  const editor = <section className={styles.panel} aria-labelledby="new-title"><span className={styles.kicker}>01 · Edição e prévia</span><h2 id="new-title">Novo template</h2><p className={styles.muted}>Nome e imagem são obrigatórios. Link e criação de destaque são opcionais e independentes.</p>
        <form onSubmit={save}><fieldset disabled={!canEdit || !!pending} className={styles.editorLayout}><legend className={styles.srOnly}>Editar template de story</legend><div className={styles.fields}>
          <label htmlFor="story-name">Nome do template<input id="story-name" name="name" required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label htmlFor="story-image">Imagem<input id="story-image" name="image" type="file" accept="image/jpeg,image/png" required aria-describedby="image-help" onChange={event => { const file = event.target.files?.[0] || null; setImage(file); setImageUrl(file ? URL.createObjectURL(file) : ""); }} /><span id="image-help">JPEG ou PNG · até 10 MB</span></label>
          <label className={styles.optionToggle} htmlFor="story-create-highlight"><input id="story-create-highlight" type="checkbox" role="switch" checked={draft.createHighlight} onChange={event => { const checked = event.currentTarget.checked; setDraft(current => ({ ...current, createHighlight: checked, highlightName: checked ? current.highlightName : "" })); }} /><span>Criar destaque</span><span className={styles.optionState} aria-hidden="true">{draft.createHighlight ? "Ligado" : "Desligado"}</span></label>
          {draft.createHighlight && <label htmlFor="story-highlight">Nome do destaque<input id="story-highlight" name="highlightName" aria-label="Nome do destaque" required aria-invalid={draft.highlightName.length > 30} aria-describedby={draft.highlightName.length > 30 ? "story-highlight-error" : undefined} value={draft.highlightName} onChange={event => setDraft({ ...draft, highlightName: event.target.value })} />{draft.highlightName.length > 30 && <span id="story-highlight-error" className={styles.fieldError}>O nome do destaque excedeu o limite de 30 caracteres.</span>}</label>}
          <label className={styles.optionToggle} htmlFor="story-include-link"><input id="story-include-link" type="checkbox" role="switch" checked={draft.includeLink} onChange={event => { const checked = event.currentTarget.checked; setDraft(current => ({ ...current, includeLink: checked, linkUrl: checked ? current.linkUrl : "", linkTitle: checked ? current.linkTitle : "", stickerRotation: checked ? current.stickerRotation : 0 })); }} /><span>Adicionar link</span><span className={styles.optionState} aria-hidden="true">{draft.includeLink ? "Ligado" : "Desligado"}</span></label>
          {draft.includeLink && <><label htmlFor="story-title">Título do link<input id="story-title" name="linkTitle" aria-label="Título do link" required aria-invalid={draft.linkTitle.length > 40} aria-describedby={draft.linkTitle.length > 40 ? "story-title-error" : undefined} value={draft.linkTitle} onChange={event => setDraft({ ...draft, linkTitle: event.target.value })} />{draft.linkTitle.length > 40 && <span id="story-title-error" className={styles.fieldError}>O título do link excedeu o limite de 40 caracteres.</span>}</label>
          <label htmlFor="story-url">URL do link<input id="story-url" name="linkUrl" type="url" required maxLength={2048} placeholder="https://seusite.com" value={draft.linkUrl} onChange={event => setDraft({ ...draft, linkUrl: event.target.value })} /></label></>}
        </div><div className={styles.customization}>
          <h3>Prévia do story</h3>
          <Preview image={imageUrl} title={draft.linkTitle} name={draft.name} placement={placementOf(draft)} showLink={draft.includeLink} onMove={canEdit && !pending ? (stickerX, stickerY) => setDraft(current => ({ ...current, stickerX, stickerY })) : undefined} onRotate={canEdit && !pending ? stickerRotation => { if (validRotation(stickerRotation)) setDraft(current => current.includeLink ? { ...current, stickerRotation } : current); } : undefined} />
          {draft.includeLink && <><fieldset className={styles.appearance}><legend>Aparência do botão</legend><div className={styles.swatches}>{stickerStyles.map(style => {
            const palette = style === "custom" ? { background: draft.stickerBackground, foreground: draft.stickerForeground } : palettes[style];
            return <label key={style} className={styles.swatch} data-selected={draft.stickerStyle === style}><input type="radio" name="stickerStyle" value={style} checked={draft.stickerStyle === style} onChange={() => setDraft(current => ({ ...current, stickerStyle: style }))} /><span className={styles.swatchSample} data-style={style} style={{ background: style === "gradient" ? undefined : palette.background, color: palette.foreground }} aria-hidden="true">↗</span><span>{stickerStyleLabels[style]}</span></label>;
          })}</div></fieldset>
          {draft.stickerStyle === "custom" && <div className={styles.colorFields}><label htmlFor="story-background">Cor do fundo<input id="story-background" type="color" value={draft.stickerBackground} onChange={event => { if (isColor(event.target.value)) setDraft(current => ({ ...current, stickerBackground: event.target.value.toUpperCase() })); }} /><output htmlFor="story-background">{draft.stickerBackground}</output></label><label htmlFor="story-foreground">Cor do texto<input id="story-foreground" type="color" value={draft.stickerForeground} onChange={event => { if (isColor(event.target.value)) setDraft(current => ({ ...current, stickerForeground: event.target.value.toUpperCase() })); }} /><output htmlFor="story-foreground">{draft.stickerForeground}</output></label></div>}
          <div className={styles.sizeControl}><label htmlFor="story-size">Tamanho do botão <output htmlFor="story-size">{sizeLabel}</output></label><input id="story-size" className={styles.sizeRange} type="range" min={70} max={320} step={1} value={draft.stickerSize} aria-valuetext={sizeLabel} style={{ "--story-progress": `${sizeProgress}%` } as CSSProperties} onChange={event => setDraft(current => ({ ...current, stickerSize: Number(event.target.value) }))} /><div className={styles.rangeLimits} aria-hidden="true"><span>0%</span><span>100%</span></div></div>
          <div className={styles.rotationControl}><label htmlFor="story-rotation">Rotação do link <output htmlFor="story-rotation">{draft.stickerRotation}°</output></label><input id="story-rotation" className={styles.sizeRange} type="range" min={-180} max={180} step={1} value={draft.stickerRotation} aria-valuetext={`${draft.stickerRotation} graus`} aria-describedby="story-rotation-help" style={{ "--story-progress": `${(draft.stickerRotation + 180) / 360 * 100}%` } as CSSProperties} onChange={event => { const value = event.currentTarget.valueAsNumber; if (validRotation(value)) setDraft(current => ({ ...current, stickerRotation: value })); }} /><div className={styles.rangeLimits} aria-hidden="true"><span>−180°</span><span>0°</span><span>180°</span></div><div className={styles.rotationActions}><p id="story-rotation-help">Positivo gira no sentido horário. Use as setas para ajustar de grau em grau.</p><button type="button" onClick={() => setDraft(current => ({ ...current, stickerRotation: 0 }))}>Zerar rotação</button></div></div>
          <div className={styles.positionFields}><PositionInput id="story-x" label="Horizontal (%)" value={draft.stickerX} onChange={stickerX => setDraft(current => ({ ...current, stickerX }))} /><PositionInput id="story-y" label="Vertical (%)" value={draft.stickerY} onChange={stickerY => setDraft(current => ({ ...current, stickerY }))} /></div>
          <div className={styles.presets} aria-label="Atalhos de personalização"><button type="button" onClick={() => setDraft(current => ({ ...current, stickerX: 0.5, stickerY: 0.5 }))}>Centro</button><button type="button" onClick={() => setDraft(current => ({ ...current, stickerX: 0.5, stickerY: 0.75 }))}>Embaixo</button><button type="button" onClick={() => setDraft(current => ({ ...current, stickerSize: 100, stickerX: 0.5, stickerY: 0.75 }))}>Restaurar tamanho e posição</button></div></>}
        </div><button className={styles.primary} type="submit">{pending === "save" ? "Salvando…" : "Salvar template"}</button>
        </fieldset></form>
      </section>;
  const publishedPreview = template ? <Preview image={template.imageUrl} title={template.linkTitle} name={template.name} placement={placementOf(template)} showLink={hasLink(template)} /> : null;
  const storyConfiguration = <div className={styles.columns}>
    <div className={styles.stack}><section className={styles.panel} aria-labelledby="publish-title"><span className={styles.kicker}>02 · Publicação</span><h2 id="publish-title">Publicar story</h2>
        <label className={styles.selectLabel} htmlFor="story-template">Template salvo<select id="story-template" value={selected} disabled={!!pending || !!uncertain} onChange={event => setSelected(event.target.value)}><option value="">{loaded ? "Selecione um template" : "Carregando templates…"}</option>{data.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {loaded && !data.templates.length && <p>{profileSetupEnabled ? "Abra Criar e personalizar template acima para salvar seu primeiro template." : "Salve seu primeiro template ao lado."}</p>}
        {template && <div className={styles.templateDetails}><p>Destaque: <strong>{createsHighlight(template) ? template.highlightName : "não será criado"}</strong></p><p>Link: {hasLink(template) ? <a href={template.linkUrl} target="_blank" rel="noreferrer">{template.linkUrl}</a> : "sem link"}</p>{hasLink(template) && <p>Rotação do link: <strong>{rotationOf(template)}°</strong></p>}</div>}
        {optionsUpdateRequired && <p className={styles.warning} role="status">{template && hasLink(template) && rotationOf(template) !== 0 ? "Este template usa rotação do link. Atualize os navegadores indicados para uma extensão com suporte à rotação e às opções selecionadas." : "Este template precisa de uma extensão compatível com Story sem link ou sem destaque. Atualize os navegadores indicados."} Aguarde o próximo sinal antes de selecioná-los.</p>}
        {incompatibleTargets && !frozenAttempt && <p className={styles.warning} role="status">A seleção contém um navegador que não pode executar este template. Revise a seleção antes de publicar.</p>}
        <h3>{available.length} navegador{available.length === 1 ? " disponível" : "es disponíveis"}</h3>
        {!storiesOnly && data.browsers.some(b => b.extensionSource === "principal") && <fieldset className={styles.extensionChoice} disabled={selectionDisabled}>
          <legend>Extensão para esta publicação</legend>
          <label><input type="radio" name="story-extension-origin" checked={origin === "principal"} onChange={() => { setExtensionOrigin("principal"); setTargets([]); }} />Extensão principal · navegadores vinculados a esta conta</label>
          {data.browsers.some(b => !b.extensionSource) && <label><input type="radio" name="story-extension-origin" checked={origin === "workspace"} onChange={() => { setExtensionOrigin("workspace"); setTargets([]); }} />Extensão desta conta</label>}
          <p>Escolha uma origem por publicação. Os convites podem usar os perfis vinculados de ambas as extensões.</p>
        </fieldset>}
        <fieldset className={styles.browserSelection} disabled={selectionDisabled}><legend>Navegadores para publicar</legend>
          <p className={styles.selectionCount}>{frozenAttempt ? `${shownTargets.length} destinatários preservados · ${available.length} disponíveis agora` : `${targets.length} selecionados de ${available.length} disponíveis`}</p>
          <div className={styles.selectionActions}><button type="button" disabled={!available.length} onClick={() => { if (!selectionDisabled && !busy.current) setTargets(available.slice(0, 100).flatMap(browser => { const target = targetOf(browser); return target ? [target] : []; })); }}>Selecionar todos</button><button type="button" disabled={!targets.length} onClick={() => { if (!selectionDisabled && !busy.current) setTargets([]); }}>Limpar seleção</button></div>
          <ul className={styles.browserList}>{orderedBrowsers.map(browser => {
            const checked = shownTargets.some(target => matchesTarget(browser, target));
            const username = confirmedInstagramUsername(browser);
            const compatible = supportsTemplate(browser, template);
            return <li key={`${browser.id}:${browser.sessionId}:${browser.instagramUserId}`}><label className={styles.browserOption} data-selected={checked}><input type="checkbox" aria-label={`Selecionar ${username ? `@${username}` : browser.label}. Instagram ID ${browser.instagramUserId || "indisponível"}`} disabled={!targetOf(browser) || (!checked && (!compatible || targets.length >= 100))} checked={checked} onChange={() => {
              if (selectionDisabled || busy.current) return;
              const target = targetOf(browser); if (!target || (!checked && !compatible)) return;
              setTargets(current => current.some(item => matchesTarget(browser, item)) ? current.filter(item => !matchesTarget(browser, item)) : current.length < 100 ? [...current, target] : current);
            }} /><span className={styles.browserIdentity}><strong>{username ? `@${username}` : browser.label}</strong>{profileSetupEnabled && <span>{username ? browser.label : "@ não informado pela extensão"}</span>}<span>Instagram ID: {browser.instagramUserId || "indisponível"}</span><span>Último sinal: {new Date(browser.lastSeenAt).toLocaleString("pt-BR")}</span></span><span className={styles.browserStatus}>{!targetOf(browser) ? "Indisponível" : compatible ? "Disponível" : "Atualize a extensão"}</span></label></li>;
          })}</ul>
        </fieldset>
        <p className={styles.publishWarning}>O clique envia <strong>somente aos navegadores selecionados</strong>. Novos perfis disponíveis não são selecionados automaticamente.</p>
        {uncertain && <div className={styles.warning} role="alert"><strong>Recebimento do comando não confirmado</strong><p>Confira os resultados antes de tentar novamente. O botão abaixo reutiliza o mesmo identificador e os mesmos destinatários, sem criar uma nova publicação.</p><p>Destinatários preservados: {uncertain.targets.map(target => `Instagram ID ${target.instagramUserId}`).join(", ")}.</p><button type="button" disabled={!canEdit || !!pending} onClick={() => publish(true)}>Consultar/repetir a mesma solicitação</button></div>}
        <button className={styles.primary} type="button" disabled={selectionDisabled || !template || !targets.length || incompatibleTargets} onClick={() => publish()}>{pending === "publish" ? "Enviando comando…" : `Publicar em ${shownTargets.length} navegador${shownTargets.length === 1 ? "" : "es"}`}</button>
        {publishedPreview && (profileSetupEnabled ? <details className={styles.previewDetails}><summary>Conferir prévia do template</summary>{publishedPreview}</details> : publishedPreview)}
        <p className={styles.muted}>Sinal a cada ~30 s; offline após 75 s. A lista atualiza a cada 5 s com a página visível.</p>
        {loaded && !available.length && <p>Nenhum navegador disponível. Abra os perfis com a extensão instalada e o Instagram conectado.</p>}
        <p className={styles.muted}>Perfis fechados não entram na fila. Reabrir um perfil não reenvia comandos antigos.</p>
      </section></div>
  </div>;

  const sections = [{ id: "publish", label: "Publicar" }, { id: "templates", label: "Templates" },
    ...(highlightsAllowed ? [{ id: "highlights", label: "Gerenciar destaques" }] : []),
    ...(!storiesOnly ? [{ id: "invites", label: "Convites Meta" }] : []), ...(profileSetupEnabled ? [{ id: "profiles", label: "Bio e foto" }] : []),
    { id: "history", label: "Histórico" }, { id: "extension", label: "Extensão" }];
  const renderSections = (profile?: { configuration: ReactNode; results: ReactNode; update: ReactNode }) => <main className={styles.root}>
    <header className={styles.header}><div><div className={styles.eyebrow}>Conteúdo e conexão</div><h1>Stories e destaques</h1><p>Prepare seu conteúdo, escolha os perfis e acompanhe cada publicação.</p></div><span className={styles.badge}>{role === "owner" ? "Proprietário" : role === "editor" ? "Editor" : "Somente leitura"}</span></header>
    <div className={styles.summary}><span><i data-ready={available.length > 0} />{available.length} {available.length === 1 ? "navegador pronto" : "navegadores prontos"}</span><span>{data.templates.length} {data.templates.length === 1 ? "template" : "templates"}</span><button type="button" disabled={!!pending} onClick={() => void refresh()}>Atualizar</button></div>
    <div className={styles.sectionNav} role="tablist" aria-label="Stories e destaques">{sections.map(item => <button type="button" key={item.id} role="tab" aria-selected={section === item.id} aria-controls={`story-section-${item.id}`} id={`story-tab-${item.id}`} tabIndex={section === item.id ? 0 : -1} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const index = sections.findIndex(tab => tab.id === item.id);
      const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
      setSection(sections[next].id); document.getElementById(`story-tab-${sections[next].id}`)?.focus();
    }} onClick={() => setSection(item.id)}>{item.label}</button>)}</div>
    {storyNotices}
    {loaded && fresh && !data.browsers.some(browser => targetOf(browser) !== null) && <div className={styles.warning} role="status">
      <strong>{data.extensionConfigured === false ? "Esta conta ainda não tem uma extensão vinculada." : "Nenhum navegador conectado a esta conta neste momento."}</strong>
      <p>{storiesOnly ? "Use o pacote gerado na sua conta e instale a extensão no seu AdsPower. Abra seus perfis com o Instagram conectado; os navegadores desta conta aparecerão aqui." : data.browsers.some(b => b.extensionSource === "principal") ? "Abra os perfis vinculados pelo proprietário com a extensão principal e o Instagram conectado. Para esses navegadores, mantenha o ZIP principal já instalado." : data.extensionConfigured === false ? "Use a mesma extensão, com o pacote gerado nesta conta. Se usar a extensão principal, o proprietário pode vincular os navegadores a esta conta pelo TOP; trocar de login no painel não altera o vínculo sozinho." : "Abra os perfis com o Instagram conectado e confira se a extensão usa o pacote desta conta. A extensão principal também pode ser usada quando seus navegadores forem vinculados a esta conta pelo TOP."}</p>
      {section !== "extension" && <button type="button" onClick={() => setSection("extension")}>Conferir vínculo da extensão</button>}
    </div>}
    <section role="tabpanel" id="story-section-publish" aria-labelledby="story-tab-publish" hidden={section !== "publish"}>
      <div className={styles.sectionHeading}><div><h2>Publicar story</h2><p>Selecione um template e os navegadores que receberão a publicação.</p></div><button type="button" onClick={() => setSection("templates")}>Criar template</button></div>
      <div className={styles.storyOperation} data-story-configuration>{storyConfiguration}</div>
    </section>
    <section role="tabpanel" id="story-section-templates" aria-labelledby="story-tab-templates" hidden={section !== "templates"}>
      <div className={styles.sectionHeading}><div><h2>Sua biblioteca</h2><p>Templates com imagem, link opcional e criação de destaque independente.</p></div></div>
      <div className={styles.templateGrid}>{data.templates.map(item => <article key={item.id}><button type="button" className={styles.templatePreview} onClick={() => { setSelected(item.id); setSection("publish"); }} aria-label={`Usar template ${item.name}`}><Preview image={item.imageUrl} title={item.linkTitle} name={item.name} placement={placementOf(item)} showLink={hasLink(item)} /></button><div><h3>{item.name}</h3><p>{createsHighlight(item) ? `Destaque · ${item.highlightName}` : "Sem destaque"} · {hasLink(item) ? `Com link · ${rotationOf(item)}°` : "Sem link"}</p><button type="button" onClick={() => { setSelected(item.id); setSection("publish"); }}>Usar template</button></div></article>)}</div>
      <details className={styles.templateEditor} open={!data.templates.length}><summary>Criar e personalizar template<span>Imagem, link opcional e destaque opcional</span></summary>{editor}</details>
    </section>
    {!storiesOnly && <section role="tabpanel" id="story-section-invites" aria-labelledby="story-tab-invites" hidden={section !== "invites"}>
      <div className={styles.sectionHeading}><div><h2>Conectar perfis aos Apps Meta</h2><p>A extensão identifica os @ dos perfis abertos. O bot envia os convites com o Facebook já configurado para a operação.</p></div></div>
      <StoryInviteCapture key={scopeKey} scopeKey={scopeKey} browsers={data.browsers} fresh={fresh} canOperate={canEdit} />
    </section>}
    {highlightsAllowed && <section role="tabpanel" id="story-section-highlights" aria-labelledby="story-tab-highlights" hidden={section !== "highlights"}>
      <Suspense fallback={null}><StoryHighlightManager key={scopeKey} scopeKey={scopeKey} active={section === "highlights"} onAccessRevoked={revokeHighlightAccess} /></Suspense>
    </section>}
    {profile && <section role="tabpanel" id="story-section-profiles" aria-labelledby="story-tab-profiles" hidden={section !== "profiles"}>{profile.configuration}</section>}
    <section role="tabpanel" id="story-section-history" aria-labelledby="story-tab-history" hidden={section !== "history"} data-story-profile-history>
      <div className={styles.sectionHeading}><div><h2>Histórico e resultados</h2><p>Confira o resultado de cada perfil antes de repetir uma publicação sem confirmação.</p></div></div>
      <div className={styles.historyColumns}><Results dispatches={data.dispatches} compact />{profile?.results}</div>
    </section>
    <section role="tabpanel" id="story-section-extension" aria-labelledby="story-tab-extension" hidden={section !== "extension"}>
      {!storiesOnly && data.browsers.some(b => b.extensionSource === "principal") && <p className={styles.warning}>Esta conta usa navegadores vinculados à extensão principal pelo TOP. Para esses perfis, mantenha o pacote principal já instalado; não é necessário gerar outro ZIP. Você também pode usar uma extensão própria desta conta.</p>}
      <div className={styles.sectionHeading}><div><h2>Extensão dos navegadores</h2><p>Instale o pacote do workspace nos perfis que vão receber Stories e destaques.</p></div></div>
      {singleExtensionDownload ? extensionSetup : <><section className={styles.setup}><div><h2>Atualizar uma instalação existente</h2><p>Sobreponha os arquivos de código na mesma pasta, preserve bridge-config.json e recarregue a extensão. Esta atualização não renova a credencial.</p></div><a href="/api/story-bridge/package" download>Baixar atualização da extensão</a></section>
      <details className={styles.extensionAccess}><summary>Primeira instalação ou renovar credencial</summary>{extensionSetup}</details>
      {profile?.update && <details className={styles.extensionAccess}><summary>Atualização de bio e foto</summary>{profile.update}</details>}</>}
    </section>
  </main>;
  return profileSetupEnabled ? <ProfileSetup key={scopeKey} scopeKey={scopeKey} role={role} renderLayout={renderSections} /> : renderSections();
}
