/* eslint-disable */
// @ts-nocheck
"use client";
import { installDashboardPreferencesPersistence } from "./DashboardPreferencesPersistence";
import { mountAccountLifecycleManager } from "./AccountLifecycleManager";
import { mountAdminCampaignLibrary } from "./AdminCampaignLibrary";
installDashboardPreferencesPersistence();
mountAccountLifecycleManager();
mountAdminCampaignLibrary();
("use client");
import * as ReactNS from "react";
import { createRoot } from "react-dom/client";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { ConnectQueue } from "./ConnectQueue";
import { PublishPace } from "./PublishPace";
import { CampaignAccounts } from "./CampaignAccounts";
import {
  SharkBotIntegration,
  SharkBotSaleNotifier,
} from "./SharkBotIntegration";
import { OtpMultiApi } from "./OtpMultiApi";
if (typeof document < "u" && !globalThis.__resolvflowUnavailableMetrics) {
  globalThis.__resolvflowUnavailableMetrics = 1;
  let e = () => {
    for (let e of document.querySelectorAll(
      ".management-table tbody tr td:nth-child(7) strong.numeric",
    ))
      "0" === e.textContent?.trim() &&
        ((e.textContent = "—"),
        e.setAttribute("title", "Métrica não disponibilizada pela Meta"));
    for (let e of document.querySelectorAll("article")) {
      let a = e.querySelector(":scope > span"),
        s = e.querySelector(":scope > strong");
      a?.textContent?.startsWith("Acessos ao perfil") &&
        "0" === s?.textContent?.trim() &&
        ((s.textContent = "—"),
        s.setAttribute("title", "Métrica não disponibilizada pela Meta"));
    }
  };
  (queueMicrotask(e),
    new MutationObserver(e).observe(document.documentElement, {
      subtree: !0,
      childList: !0,
    }));
}
function n() {
  return { jsx: jsx, jsxs: jsxs, Fragment: Fragment };
}
if (typeof document < "u" && !globalThis.__resolvflowMissingCaptionLabel) {
  globalThis.__resolvflowMissingCaptionLabel = 1;
  let e = () =>
    document.querySelectorAll(".queue-directory article").forEach((e) => {
      let a = e.querySelector("div small"),
        s = e.querySelector(".queue-status.published");
      "Sem legenda" === a?.textContent &&
        s &&
        "Sem legenda" !== s.textContent &&
        (s.textContent = "Sem legenda");
    });
  (queueMicrotask(e),
    new MutationObserver(e).observe(document.documentElement, {
      childList: !0,
      subtree: !0,
    }));
}
if (typeof document < "u" && !globalThis.__resolvflowIntegrationCleanup) {
  globalThis.__resolvflowIntegrationCleanup = 1;
  let e = () =>
    document
      .querySelectorAll(
        ".integrations-page .integration-hero,.integrations-page .connection-directory",
      )
      .forEach((e) => (e.hidden = !0));
  (queueMicrotask(e),
    new MutationObserver(e).observe(document.documentElement, {
      childList: !0,
      subtree: !0,
    }));
}
if (typeof document < "u" && !globalThis.__resolvflowSharkBot) {
  globalThis.__resolvflowSharkBot = 1;
  let e = () => {
    let e = document.querySelector(".integrations-page .integration-grid");
    if (!e || e.querySelector(".sharkbot-integration-host")) return;
    let a = document.createElement("div");
    ((a.className = "sharkbot-integration-host"),
      e.prepend(a),
      createRoot(a).render(jsx(SharkBotIntegration, {})));
  };
  (queueMicrotask(e),
    new MutationObserver(e).observe(document.documentElement, {
      childList: !0,
      subtree: !0,
    }));
}
if (typeof document < "u" && !globalThis.__resolvflowSharkBotNotifier) {
  globalThis.__resolvflowSharkBotNotifier = 1;
  let e = () => {
    if (!document.body || document.querySelector(".sharkbot-notifier-host"))
      return;
    let e = document.createElement("div");
    ((e.className = "sharkbot-notifier-host"),
      document.body.append(e),
      createRoot(e).render(jsx(SharkBotSaleNotifier, {})));
  };
  (queueMicrotask(e),
    new MutationObserver(e).observe(document.documentElement, {
      childList: !0,
      subtree: !0,
    }));
}
if (
  (typeof document < "u" &&
    !globalThis.__nexoflowHardNav &&
    ((globalThis.__nexoflowHardNav = 1),
    document.addEventListener(
      "click",
      function (e) {
        if (
          !(
            e.defaultPrevented ||
            e.button ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          )
        ) {
          var a = e.target;
          if (a && a.closest) {
            var s = a.closest("a[href]");
            if (s && (!s.target || "_self" === s.target || "" === s.target)) {
              var n = s.getAttribute("href") || "";
              (0 !== n.indexOf("/api/") && 0 !== n.indexOf("/__nexoflow/")) ||
                (e.preventDefault(),
                e.stopImmediatePropagation(),
                window.location.replace(s.href));
            }
          }
        }
      },
      !0,
    )),
  typeof document < "u" && !globalThis.__resolvflowThemeToggle)
) {
  globalThis.__resolvflowThemeToggle = 1;
  let e = !1;
  try {
    e = "light" === localStorage.getItem("resolvflow_theme");
  } catch {}
  e
    ? (document.documentElement.dataset.theme = "light")
    : delete document.documentElement.dataset.theme;
  let a = () => {
    let e = document.querySelector(".top-actions");
    if (!e || e.querySelector(".theme-toggle-button")) return;
    let a = document.createElement("button"),
      s = () => {
        let e = "light" === document.documentElement.dataset.theme;
        ((a.innerHTML = e
          ? '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>'
          : '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>'),
          a.setAttribute("aria-pressed", String(e)),
          a.setAttribute(
            "aria-label",
            e ? "Ativar modo escuro" : "Ativar modo claro",
          ));
      };
    ((a.type = "button"),
      (a.className = "outline-button theme-toggle-button"),
      a.addEventListener("click", () => {
        let e = "light" !== document.documentElement.dataset.theme;
        e
          ? (document.documentElement.dataset.theme = "light")
          : delete document.documentElement.dataset.theme;
        try {
          localStorage.setItem("resolvflow_theme", e ? "light" : "dark");
        } catch {}
        s();
      }),
      s(),
      e.appendChild(a));
  };
  (queueMicrotask(a),
    new MutationObserver(a).observe(document.documentElement, {
      childList: !0,
      subtree: !0,
    }));
}
var r = ReactNS,
  i = null;
function a(e, a, s, n, t, i) {
  (e.beginPath(), e.roundRect(a, s, n, t, i), e.fill());
}
function o(e, a, s) {
  let n = a.trim().replace(/\s+/g, " ").split(" "),
    t = [],
    i = "";
  for (let a of n) {
    let n = i ? `${i} ${a}` : a;
    i && e.measureText(n).width > s ? (t.push(i), (i = a)) : (i = n);
  }
  return (i && t.push(i), t);
}
function s(e, a, s, n, t) {
  let i = t,
    r = [];
  for (
    ;
    i >= 42 &&
    ((e.font = `800 ${i}px Arial, sans-serif`),
    (r = o(e, a, s)),
    !(r.length <= n));

  )
    i -= 4;
  if (r.length > n) {
    r = r.slice(0, n);
    let a = r[n - 1];
    for (; a.length > 3 && e.measureText(`${a}…`).width > s; )
      a = a.slice(0, -1);
    r[n - 1] = `${a.trim()}…`;
  }
  return { fontSize: i, lines: r };
}
async function c(e) {
  let n = document.createElement("canvas");
  ((n.width = 1080), (n.height = 1920));
  let t = n.getContext("2d");
  if (!t)
    throw Error("Este navegador não conseguiu preparar o template do vídeo.");
  let i = e.copy.trim();
  if (!i) throw Error("Informe a copy que deve aparecer no vídeo.");
  let r = "news" === e.template,
    l = "clean" === e.template,
    o = s(t, i, 900, l ? 5 : 4, r ? 74 : 82),
    c = 1.14 * o.fontSize,
    d = o.lines.length * c + (r ? 210 : 170),
    m =
      "headline" === e.template
        ? 150
        : "news" === e.template
          ? 1920 - d - (e.cta ? 300 : 170)
          : (1920 - d) / 2;
  (t.save(),
    l
      ? ((t.shadowColor = "rgba(0,0,0,.9)"),
        (t.shadowBlur = 22),
        (t.shadowOffsetY = 5))
      : ((t.fillStyle = r ? "rgba(255,255,255,.96)" : "rgba(9,12,15,.90)"),
        a(t, 55, m, 970, d, 42),
        (t.fillStyle = "#ff8738"),
        a(t, 88, m + 42, r ? 180 : 230, 52, 18),
        (t.fillStyle = r ? "#11151a" : "#ffffff"),
        (t.font = "800 28px Arial, sans-serif"),
        t.fillText(r ? "AGORA" : "DESTAQUE", 115, m + 78)),
    (t.font = `800 ${o.fontSize}px Arial, sans-serif`),
    (t.textAlign = "center"),
    (t.textBaseline = "top"),
    (t.fillStyle = r ? "#11151a" : "#ffffff"));
  let u = m + (l ? 70 : 120);
  (o.lines.forEach((e, a) => t.fillText(e, 540, u + a * c)),
    t.restore(),
    e.cta?.trim() &&
      ((t.fillStyle = "rgba(255,135,56,.96)"),
      a(t, 155, 1685, 770, 88, 26),
      (t.fillStyle = "#17110d"),
      (t.font = "800 34px Arial, sans-serif"),
      (t.textAlign = "center"),
      (t.textBaseline = "middle"),
      t.fillText(e.cta.trim().slice(0, 70), 540, 1729)));
  let p = await new Promise((e, a) =>
    n.toBlob(
      (s) => (s ? e(s) : a(Error("Não foi possível gerar a camada de texto."))),
      "image/png",
    ),
  );
  return new Uint8Array(await p.arrayBuffer());
}
async function l() {
  return (
    (i ||= (async () => {
      let { FFmpeg: e } = await import("@ffmpeg/ffmpeg"),
        { toBlobURL: a } = await import("@ffmpeg/util"),
        s = new e(),
        n = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
      return (
        await s.load({
          coreURL: await a(`${n}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await a(`${n}/ffmpeg-core.wasm`, "application/wasm"),
        }),
        s
      );
    })().catch((e) => {
      throw ((i = null), e);
    })),
    i
  );
}
function u(e) {
  return (
    e
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "video"
  );
}
function d(e) {
  return "string" == typeof e ? e : new TextDecoder().decode(e);
}
async function ee(e, a, s) {
  if (
    0 !==
    (await e.ffprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      a,
      "-o",
      s,
    ]))
  )
    throw Error("Não foi possível identificar a duração da mídia.");
  let n = Number.parseFloat(d(await e.readFile(s)).trim());
  if (!Number.isFinite(n) || n <= 0)
    throw Error("A duração da mídia é inválida.");
  return n;
}
async function f(e, a, s) {
  return (
    0 ===
      (await e.ffprobe([
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        a,
        "-o",
        s,
      ])) && "audio" === d(await e.readFile(s)).trim()
  );
}
function p(e) {
  return "audio/mpeg" === e.type || /\.mp3$/i.test(e.name)
    ? "mp3"
    : ["audio/mp4", "audio/x-m4a"].includes(e.type) || /\.m4a$/i.test(e.name)
      ? "m4a"
      : "wav";
}
async function te(e, a, s, n) {
  if (n?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
  s?.(0.02);
  let [{ fetchFile: t }, r, o] = await Promise.all([
    import("./esm-DnWjBR4N.js"),
    l(),
    c(a),
  ]);
  if (n?.aborted)
    throw (
      r.terminate(),
      (i = null),
      new DOMException("Geração interrompida.", "AbortError")
    );
  s?.(0.08);
  let d = crypto.randomUUID().slice(0, 8),
    m = `input-${d}.${"video/quicktime" === e.type ? "mov" : "mp4"}`,
    p = `overlay-${d}.png`,
    h = `output-${d}.mp4`,
    x = !1,
    _ = !1,
    j = () => {
      ((x = !0), r.terminate(), (i = null));
    },
    g = () => j(),
    v = ({ progress: e }) => s?.(0.12 + 0.86 * Math.max(0, Math.min(1, e)));
  (r.on("progress", v), n?.addEventListener("abort", g, { once: !0 }));
  try {
    if ((await r.writeFile(m, await t(e)), await r.writeFile(p, o), n?.aborted))
      throw new DOMException("Geração interrompida.", "AbortError");
    s?.(0.12);
    let a,
      i = window.setTimeout(() => {
        ((_ = !0), j());
      }, 18e4);
    try {
      a = await r.exec([
        "-i",
        m,
        "-loop",
        "1",
        "-i",
        p,
        "-filter_complex",
        "[0:v]fps=20,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[base];[1:v]scale=720:1280[graphic];[base][graphic]overlay=0:0:format=auto:shortest=1[outv]",
        "-map",
        "[outv]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        h,
      ]);
    } catch (e) {
      throw _
        ? Error(
            "Este vídeo levou mais de 3 minutos para gerar. Tente um arquivo mais curto ou menor.",
          )
        : x || n?.aborted
          ? new DOMException("Geração interrompida.", "AbortError")
          : e;
    } finally {
      window.clearTimeout(i);
    }
    if (0 !== a)
      throw Error("O motor de vídeo não conseguiu concluir a renderização.");
    let l = await r.readFile(h);
    if (!(l instanceof Uint8Array))
      throw Error("O arquivo final não pôde ser lido.");
    let c = new File([l.slice().buffer], `nexoflow-${u(e.name)}.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
    if (c.size > 104857600)
      throw Error(
        `${e.name} gerou um arquivo maior que 100 MB. Use um vídeo menor ou mais curto.`,
      );
    return (s?.(1), c);
  } finally {
    (n?.removeEventListener("abort", g),
      x ||
        (r.off("progress", v),
        await Promise.allSettled([
          r.deleteFile(m),
          r.deleteFile(p),
          r.deleteFile(h),
        ])));
  }
}
async function m(e, a, s, n) {
  if (!e.type.startsWith("image/"))
    throw Error(`${e.name} não é uma imagem compatível.`);
  if (n?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
  let t = Math.min(15, Math.max(3, Math.round(a.durationSeconds || 7))),
    r = 20 * t,
    o =
      "static" === a.motion
        ? "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,fps=20,setsar=1,format=yuv420p"
        : `scale=850:1512:force_original_aspect_ratio=increase,crop=850:1512,${"zoom_out" === a.motion ? `zoompan=z='if(eq(on,0),1.10,max(1.0,zoom-0.0008))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${r}:s=720x1280:fps=20` : "drift" === a.motion ? `zoompan=z='1.07':x='(iw-iw/zoom)*(on/${r})':y='(ih-ih/zoom)/2':d=${r}:s=720x1280:fps=20` : `zoompan=z='min(zoom+0.0008,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${r}:s=720x1280:fps=20`},format=yuv420p`;
  s?.(0.03);
  let [{ fetchFile: c }, d] = await Promise.all([
    import("./esm-DnWjBR4N.js"),
    l(),
  ]);
  if (n?.aborted)
    throw (
      d.terminate(),
      (i = null),
      new DOMException("Geração interrompida.", "AbortError")
    );
  let m = crypto.randomUUID().slice(0, 8),
    p = `image-${m}.${"image/png" === e.type ? "png" : "jpg"}`,
    h = `image-reel-${m}.mp4`,
    x = !1,
    _ = !1,
    j = () => {
      ((x = !0), d.terminate(), (i = null));
    },
    g = () => j(),
    v = ({ progress: e }) => s?.(0.08 + 0.9 * Math.max(0, Math.min(1, e)));
  (d.on("progress", v), n?.addEventListener("abort", g, { once: !0 }));
  try {
    if ((await d.writeFile(p, await c(e)), n?.aborted))
      throw new DOMException("Geração interrompida.", "AbortError");
    s?.(0.08);
    let a,
      i = window.setTimeout(() => {
        ((_ = !0), j());
      }, 12e4);
    try {
      a = await d.exec([
        "-loop",
        "1",
        "-i",
        p,
        "-t",
        String(t),
        "-vf",
        o,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "20",
        "-movflags",
        "+faststart",
        h,
      ]);
    } catch (e) {
      throw _
        ? Error(
            "A conversão da imagem levou mais de 2 minutos. Tente uma imagem menor.",
          )
        : x || n?.aborted
          ? new DOMException("Geração interrompida.", "AbortError")
          : e;
    } finally {
      window.clearTimeout(i);
    }
    if (0 !== a)
      throw Error("Não foi possível transformar esta imagem em Reel.");
    let r = await d.readFile(h);
    if (!(r instanceof Uint8Array))
      throw Error("O Reel gerado não pôde ser lido.");
    let l = new File([r.slice().buffer], `nexoflow-${u(e.name)}-reel.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
    if (l.size > 104857600)
      throw Error(`${e.name} gerou um Reel maior que 100 MB.`);
    return (s?.(1), l);
  } finally {
    (n?.removeEventListener("abort", g),
      x ||
        (d.off("progress", v),
        await Promise.allSettled([d.deleteFile(p), d.deleteFile(h)])));
  }
}
async function h(e, a, s, n) {
  if (
    ![
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
    ].includes(a.musicFile.type) &&
    !/\.(mp3|m4a|wav)$/i.test(a.musicFile.name)
  )
    throw Error(
      `${a.musicFile.name} não é uma trilha MP3, M4A ou WAV compatível.`,
    );
  if (n?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
  s?.(0.02);
  let [{ fetchFile: t }, r] = await Promise.all([
    import("./esm-DnWjBR4N.js"),
    l(),
  ]);
  if (n?.aborted)
    throw (
      r.terminate(),
      (i = null),
      new DOMException("Geração interrompida.", "AbortError")
    );
  let o = crypto.randomUUID().slice(0, 8),
    c = `music-video-${o}.${"video/quicktime" === e.type || /\.mov$/i.test(e.name) ? "mov" : "mp4"}`,
    d = `music-${o}.${p(a.musicFile)}`,
    m = `music-output-${o}.mp4`,
    h = `video-duration-${o}.txt`,
    x = `music-duration-${o}.txt`,
    _ = `audio-probe-${o}.txt`,
    j = [c, d, m, h, x, _],
    g = !1,
    v = !1,
    b = () => {
      ((g = !0), r.terminate(), (i = null));
    },
    y = () => b(),
    N = ({ progress: e }) => s?.(0.12 + 0.86 * Math.max(0, Math.min(1, e)));
  (r.on("progress", N), n?.addEventListener("abort", y, { once: !0 }));
  try {
    await Promise.all([
      r.writeFile(c, await t(e)),
      r.writeFile(d, await t(a.musicFile)),
    ]);
    let i = await ee(r, c, h),
      l = await ee(r, d, x),
      o = await f(r, c, _);
    if (n?.aborted)
      throw new DOMException("Geração interrompida.", "AbortError");
    let p = Math.max(0, Number(a.startSeconds) || 0);
    if (!a.loop && p >= l)
      throw Error("O início escolhido está depois do fim da música.");
    let j = a.loop ? p % l : p,
      y = a.loop ? i : Math.min(i, l - j),
      N = Math.max(0, Math.min(Number(a.fadeSeconds) || 0, y / 2)),
      w = Math.max(0, Math.min(100, Number(a.musicVolume) || 0)) / 100,
      C = Math.max(0, Math.min(100, Number(a.originalVolume) || 0)) / 100,
      S =
        N > 0
          ? `,afade=t=in:st=0:d=${N.toFixed(3)},afade=t=out:st=${Math.max(0, y - N).toFixed(3)}:d=${N.toFixed(3)}`
          : "",
      k = `[1:a]volume=${w.toFixed(3)},atrim=duration=${y.toFixed(3)},asetpts=N/SR/TB,aresample=48000${S},apad=pad_dur=${i.toFixed(3)},atrim=duration=${i.toFixed(3)}[music]`,
      E =
        o && C > 0
          ? `${k};[0:a]volume=${C.toFixed(3)},aresample=48000,apad=pad_dur=${i.toFixed(3)},atrim=duration=${i.toFixed(3)}[original];[original][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
          : `${k};[music]anull[aout]`,
      A = a.loop
        ? ["-stream_loop", "-1", "-ss", j.toFixed(3), "-i", d]
        : ["-ss", j.toFixed(3), "-i", d];
    s?.(0.12);
    let M,
      $ = window.setTimeout(() => {
        ((v = !0), b());
      }, 18e4);
    try {
      M = await r.exec([
        "-i",
        c,
        ...A,
        "-filter_complex",
        E,
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-t",
        i.toFixed(3),
        "-movflags",
        "+faststart",
        m,
      ]);
    } catch (e) {
      throw v
        ? Error(
            "A trilha levou mais de 3 minutos para ser incorporada. Tente um áudio ou vídeo menor.",
          )
        : g || n?.aborted
          ? new DOMException("Geração interrompida.", "AbortError")
          : e;
    } finally {
      window.clearTimeout($);
    }
    if (0 !== M) throw Error("Não foi possível incorporar a trilha ao Reel.");
    let T = await r.readFile(m);
    if (!(T instanceof Uint8Array))
      throw Error("O Reel com música não pôde ser lido.");
    let P = new File([T.slice().buffer], `nexoflow-${u(e.name)}-music.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
    if (P.size > 104857600)
      throw Error(`${e.name} ficou maior que 100 MB depois da trilha.`);
    return (s?.(1), P);
  } finally {
    (n?.removeEventListener("abort", y),
      g ||
        (r.off("progress", N),
        await Promise.allSettled(j.map((e) => r.deleteFile(e)))));
  }
}
function g(e) {
  return `${e.name}:${e.size}:${e.lastModified}`;
}
var _ = n(),
  v = [
    { key: "operation_3", label: "MK 1" },
    { key: "operation_2", label: "MK 2" },
    { key: "default", label: "MK 3" },
  ];
async function ne(e, a) {
  let s = await fetch(e, { credentials: "same-origin", ...a }),
    n = await s.json().catch(() => ({}));
  if (!s.ok) throw Error(n.error || "Não foi possível atualizar a fila.");
  return n;
}
function re({ canOperate: e }) {
  let [a, s] = (0, r.useState)("operation_3"),
    [n, t] = (0, r.useState)(""),
    [i, l] = (0, r.useState)(
      "https://www.instagram.com/accounts/manage_access/",
    ),
    [o, c] = (0, r.useState)(!1),
    [d, m] = (0, r.useState)(!1),
    [u, p] = (0, r.useState)([]),
    [h, x] = (0, r.useState)([]),
    [j, g] = (0, r.useState)(""),
    [b, f] = (0, r.useState)(!1),
    [y, N] = (0, r.useState)(!1),
    [w, C] = (0, r.useState)(""),
    [S, k] = (0, r.useState)(!1);
  async function E() {
    let e = await ne("/api/meta/connect-queue");
    (c(!!e.isPlatformAdmin),
      m(!!e.canDirectConnect),
      e.inviteUrl && l(e.inviteUrl),
      p(e.mine || []),
      x(e.queue || []));
  }
  (0, r.useEffect)(() => {
    E().catch((e) => {
      (f(!0), g(e instanceof Error ? e.message : "Falha ao ler a fila."));
    });
  }, []);
  let A = (0, r.useMemo)(() => {
    let e = new Map();
    for (let a of h.filter((e) => "pending" === e.status)) {
      let s = a.requestedByEmail || "sem e-mail",
        n = e.get(s) || [];
      (n.push(a), e.set(s, n));
    }
    return [...e.entries()].sort((e, a) => e[0].localeCompare(a[0]));
  }, [h]);
  return (0, _.jsxs)("section", {
    className: "panel connect-queue",
    children: [
      (0, _.jsxs)("div", {
        className: "connect-queue-bar",
        children: [
          (0, _.jsxs)("div", {
            children: [
              (0, _.jsx)("span", {
                className: "panel-kicker",
                children: "Conexão Instagram",
              }),
              (0, _.jsx)("h2", { children: "Conectar contas" }),
            ],
          }),
          (0, _.jsx)("button", {
            type: "button",
            className: "primary-button",
            disabled: !e,
            onClick: () => {
              (k(!0), f(!1), g(""));
            },
            children: e ? "Conectar contas" : "Somente leitura",
          }),
        ],
      }),
      j && !S
        ? (0, _.jsx)("p", {
            className: "connect-queue-msg " + (b ? "error" : ""),
            children: j,
          })
        : null,
      u.length
        ? (0, _.jsx)("div", {
            className: "connect-queue-list",
            children: u.map((e) =>
              (0, _.jsxs)(
                "article",
                {
                  className: `connect-queue-row ${e.status}`,
                  children: [
                    (0, _.jsxs)("strong", { children: ["@", e.username] }),
                    (0, _.jsx)("small", { children: e.metaAppLabel }),
                    "pending" !== e.status || d
                      ? null
                      : (0, _.jsx)("span", {
                          className: "queue-status pending",
                          children: "Aguardando liberação",
                        }),
                    "invited" === e.status || ("pending" === e.status && d)
                      ? (0, _.jsxs)("span", {
                          className: "connect-queue-actions",
                          children: [
                            (0, _.jsx)("a", {
                              className: "outline-button",
                              href: i,
                              target: "_blank",
                              rel: "noreferrer",
                              children: "Aceitar no Instagram",
                            }),
                            (0, _.jsx)("button", {
                              type: "button",
                              className: "primary-button",
                              onClick: () =>
                                window.location.replace(
                                  `/api/meta/connect?app=${e.metaAppKey}`,
                                ),
                              children: "Conectar",
                            }),
                          ],
                        })
                      : null,
                  ],
                },
                e.id,
              ),
            ),
          })
        : null,
      o
        ? (0, _.jsxs)("div", {
            className: "connect-queue-admin",
            children: [
              (0, _.jsxs)("div", {
                className: "panel-heading",
                children: [
                  (0, _.jsxs)("div", {
                    children: [
                      (0, _.jsx)("span", {
                        className: "panel-kicker",
                        children: "Operação",
                      }),
                      (0, _.jsx)("h2", {
                        children: "Pendentes de todos os usuários",
                      }),
                    ],
                  }),
                  (0, _.jsxs)("span", {
                    className: "date-pill",
                    children: [
                      h.filter((e) => "pending" === e.status).length,
                      " para liberar",
                    ],
                  }),
                ],
              }),
              A.length
                ? A.map(([e, a]) =>
                    (0, _.jsxs)(
                      "div",
                      {
                        className: "connect-queue-app-block",
                        children: [
                          (0, _.jsxs)("header", {
                            children: [
                              (0, _.jsx)("strong", { children: e }),
                              (0, _.jsxs)("small", {
                                children: [a.length, " pendente(s)"],
                              }),
                              (0, _.jsx)("button", {
                                type: "button",
                                className: "text-button",
                                disabled: !a.length || y,
                                onClick: () => {
                                  !(async function (e, a) {
                                    let s = a.map((e) => e.username).join("\n");
                                    s &&
                                      (await navigator.clipboard.writeText(s),
                                      C(e),
                                      window.setTimeout(() => C(""), 1600));
                                  })(e, a);
                                },
                                children: w === e ? "Copiado" : "Copiar @",
                              }),
                              (0, _.jsx)("button", {
                                type: "button",
                                className: "outline-button",
                                disabled: !a.length || y,
                                onClick: () => {
                                  !(async function (e, a) {
                                    (N(!0), f(!1), g(""));
                                    try {
                                      let e = await ne(
                                        "/api/meta/connect-queue",
                                        {
                                          method: "PATCH",
                                          headers: {
                                            "content-type": "application/json",
                                          },
                                          body: JSON.stringify(
                                            a
                                              ? {
                                                  action: "invite_user",
                                                  email: a,
                                                }
                                              : { action: "invite", ids: [] },
                                          ),
                                        },
                                      );
                                      (g(
                                        `${e.updated || 0} perfil(is) liberados para aceitar o convite.`,
                                      ),
                                        await E());
                                    } catch (e) {
                                      (f(!0),
                                        g(
                                          e instanceof Error
                                            ? e.message
                                            : "Não foi possível liberar o convite.",
                                        ));
                                    } finally {
                                      N(!1);
                                    }
                                  })([], e);
                                },
                                children: "Marcar convite enviado",
                              }),
                            ],
                          }),
                          a.map((e) =>
                            (0, _.jsxs)(
                              "article",
                              {
                                children: [
                                  (0, _.jsxs)("strong", {
                                    children: ["@", e.username],
                                  }),
                                  (0, _.jsx)("small", {
                                    children: e.metaAppLabel,
                                  }),
                                ],
                              },
                              e.id,
                            ),
                          ),
                        ],
                      },
                      e,
                    ),
                  )
                : (0, _.jsx)("p", {
                    className: "connect-queue-empty",
                    children: "Nenhum perfil pendente nas outras contas.",
                  }),
            ],
          })
        : null,
      S
        ? (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => {
              e.target === e.currentTarget && !y && k(!1);
            },
            children: (0, _.jsxs)("form", {
              className: "import-modal connect-queue-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "connect-queue-title",
              onSubmit: async function (s) {
                if ((s.preventDefault(), e)) {
                  (N(!0), f(!1), g(""));
                  try {
                    let e = await ne("/api/meta/connect-queue", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ usernames: n, metaAppKey: a }),
                    });
                    (p(e.mine || []),
                      t(""),
                      k(!1),
                      g(
                        `${e.created || 0} perfil(is) na fila${e.skipped ? ` · ${e.skipped} já estavam pendentes` : ""}.`,
                      ),
                      await E());
                  } catch (e) {
                    (f(!0),
                      g(
                        e instanceof Error
                          ? e.message
                          : "Não foi possível pedir a conexão.",
                      ));
                  } finally {
                    N(!1);
                  }
                }
              },
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => k(!1),
                  "aria-label": "Fechar",
                  disabled: y,
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "panel-kicker",
                  children: "Conexão Instagram",
                }),
                (0, _.jsx)("h2", {
                  id: "connect-queue-title",
                  children: "Conectar contas",
                }),
                (0, _.jsx)("p", {
                  children: d
                    ? "Escolha o MK e conecte. Sem esperar liberação de outra conta."
                    : "Cole os @, escolha o MK e peça a conexão. Quando a liberação sair, aceite o convite no Instagram.",
                }),
                j
                  ? (0, _.jsx)("p", {
                      className: "connect-queue-msg " + (b ? "error" : ""),
                      children: j,
                    })
                  : null,
                (0, _.jsxs)("label", {
                  children: [
                    (0, _.jsx)("span", { children: "Perfis do Instagram" }),
                    (0, _.jsx)("textarea", {
                      value: n,
                      onChange: (e) => t(e.target.value),
                      rows: 6,
                      placeholder:
                        "um @ por linha\nexemplo.user01\nexemplo.user02",
                      disabled: !e || y,
                      autoFocus: !0,
                    }),
                  ],
                }),
                (0, _.jsx)("div", {
                  className: "connect-queue-apps",
                  role: "group",
                  "aria-label": "App para estes perfis",
                  children: v.map((e) =>
                    (0, _.jsx)(
                      "button",
                      {
                        type: "button",
                        className: a === e.key ? "active" : "",
                        "aria-pressed": a === e.key,
                        onClick: () => s(e.key),
                        disabled: y,
                        children: e.label,
                      },
                      e.key,
                    ),
                  ),
                }),
                (0, _.jsx)("button", {
                  className: "primary-button",
                  disabled: !e || y || !n.trim(),
                  children: e
                    ? d
                      ? "Liberar para conectar"
                      : "Pedir conexão"
                    : "Somente leitura",
                }),
                d
                  ? (0, _.jsxs)("button", {
                      type: "button",
                      className: "text-button connect-queue-direct",
                      onClick: () =>
                        window.location.replace(`/api/meta/connect?app=${a}`),
                      children: [
                        "Conectar direto · ",
                        v.find((e) => e.key === a)?.label,
                      ],
                    })
                  : null,
              ],
            }),
          })
        : null,
    ],
  });
}
function y({ name: e, size: a = 18 }) {
  return (0, _.jsx)("svg", {
    "aria-hidden": "true",
    width: a,
    height: a,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: {
      grid: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("rect", {
            x: "3",
            y: "3",
            width: "7",
            height: "7",
            rx: "2",
          }),
          (0, _.jsx)("rect", {
            x: "14",
            y: "3",
            width: "7",
            height: "7",
            rx: "2",
          }),
          (0, _.jsx)("rect", {
            x: "3",
            y: "14",
            width: "7",
            height: "7",
            rx: "2",
          }),
          (0, _.jsx)("rect", {
            x: "14",
            y: "14",
            width: "7",
            height: "7",
            rx: "2",
          }),
        ],
      }),
      users: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", {
            d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
          }),
          (0, _.jsx)("circle", { cx: "9", cy: "7", r: "4" }),
          (0, _.jsx)("path", {
            d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
          }),
        ],
      }),
      campaign: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", { d: "m3 11 18-5v12L3 14v-3Z" }),
          (0, _.jsx)("path", { d: "M11.6 15.9 13 21H7l-1.4-6.2" }),
        ],
      }),
      queue: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", { d: "M8 6h13M8 12h13M8 18h13" }),
          (0, _.jsx)("circle", { cx: "3", cy: "6", r: "1" }),
          (0, _.jsx)("circle", { cx: "3", cy: "12", r: "1" }),
          (0, _.jsx)("circle", { cx: "3", cy: "18", r: "1" }),
        ],
      }),
      bell: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", {
            d: "M18 8A6 6 0 0 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9",
          }),
          (0, _.jsx)("path", { d: "M13.7 21a2 2 0 0 1-3.4 0" }),
        ],
      }),
      plug: (0, _.jsx)("path", { d: "m12 22 1-5-5-1 8-14-1 8 5 1-8 11Z" }),
      search: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("circle", { cx: "11", cy: "11", r: "7" }),
          (0, _.jsx)("path", { d: "m20 20-4-4" }),
        ],
      }),
      plus: (0, _.jsx)("path", { d: "M12 5v14M5 12h14" }),
      upload: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", { d: "M12 16V4M7 9l5-5 5 5" }),
          (0, _.jsx)("path", { d: "M20 16v4H4v-4" }),
        ],
      }),
      arrow: (0, _.jsx)(_.Fragment, {
        children: (0, _.jsx)("path", { d: "M5 12h14M13 6l6 6-6 6" }),
      }),
      more: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("circle", { cx: "5", cy: "12", r: "1" }),
          (0, _.jsx)("circle", { cx: "12", cy: "12", r: "1" }),
          (0, _.jsx)("circle", { cx: "19", cy: "12", r: "1" }),
        ],
      }),
      check: (0, _.jsx)("path", { d: "m5 12 4 4L19 6" }),
      shield: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", {
            d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
          }),
          (0, _.jsx)("path", { d: "m9 12 2 2 4-4" }),
        ],
      }),
      spark: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("path", {
            d: "m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z",
          }),
          (0, _.jsx)("path", {
            d: "m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
          }),
        ],
      }),
      panel: (0, _.jsxs)(_.Fragment, {
        children: [
          (0, _.jsx)("rect", {
            x: "3",
            y: "4",
            width: "18",
            height: "16",
            rx: "2",
          }),
          (0, _.jsx)("path", { d: "M9 4v16" }),
        ],
      }),
      sliders: (0, _.jsx)(_.Fragment, {
        children: (0, _.jsx)("path", {
          d: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
        }),
      }),
    }[e],
  });
}
var b = {
    dashboard: "/dashboard",
    accounts: "/contas",
    vault: "/acessos",
    campaigns: "/campanhas",
    queue: "/fila",
    alerts: "/alertas",
    reports: "/relatorios",
    integrations: "/integracoes",
    team: "/equipe",
    otp: "/otp",
  },
  x = {
    "/": "dashboard",
    "/dashboard": "dashboard",
    "/contas": "accounts",
    "/acessos": "vault",
    "/campanhas": "campaigns",
    "/fila": "queue",
    "/alertas": "alerts",
    "/relatorios": "reports",
    "/integracoes": "integrations",
    "/equipe": "team",
    "/otp": "otp",
  };
function ie(e = window.location) {
  let a = e.pathname.replace(/\/+$/, "") || "/";
  if (x[a]) return x[a];
  let s = new URLSearchParams(e.search).get("view");
  return s && s in b ? s : "dashboard";
}
function ae(e) {
  return "operation_2" === e
    ? "MK 2"
    : "operation_3" === e
      ? "MK 1"
      : "leandro" === e
        ? "App 01"
        : "wgb" === e
          ? "App 01 - WGB"
          : "wgb02" === e
            ? "App 02 - WGB"
          : "prado" === e
            ? "App Prado"
            : "fabricio" === e
              ? "App Fabricio"
              : "teste" === e
                ? "App Teste"
                : "MK 3";
}
var S = [
  { key: "operation_3", label: "MK 1" },
  { key: "operation_2", label: "MK 2" },
  { key: "default", label: "MK 3" },
];
function oe({ value: e, onChange: a, includeAll: s = !1, ariaLabel: n }) {
  let t = s ? [{ key: "all", label: "Todos" }, ...S] : S;
  return (0, _.jsx)("div", {
    className: "app-chips",
    role: "group",
    "aria-label": n,
    children: t.map((s) =>
      (0, _.jsx)(
        "button",
        {
          type: "button",
          className: e === s.key ? "active" : "",
          "aria-pressed": e === s.key,
          onClick: () => a(s.key),
          children: s.label,
        },
        s.key,
      ),
    ),
  });
}
var se = [
    { id: "metrics", label: "Indicadores principais" },
    { id: "strip", label: "Faixa de números" },
    { id: "health", label: "Saúde das contas" },
    { id: "focus", label: "Ranking de hoje" },
    { id: "accounts", label: "Perfis monitorados" },
  ],
  ce = [
    { id: "connected", label: "Contas conectadas" },
    { id: "published", label: "Publicações" },
    { id: "queue", label: "Conteúdos na fila" },
    { id: "views", label: "Visualizações" },
    { id: "reach", label: "Alcance" },
    { id: "followers", label: "Seguidores" },
    { id: "alerts", label: "Alertas" },
    { id: "success", label: "Taxa de sucesso" },
  ],
  le = {
    widgets: ["metrics", "strip", "health", "accounts"],
    hidden: [],
    cards: ["connected", "published", "queue", "views"],
    strip: ["reach", "followers", "alerts", "success"],
  },
  ue = "resolvflow.dashboard.v2",
  de = "resolvflow.sidebarCollapsed";
function fe(e, a, s) {
  let n = a + s;
  if (n < 0 || n >= e.length) return e;
  let t = [...e];
  return (([t[a], t[n]] = [t[n], t[a]]), t);
}
function pe(e = 5) {
  let a = new Date(Date.now() + 6e4 * e);
  return (
    a.setMinutes(a.getMinutes() - a.getTimezoneOffset()),
    a.toISOString().slice(0, 16)
  );
}
function C(e) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(e);
}
function me(e) {
  return new Intl.NumberFormat("pt-BR").format(e);
}
function he(e) {
  return e < 1024
    ? `${e} B`
    : e < 1048576
      ? `${(e / 1024).toFixed(1)} KB`
      : e < 1024 ** 3
        ? `${(e / 1048576).toFixed(1)} MB`
        : `${(e / 1024 ** 3).toFixed(2)} GB`;
}
function ge(e, a) {
  e.target === e.currentTarget && a();
}
async function w(e, a) {
  let s = await window.fetch(e, { credentials: "same-origin", ...a });
  if (401 === s.status) {
    let e = !0;
    try {
      let a = await s.clone().json(),
        n = String(a.error || "");
      n && !/entre na resolv/i.test(n) && (e = !1);
    } catch {}
    if (e) {
      let e = encodeURIComponent(window.location.pathname || "/");
      window.location.assign(`/__nexoflow/login?next=${e}`);
    }
  }
  return s;
}
async function uploadCampaignMedia(e) {
  let a = crypto.randomUUID(),
    s;
  for (let n = 1; n <= 3; n += 1) {
    try {
      let t = await w(`/api/media/upload?name=${encodeURIComponent(e.name)}`, {
          method: "POST",
          headers: {
            "content-type": e.type,
            "x-file-size": String(e.size),
            "x-upload-id": a,
          },
          body: e,
        }),
        i = await t.json().catch(() => ({}));
      if (t.ok && i.id) return i;
      let r = Error(i.error || `Falha ao enviar ${e.name}.`);
      if (t.status !== 429 && t.status < 500) throw r;
      s = r;
    } catch (a) {
      s = a instanceof Error ? a : Error(`Falha ao enviar ${e.name}.`);
    }
    n < 3 && (await new Promise((e) => window.setTimeout(e, 750 * n)));
  }
  throw Error(
    `NÃ£o foi possÃ­vel enviar ${e.name} apÃ³s 3 tentativas. Confira a conexÃ£o e tente novamente. ${s?.message || ""}`.trim(),
  );
}
async function _e(e) {
  let a = (await e.text()).trim();
  if (!a) return {};
  if (a.startsWith("<") || a.startsWith("<!"))
    throw Error(
      "A sincronização estourou o tempo do servidor. Os números continuam atualizando sozinhos a cada 5 minutos.",
    );
  try {
    return JSON.parse(a);
  } catch {
    throw Error("A resposta do servidor não veio no formato esperado.");
  }
}
function ve(e) {
  if (!e) return "nunca";
  let a = Date.now() - new Date(e).getTime();
  return !Number.isFinite(a) || a < 0 || a < 45e3
    ? "agora"
    : a < 36e5
      ? `há ${Math.max(1, Math.round(a / 6e4))} min`
      : a < 864e5
        ? `há ${Math.max(1, Math.round(a / 36e5))} h`
        : `há ${Math.max(1, Math.round(a / 864e5))} d`;
}
function ye(e = new Date()) {
  let a = e.getTimezoneOffset();
  return new Date(e.getTime() - 6e4 * a).toISOString().slice(0, 10);
}
function be(e, a) {
  let s = new Date(),
    n = new Date(s),
    t = new Date(s);
  if ("all" === e)
    return {
      from: "2000-01-01T00:00:00.000Z",
      to: "2100-01-01T00:00:00.000Z",
      label: "Todo o período",
    };
  if ("custom" === e)
    return (
      (n = new Date(`${a}T00:00:00`)),
      (t = new Date(`${a}T23:59:59.999`)),
      {
        from: n.toISOString(),
        to: t.toISOString(),
        label: n.toLocaleDateString("pt-BR"),
      }
    );
  (n.setHours(0, 0, 0, 0),
    t.setHours(23, 59, 59, 999),
    "yesterday" === e &&
      (n.setDate(n.getDate() - 1), t.setDate(t.getDate() - 1)),
    "7d" === e && n.setDate(n.getDate() - 6),
    "30d" === e && n.setDate(n.getDate() - 29));
  let i =
    "today" === e
      ? "Hoje"
      : "yesterday" === e
        ? "Ontem"
        : "7d" === e
          ? "Últimos 7 dias"
          : "Últimos 30 dias";
  return { from: n.toISOString(), to: t.toISOString(), label: i };
}
function xe(e, a) {
  if (!e) return !1;
  let s = new Date(e).getTime();
  return s >= new Date(a.from).getTime() && s <= new Date(a.to).getTime();
}
function Se(e, a) {
  let s = (e) => `"${String(e ?? "").replaceAll('"', '""')}"`,
    n = new Blob(["\ufeff", a.map((e) => e.map(s).join(";")).join("\n")], {
      type: "text/csv;charset=utf-8",
    }),
    t = URL.createObjectURL(n),
    i = document.createElement("a");
  ((i.href = t), (i.download = e), i.click(), URL.revokeObjectURL(t));
}
function T(e) {
  return "container_created" === e
    ? "Mídia preparada"
    : "processing" === e
      ? "Publicando"
      : "pending" === e
        ? "Pendente"
        : "retry" === e
          ? "Nova tentativa"
          : "paused" === e
            ? "Pausada"
            : "cancelled" === e
              ? "Cancelada"
              : "published" === e
                ? "Publicada"
                : "blocked" === e
                  ? "Bloqueada"
                  : "failed" === e
                    ? "Falhou"
                    : e;
}
function Ce(e) {
  return e.healthStatus.toLowerCase().includes("susp") ||
    "Em apelação" === e.connectionStatus
    ? "Suspensa"
    : "Conectada" === e.connectionStatus
      ? e.healthStatus.toLowerCase().includes("limite") ||
        ((e.quotaTotal ?? 0) > 0 && (e.quotaUsed ?? 0) >= (e.quotaTotal ?? 100))
        ? "Limite atingido"
        : e.healthStatus.toLowerCase().includes("restr") ||
            "error" === e.connectionApiStatus
          ? "Restrita"
          : "Saudável"
      : "murphy_csv" === e.source
        ? "Aguardando Meta"
        : "Desconectada";
}
function we(e) {
  return (
    "error" === e.connectionApiStatus ||
    /instagram\.com|access token|renovada|checkpoint/i.test(
      `${e.lastError || ""}`,
    )
  );
}
function Te(e) {
  return !e.loginEmail || !e.phoneNumber;
}
function Ee(e) {
  return [...new Set(e.map((e) => (e || "").trim()).filter(Boolean))].sort(
    (e, a) => e.localeCompare(a, "pt-BR"),
  );
}
function De(e) {
  return {
    loginEmail: e.loginEmail || "",
    recoveryEmail: e.recoveryEmail || "",
    phoneNumber: e.phoneNumber || "",
    twoFactorMethod: e.twoFactorMethod || "",
    emailTwoFactor: e.emailTwoFactor || "",
    vaultReference: e.vaultReference || "",
    notes: e.notes || "",
    model: e.model || "",
    player: e.player || "",
    groupName: e.groupName || "",
    niche: e.niche || "",
    lifecycle: e.lifecycle || "ativa",
  };
}
function Oe(e, a) {
  return "player" === a
    ? e.player || "Sem player"
    : "group" === a
      ? e.groupName || "Sem grupo"
      : "none" === a
        ? "Todas"
        : e.model || "Sem modelo";
}
function ke(e) {
  return /^sem (modelo|player|grupo)$/i.test(e) || "Todas" === e ? 1 : 0;
}
function Ae({ account: e, draft: a }) {
  let s = [
    { on: !!(a?.loginEmail ?? e.loginEmail ?? "").trim(), label: "E-mail" },
    { on: !!(a?.phoneNumber ?? e.phoneNumber ?? "").trim(), label: "Telefone" },
    { on: !!e.hasLoginPassword, label: "Senha" },
    {
      on: !!(a?.twoFactorMethod ?? e.twoFactorMethod ?? "").trim(),
      label: "2FA",
    },
  ];
  return (0, _.jsx)("span", {
    className: "vault-pips",
    title: s.map((e) => `${e.label}: ${e.on ? "ok" : "falta"}`).join(" · "),
    children: s.map((e) =>
      (0, _.jsx)("i", { className: e.on ? "on" : "" }, e.label),
    ),
  });
}
function je(e, a) {
  let s = !!(a?.loginEmail ?? e.loginEmail ?? "").trim(),
    n = !!(a?.phoneNumber ?? e.phoneNumber ?? "").trim(),
    t = !!e.hasLoginPassword,
    i = !!(a?.twoFactorMethod ?? e.twoFactorMethod ?? "").trim(),
    r = [s, n, t, i].filter(Boolean).length;
  return {
    email: s,
    phone: n,
    password: t,
    twoFactor: i,
    filled: r,
    complete: 4 === r,
  };
}
function Me(e) {
  return "caida" === e.lifecycle
    ? { key: "caida", label: "Caída" }
    : "aquecendo" === e.lifecycle
      ? { key: "aquecendo", label: "Aquecendo" }
      : we(e) || /restr/i.test(e.healthStatus)
        ? { key: "checkpoint", label: "Checkpoint" }
        : /susp/i.test(e.healthStatus)
          ? { key: "restrita", label: "Suspensa" }
          : "Conectada" === e.connectionStatus
            ? e.hasLoginPassword && !Te(e) && e.twoFactorMethod
              ? { key: "operacional", label: "Operacional" }
              : { key: "revisar", label: "Revisar" }
            : { key: "aquecendo", label: "Aquecendo" };
}
function Ne(e) {
  return "caida" === e.lifecycle
    ? null
    : we(e)
      ? {
          severity: "critical",
          title: "Checkpoint",
          detail: "Entrar no Instagram e revisar checkpoint",
        }
      : e.twoFactorMethod
        ? e.hasLoginPassword
          ? Te(e)
            ? {
                severity: "warning",
                title: "Completar acesso",
                detail: "Falta e-mail ou telefone",
              }
            : "Conectada" === e.connectionStatus
              ? null
              : {
                  severity: "info",
                  title: "Conectar na Meta",
                  detail: "Cadastrada, ainda sem Integrações",
                }
          : {
              severity: "warning",
              title: "Guardar senha",
              detail: "A senha ainda não está no cofre",
            }
        : {
            severity: "warning",
            title: "Configurar 2FA",
            detail: "Ativar autenticação em duas etapas",
          };
}
function Pe(e, a) {
  let s = je(e, a);
  return s.complete
    ? { key: "ativo", label: "Ativo" }
    : (s.password && s.filled >= 2) || s.password
      ? { key: "parcial", label: "Parcial" }
      : { key: "revisar", label: "Revisar" };
}
var Fe = {
    username: "",
    displayName: "",
    model: "",
    player: "",
    groupName: "",
    niche: "",
    loginEmail: "",
    recoveryEmail: "",
    phoneNumber: "",
    twoFactorMethod: "",
    emailTwoFactor: "",
    vaultReference: "",
    notes: "",
    loginPassword: "",
    emailPassword: "",
    lifecycle: "ativa",
  },
  Ie = {
    model: "",
    player: "",
    groupName: "",
    niche: "",
    priority: "",
    notes: "",
    loginEmail: "",
    recoveryEmail: "",
    phoneNumber: "",
    twoFactorMethod: "",
    emailTwoFactor: "",
    vaultReference: "",
    loginPassword: "",
    emailPassword: "",
    lifecycle: "",
  };
function Le({ status: e }) {
  let a =
    "Aguardando Meta" === e
      ? "aguardando-meta"
      : "Limite atingido" === e
        ? "limite-atingido"
        : e.toLowerCase();
  return (0, _.jsxs)("span", {
    className: `status-badge ${a}`,
    children: [(0, _.jsx)("i", {}), e],
  });
}
function Re(e) {
  return `${e.quotaUsed ?? 0}/${e.quotaTotal ?? 100}`;
}
function phaseOf(e) {
  return e
    ? "scheduled" === e.status
      ? (e.publishedCount || 0) > 0 ||
        (e.startAt && new Date(e.startAt).getTime() <= Date.now())
        ? { k: "running", n: "Em andamento" }
        : { k: "scheduled", n: "Agendada" }
      : {
          k: e.status,
          n:
            "draft" === e.status
              ? "Rascunho"
              : "paused" === e.status
                ? "Pausada"
                : "completed" === e.status
                  ? "Concluída"
                  : "cancelled" === e.status
                    ? "Encerrada"
                    : e.status,
        }
    : { k: "draft", n: "Rascunho" };
}
function phaseRank(e) {
  let a = phaseOf(e).k;
  return "running" === a
    ? 0
    : "scheduled" === a
      ? 1
      : "paused" === a
        ? 2
        : "draft" === a
          ? 3
          : "completed" === a
            ? 4
            : 5;
}
var ze = 200;
function Be(e) {
  if (Array.isArray(e)) return e.map((e) => String(e)).filter((e) => e.trim());
  try {
    let a = JSON.parse(e || "[]");
    return Array.isArray(a)
      ? a.map((e) => String(e)).filter((e) => e.trim())
      : [];
  } catch {
    return [];
  }
}
function Ve(e) {
  return (
    (e || "RF")
      .replace(/[^A-Za-z0-9À-ÿ]/g, "")
      .slice(0, 2)
      .toUpperCase() || "RF"
  );
}
function He({ name: e, url: a, className: s }) {
  return (0, _.jsx)("span", {
    className: s,
    children: a ? (0, _.jsx)("img", { src: a, alt: "" }) : Ve(e),
  });
}
function Ue(e) {
  return "owner" === e
    ? "Administrador"
    : "editor" === e
      ? "Editor"
      : "viewer" === e
        ? "Somente leitura"
        : "Operador";
}
function We(e) {
  return "Hoje" === e
    ? "Ranking de hoje"
    : "Ontem" === e
      ? "Ranking de ontem"
      : "Últimos 7 dias" === e
        ? "Ranking dos últimos 7 dias"
        : "Últimos 30 dias" === e
          ? "Ranking dos últimos 30 dias"
          : "Todo o período" === e
            ? "Ranking geral"
            : `Ranking de ${e}`;
}
function Ge({ users: e, periodLabel: a, onOpen: s, onSeePerformance: n }) {
  let [t, i] = (0, r.useState)(!1),
    l = t ? e : e.slice(0, 5);
  return (0, _.jsxs)("section", {
    className: "panel focus-panel ranking-panel",
    children: [
      (0, _.jsxs)("div", {
        className: "panel-heading ranking-heading",
        children: [
          (0, _.jsxs)("div", {
            children: [
              (0, _.jsx)("span", {
                className: "panel-kicker",
                children: We(a),
              }),
              (0, _.jsx)("h2", { children: "Usuários com mais publicações" }),
            ],
          }),
          (0, _.jsx)("button", {
            type: "button",
            className: "text-button",
            onClick: n,
            children: "Ver desempenho",
          }),
        ],
      }),
      l.length
        ? (0, _.jsx)("div", {
            className: "ranking-rows",
            children: l.map((e, a) => {
              let n = a + 1;
              return (0, _.jsxs)(
                "button",
                {
                  type: "button",
                  className: 1 === n ? "is-first" : "",
                  onClick: () => s(e),
                  children: [
                    (0, _.jsx)("span", {
                      className: "ranking-place " + (1 === n ? "gold" : ""),
                      children: String(n).padStart(2, "0"),
                    }),
                    (0, _.jsx)(He, {
                      name: e.name,
                      url: e.avatarUrl,
                      className: `ranking-face avatar ${e.color}`,
                    }),
                    (0, _.jsxs)("span", {
                      className: "ranking-who",
                      children: [
                        (0, _.jsxs)("strong", {
                          children: [
                            e.name,
                            e.isYou
                              ? (0, _.jsx)("i", { children: "você" })
                              : null,
                          ],
                        }),
                        (0, _.jsxs)("small", {
                          children: [e.accountCount, " conta(s)"],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("span", {
                      className: "ranking-score",
                      children: [
                        (0, _.jsx)("b", { children: me(e.posts) }),
                        (0, _.jsx)("em", { children: "POSTS" }),
                      ],
                    }),
                  ],
                },
                e.id,
              );
            }),
          })
        : (0, _.jsx)("div", {
            className: "focus-empty",
            children:
              "Nenhum usuário da ferramenta para ranquear ainda. Convide a equipe para abrir a disputa.",
          }),
      e.length > 5
        ? (0, _.jsx)("button", {
            type: "button",
            className: "ranking-more",
            onClick: () => i((e) => !e),
            children: t
              ? "Mostrar os 5 principais"
              : `Ver todos os ${e.length} usuários`,
          })
        : null,
    ],
  });
}
function Ke({ rows: e, onInspect: a }) {
  return (0, _.jsxs)("div", {
    className: "account-table-wrap",
    children: [
      (0, _.jsxs)("table", {
        className: "account-table",
        children: [
          (0, _.jsx)("thead", {
            children: (0, _.jsxs)("tr", {
              children: [
                (0, _.jsx)("th", { children: "Conta" }),
                (0, _.jsx)("th", { children: "Organização" }),
                (0, _.jsx)("th", { children: "Saúde" }),
                (0, _.jsx)("th", { children: "Posts no período" }),
                (0, _.jsx)("th", { children: "Na fila" }),
                (0, _.jsx)("th", { children: "Views no período" }),
                (0, _.jsx)("th", { children: "Prioridade" }),
                (0, _.jsx)("th", { "aria-label": "Ações" }),
              ],
            }),
          }),
          (0, _.jsx)("tbody", {
            children: e.map((e) =>
              (0, _.jsxs)(
                "tr",
                {
                  children: [
                    (0, _.jsx)("td", {
                      children: (0, _.jsxs)("div", {
                        className: "account-cell",
                        children: [
                          (0, _.jsx)("span", {
                            className: `avatar ${e.color}`,
                            children: e.initials,
                          }),
                          (0, _.jsxs)("span", {
                            children: [
                              (0, _.jsx)("strong", { children: e.handle }),
                              (0, _.jsx)("small", { children: e.name }),
                            ],
                          }),
                        ],
                      }),
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)("strong", {
                          className: "cell-main",
                          children: e.model,
                        }),
                        (0, _.jsx)("small", { children: e.player }),
                      ],
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)(Le, { status: e.status }),
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)("strong", {
                        className: "numeric",
                        children: e.posts,
                      }),
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)("strong", {
                        className: "numeric",
                        children: e.queue,
                      }),
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)("strong", {
                        className: "numeric",
                        children: e.views,
                      }),
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)("span", {
                        className: `priority ${e.priority.toLowerCase()}`,
                        children: e.priority,
                      }),
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)("button", {
                        className: "icon-button",
                        "aria-label": `Abrir ${e.handle}`,
                        onClick: () => a(e),
                        children: (0, _.jsx)(y, { name: "arrow" }),
                      }),
                    }),
                  ],
                },
                e.handle,
              ),
            ),
          }),
        ],
      }),
      0 === e.length &&
        (0, _.jsx)("div", {
          className: "empty-state",
          children: "Nenhuma conta encontrada com esses filtros.",
        }),
    ],
  });
}
function qe({
  rows: e,
  selected: a,
  onToggle: s,
  onToggleAll: n,
  onEdit: t,
  canEdit: i,
}) {
  let r = e.length > 0 && e.every((e) => a.includes(e.id));
  return (0, _.jsxs)("div", {
    className: "account-table-wrap",
    children: [
      (0, _.jsxs)("table", {
        className: "account-table management-table",
        children: [
          (0, _.jsx)("thead", {
            children: (0, _.jsxs)("tr", {
              children: [
                (0, _.jsx)("th", {
                  children:
                    i &&
                    (0, _.jsx)("input", {
                      type: "checkbox",
                      "aria-label": "Selecionar todas as contas filtradas",
                      checked: r,
                      onChange: n,
                    }),
                }),
                (0, _.jsx)("th", { children: "Conta" }),
                (0, _.jsx)("th", { children: "Organização" }),
                (0, _.jsx)("th", { children: "Grupo · nicho" }),
                (0, _.jsx)("th", { children: "Saúde" }),
                (0, _.jsx)("th", { children: "Limite Meta" }),
                (0, _.jsx)("th", { children: "Acessos 30d" }),
                (0, _.jsx)("th", { children: "Na fila" }),
                (0, _.jsx)("th", { children: "Views no período" }),
                (0, _.jsx)("th", { children: "Ações" }),
              ],
            }),
          }),
          (0, _.jsx)("tbody", {
            children: e.map((e, n) =>
              (0, _.jsxs)(
                "tr",
                {
                  className: a.includes(e.id) ? "selected-row" : "",
                  children: [
                    (0, _.jsx)("td", {
                      children:
                        i &&
                        (0, _.jsx)("input", {
                          type: "checkbox",
                          "aria-label": `Selecionar @${e.username}`,
                          checked: a.includes(e.id),
                          onChange: () => s(e.id),
                        }),
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsxs)("div", {
                        className: "account-cell",
                        children: [
                          (0, _.jsx)("span", {
                            className: `avatar ${["mint", "violet", "coral", "blue", "amber", "pink"][n % 6]}`,
                            children: e.username.slice(0, 2).toUpperCase(),
                          }),
                          (0, _.jsxs)("span", {
                            children: [
                              (0, _.jsxs)("strong", {
                                children: [
                                  "@",
                                  e.username,
                                ],
                              }),
                              (0, _.jsx)("small", {
                                children:
                                  "Conectada" === e.connectionStatus
                                    ? `${C(e.followersCount)} seguidores · ${C(e.followsCount || 0)} seguindo`
                                    : "Em apelação" === e.connectionStatus
                                      ? "Conexão removida · conta em apelação"
                                      : "murphy_csv" === e.source
                                        ? "Importada do Murphy · aguardando conexão"
                                        : "Cadastrada no cofre · sem Meta",
                              }),
                            ],
                          }),
                        ],
                      }),
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)("strong", {
                          className: "cell-main",
                          children: e.model,
                        }),
                        (0, _.jsx)("small", { children: e.player }),
                      ],
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)("strong", {
                          className: "cell-main",
                          children: e.groupName || "Sem grupo",
                        }),
                        (0, _.jsx)("small", {
                          children: e.niche || "Sem nicho",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)(Le, { status: Ce(e) }),
                        e.lastError && "Saudável" !== Ce(e)
                          ? (0, _.jsx)("small", { children: e.lastError })
                          : null,
                      ],
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)("strong", {
                          className:
                            "numeric quota-cell " +
                            ((e.quotaUsed ?? 0) >= (e.quotaTotal ?? 100)
                              ? "quota-full"
                              : (e.quotaUsed ?? 0) /
                                    Math.max(1, e.quotaTotal ?? 100) >=
                                  0.8
                                ? "quota-hot"
                                : ""),
                          children: Re(e),
                        }),
                        (0, _.jsxs)("small", {
                          children: [
                            e.published30d ?? 0,
                            " publicadas · ",
                            e.failed30d ?? 0,
                            " falhas",
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)("strong", {
                          className: "numeric",
                          children: C(e.profileViews30d || 0),
                        }),
                        (0, _.jsxs)("small", {
                          children: [
                            C(e.newFollowers30d || 0),
                            " novos seguidores",
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsx)("td", {
                      children: (0, _.jsx)("strong", {
                        className: "numeric",
                        children: e.queueCount,
                      }),
                    }),
                    (0, _.jsxs)("td", {
                      children: [
                        (0, _.jsx)("strong", {
                          className: "numeric",
                          children: C(e.views30d),
                        }),
                        (0, _.jsxs)("small", {
                          children: [C(e.reach30d), " alcançadas"],
                        }),
                      ],
                    }),
                    (0, _.jsx)("td", {
                      children: i
                        ? (0, _.jsx)("button", {
                            type: "button",
                            className: "outline-button compact-button",
                            onClick: () => t(e),
                            children: "Editar",
                          })
                        : (0, _.jsx)("button", {
                            type: "button",
                            className: "outline-button compact-button",
                            onClick: () => t(e),
                            children: "Ver",
                          }),
                    }),
                  ],
                },
                e.id,
              ),
            ),
          }),
        ],
      }),
      0 === e.length &&
        (0, _.jsx)("div", {
          className: "empty-state",
          children: "Nenhuma conta encontrada com esses filtros.",
        }),
    ],
  });
}
function Je() {
  return (0, r.useSyncExternalStore)(
    () => () => {},
    () => !0,
    () => !1,
  )
    ? (0, _.jsx)($e, {})
    : (0, _.jsx)("main", {
        className: "app-shell",
        children: (0, _.jsxs)("div", {
          className: "automation-empty",
          children: [
            (0, _.jsx)("strong", { children: "resolvflow" }),
            (0, _.jsx)("p", {
              children:
                "Carregando contas conectadas e a área Importar contas…",
            }),
          ],
        }),
      });
}
var Ye = 30;
function Xe(e) {
  return (Math.max(0, e) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function Ze(e) {
  let a = Math.max(5, Math.ceil(Math.max(0, e) / 100));
  return [...new Set([a, 20, 50, 100, 200].filter((e) => e >= a))].slice(0, 4);
}
function Qe({ canOperate: a }) {
  let [s, n] = (0, r.useState)(null),
    [t, i] = (0, r.useState)([]),
    [l, o] = (0, r.useState)("ig_gmail_otp"),
    [c, d] = (0, r.useState)(0),
    [m, u] = (0, r.useState)(1),
    [p, h] = (0, r.useState)(!1),
    [x, j] = (0, r.useState)(""),
    [g, v] = (0, r.useState)(""),
    [b, f] = (0, r.useState)([]),
    [N, C] = (0, r.useState)(null),
    [S, k] = (0, r.useState)(!1),
    [E, A] = (0, r.useState)(!1),
    [M, $] = (0, r.useState)("2,00"),
    [T, P] = (0, r.useState)("2,50"),
    [q, L] = (0, r.useState)("3,00"),
    [O, R] = (0, r.useState)("20,00"),
    [F, I] = (0, r.useState)(""),
    [U, B] = (0, r.useState)("20"),
    [V, G] = (0, r.useState)(20),
    [J, H] = (0, r.useState)("20"),
    [K, W] = (0, r.useState)(null),
    [X, Y] = (0, r.useState)(""),
    [pixDocument, setPixDocument] = (0, r.useState)(""),
    Z = b.find((e) => e.order_id === N) || null,
    Q = Z?.codes || [],
    ee = (0, r.useRef)(b),
    ae = (0, r.useRef)(N),
    se = (0, r.useRef)(!1);
  ((ee.current = b),
    (ae.current = N),
    (0, r.useEffect)(() => {
      try {
        localStorage.removeItem("resolvflow_otp_order");
      } catch {}
      A(!0);
    }, []));
  let ne = async (e, a) => {
      let s = await w("/api/otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: e, ...a }),
        }),
        n = await s.json();
      if (!s.ok) {
        let e = Error(n.error || "A API de e-mail recusou o pedido.");
        throw ((e.code = n.code), (e.status = s.status), e);
      }
      return n;
    },
    te = async () => {
      let e = await w("/api/otp/wallet", { cache: "no-store" });
      if (!e.ok) return;
      let a = await e.json();
      if ((n(a), a?.isPlatformAdmin || a?.isSelfSupply)) {
        ($((a.priceCents / 100).toFixed(2).replace(".", ",")),
          P((a.pricePriorityCents / 100).toFixed(2).replace(".", ",")),
          L((a.priceRushCents / 100).toFixed(2).replace(".", ",")),
          R((a.minDepositCents / 100).toFixed(2).replace(".", ",")));
        try {
          let e = await ne("products"),
            s = (
              Array.isArray(e) ? e : Array.isArray(e.products) ? e.products : []
            ).filter((e) => e?.slug && e?.name),
            n = s.filter((e) => {
              let a = `${e.slug} ${e.name} ${e.kind || ""}`.toLowerCase();
              return "account" !== e.kind && /gmail|otp|code/.test(a);
            }),
            t = n.length ? n : s.filter((e) => "account" !== e.kind),
            r = a.isPlatformAdmin
              ? t
              : t.filter((e) => "ig_gmail_otp" === e.slug);
          (i(r),
            o((e) =>
              a.isPlatformAdmin && r.some((a) => a.slug === e)
                ? e
                : "ig_gmail_otp",
            ));
        } catch {}
      } else if (a?.minDepositCents) {
        let e = Math.ceil(a.minDepositCents / 100);
        (H(String(e)), G(e));
      }
    };
  (0, r.useEffect)(() => {
    !E ||
      se.current ||
      ((se.current = !0),
      te(),
      (async () => {
        let e = await w("/api/otp/inbox", { cache: "no-store" });
        if (!e.ok) return;
        let a = await e.json(),
          s = Array.isArray(a.orders)
            ? a.orders.filter((e) => e?.order_id && e.email).slice(0, Ye)
            : [];
        f(s);
        let n = s.some((e) => e.order_id === a.activeId)
          ? a.activeId || s[0]?.order_id || null
          : s[0]?.order_id || null;
        C(n);
        let t = s.find((e) => e.order_id === n);
        k(!(!t || t.closed));
      })());
  }, [E]);
  let ie = async (e) => {
      if (a) {
        let documentDigits = pixDocument.replace(/\D/g, "");
        if (s?.pixRequiresDocument && ![11, 14].includes(documentDigits.length)) {
          v("Informe um CPF ou CNPJ válido para gerar o PIX.");
          return;
        }
        (h(!0), v(""), j(""));
        try {
          let a = await w("/api/otp/pix", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                amountCents: Math.round(100 * e),
                customerDocument: documentDigits,
              }),
            }),
            s = await a.json();
          if (!a.ok)
            throw Error(s.error || "Não foi possível gerar o pagamento.");
          if ("paid" === s.status)
            return (
              await te(),
              j("Pagamento confirmado. Saldo liberado."),
              void W(null)
            );
          (W({
            id: String(s.id),
            qrCode: String(s.qrCode || ""),
            ticketUrl: String(s.ticketUrl || ""),
            priceLabel: String(s.priceLabel || ""),
            gmailCount: Number(s.gmailCount) || 0,
            status: String(s.status || "pending"),
          }),
            j("PIX gerado. Paga e o saldo cai sozinho aqui."));
        } catch (e) {
          v(
            e instanceof Error
              ? e.message
              : "Não foi possível gerar o pagamento.",
          );
        } finally {
          h(!1);
        }
      }
    },
    re = async (e = m) => {
      if (!a) return;
      let s = Math.min(13, Math.max(1, Math.round(Number(e) || 1)));
      (h(!0), v(""), j(""));
      try {
        let e = await ne("order", { product: l, priorityMode: c, quantity: s }),
          a = (
            Array.isArray(e.orders) && e.orders.length ? e.orders : [e]
          ).filter((e) => e?.email && e?.order_id);
        if (!a.length) throw Error("A API devolveu um pedido sem e-mail.");
        let n = new Date().toISOString(),
          t = a.map((e) => ({ ...e, codes: [], closed: !1, savedAt: n }));
        (f((e) =>
          [
            ...t,
            ...e.filter((e) => !t.some((a) => a.order_id === e.order_id)),
          ].slice(0, Ye),
        ),
          C(t[0].order_id),
          k(!0),
          await te());
        let i = t.map((e) => e.email);
        try {
          await navigator.clipboard.writeText(i.join("\n"));
        } catch {}
        let r = e.charged_label
            ? "supplier" === e.billed
              ? `Cobrando no saldo da API (${e.charged_label}).`
              : `Debitou ${e.charged_label}.`
            : "",
          o = e.partial ? ` Estoque rendeu ${t.length} de ${s}.` : "";
        (v(""),
          j(
            1 === t.length
              ? `Gmail ${t[0].email} pronto. ${r} Cole no Instagram agora.`
              : `${t.length} Gmails prontos.${o} ${r} Copiados. A busca pega código em todos os abertos.`,
          ));
      } catch (e) {
        let a =
          e instanceof Error ? e.message : "Não foi possível pedir o e-mail.";
        (await te(),
          v(
            0 === c && /disponível agora|estoque|stock/i.test(a)
              ? `${a} Troca pra “Na hora” e tenta de novo — pega o primeiro Gmail que repor.`
              : a,
          ));
      } finally {
        h(!1);
      }
    };
  ((0, r.useEffect)(() => {
    if (!S) return;
    let e = !1,
      a = !1,
      s = async () => {
        if (!a && !e) {
          a = !0;
          try {
            let a = await ne("codes");
            if (e) return;
            let s = a.inbox,
              n = Array.isArray(s?.orders)
                ? s.orders.filter((e) => e?.order_id && e.email).slice(0, Ye)
                : [];
            if (n.length) {
              f(n);
              let e =
                (n.some((e) => e.order_id === s.activeId) && s.activeId) ||
                ae.current;
              e && C(e);
            }
            let t = (Array.isArray(a.results) ? a.results : [])
              .filter((e) => "ready" === e.status && e.code)
              .map((e) => ({ email: e.email, code: String(e.code).trim() }));
            if (1 === t.length) {
              j(`Código ${t[0].code} chegou em ${t[0].email}.`);
              try {
                await navigator.clipboard.writeText(t[0].code);
              } catch {}
            } else
              t.length > 1 &&
                j(
                  `${t.length} códigos chegaram. Copie o de cada Gmail na lista.`,
                );
          } catch (a) {
            if (!e) {
              let e =
                a instanceof Error ? a.message : "Falha ao buscar os códigos.";
              /fechou|unavailable/i.test(e) || v(e);
            }
          } finally {
            a = !1;
          }
        }
      };
    s();
    let n = window.setInterval(() => {
      s();
    }, 8e3);
    return () => {
      ((e = !0), window.clearInterval(n));
    };
  }, [S]),
    (0, r.useEffect)(() => {
      if (!K || "paid" === K.status) return;
      let e = !1,
        a = window.setInterval(() => {
          (async () => {
            try {
              let a = await w("/api/otp/pix", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "status", paymentId: K.id }),
              });
              if (!a.ok || e) return;
              "paid" === (await a.json()).status &&
                (W((e) => e && { ...e, status: "paid" }),
                await te(),
                j("PIX confirmado. Saldo liberado."));
            } catch {}
          })();
        }, 12e3);
      return () => {
        ((e = !0), window.clearInterval(a));
      };
    }, [K?.id, K?.status]),
    (0, r.useEffect)(() => {
      let a = "paid" === K?.status ? "" : K?.qrCode || "";
      if (!a) return void Y("");
      let s = !1;
      return (
        import("./lib-DqKbV2c7.js")
          .then((a) => e(a.default, 1))
          .then((e) =>
            e.toDataURL(a, {
              width: 280,
              margin: 1,
              errorCorrectionLevel: "M",
              color: { dark: "#111111", light: "#ffffff" },
            }),
          )
          .then((e) => {
            s || Y(e);
          })
          .catch(() => {
            s || Y("");
          }),
        () => {
          s = !0;
        }
      );
    }, [K?.qrCode, K?.status]));
  let le = async (e, a) => {
      try {
        (await navigator.clipboard.writeText(e), j(`${a} copiado.`));
      } catch {
        v("Não foi possível copiar.");
      }
    },
    oe = !0 === s?.isPlatformAdmin,
    ce = !0 === s?.isSelfSupply,
    de = oe || ce,
    me = s?.minDepositCents || 1500,
    ue = s?.minDepositLabel || Xe(me),
    pe = Ze(me),
    he = (t.find((e) => e.slug === l) || t[0])?.priority_options?.length
      ? (t.find((e) => e.slug === l) || t[0]).priority_options
      : [
          { mode: 0, seconds_earlier: 0, price: "preço da API" },
          { mode: 1, seconds_earlier: 30, price: "+25%" },
          { mode: 2, seconds_earlier: 60, price: "+50%" },
        ];
  return (0, _.jsxs)("div", {
    className: "content otp-page",
    children: [
      (0, _.jsxs)("div", {
        className: "page-heading",
        children: [
          (0, _.jsxs)("div", {
            children: [
              (0, _.jsxs)("span", {
                className: "eyebrow",
                children: [
                  (0, _.jsx)(y, { name: "spark", size: 14 }),
                  " Mini ferramenta",
                ],
              }),
              (0, _.jsx)("h1", { children: "Gmail OTP" }),
              (0, _.jsx)("p", {
                children: de
                  ? "O pedido vai direto na sua API e desconta o saldo do bot."
                  : "Pede o e-mail aqui, cola no Instagram e o código cai nesta tela. Cada Gmail desconta o saldo em real.",
              }),
            ],
          }),
          s &&
            (0, _.jsx)("span", {
              className: "date-pill",
              children: de
                ? null == s.supplierBalance
                  ? s.configured
                    ? "API ligada"
                    : "Cole a chave da API"
                  : `API ${s.supplierBalance} ${s.supplierCurrency || ""}`.trim()
                : `${s.balanceLabel} · ${s.gmailsLeft} Gmail`,
            }),
        ],
      }),
      (0, _.jsx)("div", {
        className: "otp-steps",
        children: de
          ? (0, _.jsxs)(_.Fragment, {
              children: [
                (0, _.jsxs)("article", {
                  children: [
                    (0, _.jsx)("b", { children: "1. API" }),
                    (0, _.jsx)("span", {
                      children: oe
                        ? "Usa a chave gravada no painel. Cobra o preço padrão do bot."
                        : "Usa a sua chave. Cobra o preço padrão do seu bot.",
                    }),
                  ],
                }),
                (0, _.jsxs)("article", {
                  children: [
                    (0, _.jsx)("b", { children: "2. Pedir Gmail" }),
                    (0, _.jsx)("span", {
                      children:
                        "Normal, 30s ou na hora — o valor sai do saldo da API.",
                    }),
                  ],
                }),
                (0, _.jsxs)("article", {
                  children: [
                    (0, _.jsx)("b", { children: "3. Código de novo" }),
                    (0, _.jsx)("span", {
                      children:
                        "A busca vigia o Gmail da vez e os anteriores, sem cobrar de novo.",
                    }),
                  ],
                }),
              ],
            })
          : (0, _.jsxs)(_.Fragment, {
              children: [
                (0, _.jsxs)("article", {
                  children: [
                    (0, _.jsx)("b", { children: "1. Saldo" }),
                    (0, _.jsxs)("span", {
                      children: ["Deposite no mínimo ", ue, " via PIX."],
                    }),
                  ],
                }),
                (0, _.jsxs)("article", {
                  children: [
                    (0, _.jsx)("b", { children: "2. Pedir Gmail" }),
                    (0, _.jsxs)("span", {
                      children: [
                        "Normal ",
                        s?.priceLabel || "R$ 2,00",
                        " · 30s ",
                        s?.pricePriorityLabel || "R$ 2,50",
                        " · na hora ",
                        s?.priceRushLabel || "R$ 3,00",
                        ".",
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("article", {
                  children: [
                    (0, _.jsx)("b", { children: "3. Código de novo" }),
                    (0, _.jsx)("span", {
                      children:
                        "A busca vigia o Gmail da vez e os anteriores. Código extra no mesmo e-mail não cobra de novo.",
                    }),
                  ],
                }),
              ],
            }),
      }),
      x &&
        (0, _.jsx)("div", {
          className: "operation-banner success",
          children: x,
        }),
      g &&
        (0, _.jsx)("div", { className: "operation-banner error", children: g }),
      oe &&
        (0, _.jsxs)("section", {
          className: "panel otp-setup",
          children: [
            (0, _.jsx)("div", {
              className: "panel-heading",
              children: (0, _.jsxs)("div", {
                children: [
                  (0, _.jsx)("span", {
                    className: "panel-kicker",
                    children: "Painel restrito",
                  }),
                  (0, _.jsx)("h2", {
                    children: "Preços dos usuários e integração",
                  }),
                ],
              }),
            }),
            (0, _.jsxs)("div", {
              className: "otp-price-grid",
              children: [
                (0, _.jsxs)("label", {
                  children: [
                    (0, _.jsx)("span", { children: "Normal (R$)" }),
                    (0, _.jsx)("input", {
                      value: M,
                      onChange: (e) => $(e.target.value),
                      inputMode: "decimal",
                    }),
                  ],
                }),
                (0, _.jsxs)("label", {
                  children: [
                    (0, _.jsx)("span", { children: "30s na frente (R$)" }),
                    (0, _.jsx)("input", {
                      value: T,
                      onChange: (e) => P(e.target.value),
                      inputMode: "decimal",
                    }),
                  ],
                }),
                (0, _.jsxs)("label", {
                  children: [
                    (0, _.jsx)("span", { children: "Na hora (R$)" }),
                    (0, _.jsx)("input", {
                      value: q,
                      onChange: (e) => L(e.target.value),
                      inputMode: "decimal",
                    }),
                  ],
                }),
              ],
            }),
            s?.pixRequiresDocument && (0, _.jsxs)("label", {
              children: [
                (0, _.jsx)("span", { children: "Depósito mínimo PIX (R$)" }),
                (0, _.jsx)("input", {
                  value: O,
                  onChange: (e) => R(e.target.value),
                  inputMode: "decimal",
                }),
                (0, _.jsx)("small", {
                  className: "field-help",
                  children:
                    "Vale para todas as contas. A operadora aceita a partir de R$ 5,00. Clique em Salvar depois de alterar.",
                }),
              ],
            }),
            (0, _.jsxs)("label", {
              className: "otp-key-field",
              children: [
                (0, _.jsx)("span", { children: "Chave do fornecedor" }),
                (0, _.jsx)("input", {
                  type: "password",
                  autoComplete: "off",
                  value: F,
                  onChange: (e) => I(e.target.value),
                  placeholder: "Cole para gravar",
                }),
              ],
            }),
            (0, _.jsx)("div", {
              className: "heading-actions",
              children: (0, _.jsx)("button", {
                type: "button",
                className: "primary-button",
                disabled: p,
                onClick: () => {
                  (async () => {
                    if (s?.isPlatformAdmin) {
                      (h(!0), v(""), j(""));
                      try {
                        let e = await w("/api/otp/settings", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              priceReais: M,
                              pricePriorityReais: T,
                              priceRushReais: q,
                              minDepositReais: O,
                              supplierKey: F.trim() || void 0,
                            }),
                          }),
                          a = await e.json();
                        if (!e.ok)
                          throw Error(a.error || "Não foi possível salvar.");
                        (I(""),
                          await te(),
                          j(
                            `Configuração salva. Depósito mínimo ${a.minDepositLabel || ""}.`,
                          ));
                      } catch (e) {
                        v(
                          e instanceof Error
                            ? e.message
                            : "Não foi possível salvar.",
                        );
                      } finally {
                        h(!1);
                      }
                    }
                  })();
                },
                children: p ? "Salvando…" : "Salvar",
              }),
            }),
            (0, _.jsxs)("div", {
              className: "otp-credit-row",
              children: [
                (0, _.jsxs)("label", {
                  children: [
                    (0, _.jsx)("span", {
                      children:
                        "Crédito manual na carteira desta operação (R$)",
                    }),
                    (0, _.jsx)("input", {
                      value: U,
                      onChange: (e) => B(e.target.value),
                      inputMode: "decimal",
                    }),
                  ],
                }),
                (0, _.jsx)("button", {
                  type: "button",
                  className: "outline-button",
                  disabled: p,
                  onClick: () => {
                    (async () => {
                      if (!s?.isPlatformAdmin) return;
                      let e = Number(U.replace(",", ".")),
                        a = Math.round(100 * e);
                      if (!Number.isFinite(a) || a < 100)
                        v("Informe um crédito em reais.");
                      else {
                        (h(!0), v(""), j(""));
                        try {
                          let e = await w("/api/otp/wallet", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({
                                action: "credit",
                                amountCents: a,
                              }),
                            }),
                            s = await e.json();
                          if (!e.ok)
                            throw Error(
                              s.error || "Não foi possível creditar.",
                            );
                          (await te(),
                            j(`Crédito adicionado. Saldo ${s.balanceLabel}.`));
                        } catch (e) {
                          v(
                            e instanceof Error
                              ? e.message
                              : "Não foi possível creditar.",
                          );
                        } finally {
                          h(!1);
                        }
                      }
                    })();
                  },
                  children: "Adicionar saldo",
                }),
              ],
            }),
          ],
        }),
      ce &&
        !oe &&
        (0, _.jsxs)("section", {
          className: "panel otp-setup",
          children: [
            (0, _.jsx)("div", {
              className: "panel-heading",
              children: (0, _.jsxs)("div", {
                children: [
                  (0, _.jsx)("span", {
                    className: "panel-kicker",
                    children: "Sua API",
                  }),
                  (0, _.jsx)("h2", { children: "Chave e saldo do bot" }),
                ],
              }),
            }),
            (0, _.jsx)("small", {
              className: "field-help",
              children: s?.hasOwnApiKey
                ? "Chave gravada. Pedidos usam o preço e o saldo da sua API, sem PIX da plataforma."
                : "Cole a chave do Instacaster desta operação. Não usa o saldo da Resolvflow.",
            }),
            (0, _.jsxs)("label", {
              className: "otp-key-field",
              children: [
                (0, _.jsx)("span", { children: "Chave da sua API" }),
                (0, _.jsx)("input", {
                  type: "password",
                  autoComplete: "off",
                  value: F,
                  onChange: (e) => I(e.target.value),
                  placeholder: s?.hasOwnApiKey
                    ? "Cole para trocar a chave"
                    : "Cole para gravar",
                }),
              ],
            }),
            (0, _.jsx)("div", {
              className: "heading-actions",
              children: (0, _.jsx)("button", {
                type: "button",
                className: "primary-button",
                disabled: p || !F.trim(),
                onClick: () => {
                  (async () => {
                    if (s?.isSelfSupply) {
                      (h(!0), v(""), j(""));
                      try {
                        let e = await w("/api/otp/wallet", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              action: "save_key",
                              supplierKey: F.trim(),
                            }),
                          }),
                          a = await e.json();
                        if (!e.ok)
                          throw Error(
                            a.error || "Não foi possível gravar a chave.",
                          );
                        (I(""),
                          await te(),
                          j(
                            "Chave da sua API gravada. Pedidos passam a descontar o saldo do seu bot.",
                          ));
                      } catch (e) {
                        v(
                          e instanceof Error
                            ? e.message
                            : "Não foi possível gravar a chave.",
                        );
                      } finally {
                        h(!1);
                      }
                    }
                  })();
                },
                children: p ? "Salvando…" : "Salvar chave",
              }),
            }),
          ],
        }),
      !de &&
        (0, _.jsxs)("section", {
          className: "panel otp-setup",
          children: [
            (0, _.jsxs)("div", {
              className: "panel-heading",
              children: [
                (0, _.jsxs)("div", {
                  children: [
                    (0, _.jsx)("span", {
                      className: "panel-kicker",
                      children: "Carteira",
                    }),
                    (0, _.jsx)("h2", { children: "Saldo em real" }),
                  ],
                }),
                s &&
                  (0, _.jsxs)("span", {
                    className: "date-pill",
                    children: [s.gmailsLeft, " pedido(s)"],
                  }),
              ],
            }),
            (0, _.jsx)("p", {
              className: "otp-balance",
              children: s ? s.balanceLabel : "Carregando…",
            }),
            (0, _.jsx)("small", {
              className: "field-help",
              children: s?.configured
                ? `Normal ${s.priceLabel}. Depósito mínimo ${s.minDepositLabel}. Código no mesmo e-mail não cobra de novo.`
                : "Serviço de e-mail ainda não está disponível.",
            }),
            (0, _.jsxs)("label", {
              className: "otp-pix-document",
              children: [
                (0, _.jsx)("span", { children: "CPF ou CNPJ do pagador" }),
                (0, _.jsx)("input", {
                  value: pixDocument,
                  onChange: (e) => setPixDocument(e.target.value),
                  inputMode: "numeric",
                  autoComplete: "off",
                  placeholder: "Somente números",
                  maxLength: 18,
                }),
                (0, _.jsx)("small", {
                  className: "field-help",
                  children: "A operadora exige este dado para emitir a cobrança. Ele não é salvo pela Resolvflow.",
                }),
              ],
            }),
            (0, _.jsx)("div", {
              className: "otp-pix-packs",
              children: pe.map((e) =>
                (0, _.jsx)(
                  "button",
                  {
                    type: "button",
                    className: V === e ? "primary-button" : "outline-button",
                    disabled: !a || p,
                    onClick: () => {
                      (G(e), H(String(e)), ie(e));
                    },
                    children: Xe(100 * e),
                  },
                  e,
                ),
              ),
            }),
            (0, _.jsxs)("div", {
              className: "otp-credit-row",
              children: [
                (0, _.jsxs)("label", {
                  children: [
                    (0, _.jsxs)("span", {
                      children: ["Outro valor (mínimo ", ue, ")"],
                    }),
                    (0, _.jsx)("input", {
                      value: J,
                      onChange: (e) => H(e.target.value),
                      inputMode: "decimal",
                    }),
                  ],
                }),
                (0, _.jsx)("button", {
                  type: "button",
                  className: "primary-button",
                  disabled: !a || p,
                  onClick: () => {
                    let e = Number(String(J).replace(",", "."));
                    !Number.isFinite(e) || 100 * e < me
                      ? v(`Depósito mínimo ${ue}.`)
                      : (G(e), ie(e));
                  },
                  children: s?.pixEnabled ? "Gerar PIX" : "Depositar",
                }),
              ],
            }),
            !s?.pixEnabled &&
              (0, _.jsx)("small", {
                className: "field-help",
                children:
                  "PIX ainda não está disponível. Avise o administrador.",
              }),
            K &&
              "paid" !== K.status &&
              (0, _.jsxs)("div", {
                className: "otp-pix-box",
                children: [
                  (0, _.jsxs)("strong", { children: ["PIX ", K.priceLabel] }),
                  (0, _.jsxs)("div", {
                    className: "otp-pix-pay",
                    children: [
                      X
                        ? (0, _.jsxs)("figure", {
                            className: "otp-pix-qr",
                            children: [
                              (0, _.jsx)("img", {
                                src: X,
                                alt: "QR Code PIX",
                                width: 220,
                                height: 220,
                              }),
                              (0, _.jsx)("figcaption", {
                                children: "Aponte a câmera do celular",
                              }),
                            ],
                          })
                        : null,
                      (0, _.jsxs)("div", {
                        className: "otp-pix-copy",
                        children: [
                          (0, _.jsx)("textarea", {
                            readOnly: !0,
                            rows: 4,
                            value: K.qrCode,
                          }),
                          (0, _.jsxs)("div", {
                            className: "heading-actions",
                            children: [
                              (0, _.jsx)("button", {
                                type: "button",
                                className: "primary-button",
                                onClick: () => {
                                  le(K.qrCode, "PIX");
                                },
                                children: "Copiar PIX",
                              }),
                              K.ticketUrl
                                ? (0, _.jsx)("a", {
                                    className: "outline-button",
                                    href: K.ticketUrl,
                                    target: "_blank",
                                    rel: "noreferrer",
                                    children: "Abrir no banco",
                                  })
                                : null,
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  (0, _.jsx)("small", {
                    children:
                      "Expira em cerca de 30 minutos. Esta tela confirma sozinha quando cair.",
                  }),
                ],
              }),
          ],
        }),
      (0, _.jsxs)("section", {
        className: "panel otp-order",
        children: [
          (0, _.jsx)("div", {
            className: "panel-heading",
            children: (0, _.jsxs)("div", {
              children: [
                (0, _.jsx)("span", {
                  className: "panel-kicker",
                  children: "Pedido",
                }),
                (0, _.jsx)("h2", { children: "Pedir e-mail" }),
              ],
            }),
          }),
          oe &&
            (0, _.jsxs)("div", {
              className: "otp-products",
              children: [
                (0, _.jsx)("span", { children: "Tipo de Gmail da API" }),
                (0, _.jsx)("div", {
                  children: (t.length
                    ? t
                    : [
                        {
                          slug: "ig_gmail_otp",
                          name: "Instagram Gmail OTP",
                          kind: "code",
                          price: "preço da API",
                        },
                      ]
                  ).map((e) =>
                    (0, _.jsxs)(
                      "button",
                      {
                        type: "button",
                        className:
                          l === e.slug ? "primary-button" : "outline-button",
                        onClick: () => {
                          (o(e.slug), d(0));
                        },
                        disabled: !a || p,
                        children: [
                          (0, _.jsx)("b", { children: e.name }),
                          (0, _.jsx)("small", { children: e.price || e.slug }),
                        ],
                      },
                      e.slug,
                    ),
                  ),
                }),
              ],
            }),
          (0, _.jsxs)("div", {
            className: "otp-priority",
            children: [
              (0, _.jsx)("span", { children: "Quando pegar o e-mail" }),
              (0, _.jsx)("div", {
                children: (de
                  ? he.map((e) => ({
                      mode: e.mode,
                      label:
                        2 === e.mode
                          ? "Na hora"
                          : 1 === e.mode
                            ? "30s na frente"
                            : "Normal",
                      price: e.price,
                    }))
                  : [
                      { mode: 0, label: "Normal", price: s?.priceLabel },
                      {
                        mode: 1,
                        label: "30s na frente",
                        price: s?.pricePriorityLabel,
                      },
                      { mode: 2, label: "Na hora", price: s?.priceRushLabel },
                    ]
                ).map((e) =>
                  (0, _.jsxs)(
                    "button",
                    {
                      type: "button",
                      className:
                        c === e.mode ? "primary-button" : "outline-button",
                      onClick: () => d(e.mode),
                      disabled: !a || p,
                      children: [
                        (0, _.jsx)("b", { children: e.label }),
                        (0, _.jsx)("small", { children: e.price || "" }),
                      ],
                    },
                    e.mode,
                  ),
                ),
              }),
            ],
          }),
          (0, _.jsxs)("div", {
            className: "otp-qty-row",
            children: [
              (0, _.jsxs)("label", {
                children: [
                  (0, _.jsx)("span", { children: "Quantidade" }),
                  (0, _.jsx)("input", {
                    type: "number",
                    min: 1,
                    max: 13,
                    value: m,
                    disabled: !a || p,
                    onChange: (e) =>
                      u(Math.min(13, Math.max(1, Number(e.target.value) || 1))),
                  }),
                ],
              }),
              (0, _.jsx)("button", {
                type: "button",
                className: "primary-button",
                disabled: !a || p || !s?.configured,
                onClick: () => {
                  re();
                },
                children: p
                  ? m > 1
                    ? `Pedindo ${m}…`
                    : "Pedindo…"
                  : de
                    ? m > 1
                      ? `Pedir ${m} e-mails`
                      : 0 === c
                        ? "Pedir e-mail agora"
                        : "Pedir na prioridade"
                    : `Pedir ${m > 1 ? `${m} e-mails` : "e-mail"} · ${Xe(((2 === c ? s?.priceRushCents : 1 === c ? s?.pricePriorityCents : s?.priceCents) || 0) * m)}`,
              }),
            ],
          }),
          (0, _.jsx)("small", {
            className: "field-help",
            children: de
              ? "Cobra o preço padrão da API no saldo do bot. Código extra no mesmo e-mail não cobra de novo."
              : "Se não tiver estoque, o saldo volta. Código extra no mesmo e-mail não cobra de novo.",
          }),
        ],
      }),
      Z &&
        (0, _.jsxs)("section", {
          className: "panel otp-live",
          children: [
            (0, _.jsxs)("div", {
              className: "panel-heading",
              children: [
                (0, _.jsxs)("div", {
                  children: [
                    (0, _.jsx)("span", {
                      className: "panel-kicker",
                      children: Z.closed
                        ? "Este Gmail fechou"
                        : "Use este e-mail",
                    }),
                    (0, _.jsx)("h2", { children: "Gmail da vez" }),
                  ],
                }),
                (0, _.jsx)("button", {
                  className: "text-button",
                  onClick: () => {
                    le(Z.email, "E-mail");
                  },
                  children: "Copiar e-mail",
                }),
              ],
            }),
            (0, _.jsx)("p", { className: "otp-email", children: Z.email }),
            (0, _.jsxs)("small", {
              children: [
                "Pedido ",
                Z.order_id,
                ". Este mesmo e-mail recebe os próximos códigos sem cobrar de novo, até a API avisar que fechou. A API mostra cada código uma vez — a Resolv guarda na lista.",
              ],
            }),
            (0, _.jsx)("div", {
              className: "otp-codes",
              children: Q.length
                ? Q.map((e) =>
                    (0, _.jsxs)(
                      "article",
                      {
                        children: [
                          (0, _.jsx)("b", { children: e.code }),
                          (0, _.jsx)("button", {
                            className: "primary-button",
                            onClick: () => {
                              le(e.code, "Código");
                            },
                            children: "Copiar código",
                          }),
                          (0, _.jsx)("small", {
                            children: new Date(e.at).toLocaleTimeString(
                              "pt-BR",
                            ),
                          }),
                        ],
                      },
                      `${e.code}-${e.at}`,
                    ),
                  )
                : (0, _.jsx)("p", {
                    className: "otp-wait " + (S && !Z.closed ? "pulse" : ""),
                    children: Z.closed
                      ? "Este Gmail não recebe mais código."
                      : S
                        ? "Aguardando o código chegar neste Gmail e nos anteriores abertos…"
                        : "Busca pausada.",
                  }),
            }),
            (0, _.jsxs)("div", {
              className: "heading-actions",
              children: [
                (0, _.jsx)("button", {
                  className: "outline-button",
                  disabled: Z.closed,
                  onClick: () => k((e) => !e),
                  children: S ? "Pausar busca" : "Continuar buscando",
                }),
                (0, _.jsx)("button", {
                  className: "outline-button",
                  disabled: !a || p,
                  onClick: () => {
                    re(1);
                  },
                  children: "Pedir outro Gmail",
                }),
              ],
            }),
          ],
        }),
      b.length > 0 &&
        (0, _.jsxs)("section", {
          className: "panel otp-history",
          children: [
            (0, _.jsxs)("div", {
              className: "panel-heading",
              children: [
                (0, _.jsxs)("div", {
                  children: [
                    (0, _.jsx)("span", {
                      className: "panel-kicker",
                      children: "Histórico desta conta",
                    }),
                    (0, _.jsx)("h2", { children: "Gmails anteriores" }),
                  ],
                }),
                (0, _.jsxs)("span", {
                  className: "date-pill",
                  children: [b.length, " e-mail(s)"],
                }),
              ],
            }),
            (0, _.jsx)("small", {
              className: "field-help",
              children:
                "A busca pega código em todos os Gmails abertos ao mesmo tempo. Copie o código de cada um.",
            }),
            (0, _.jsx)("div", {
              className: "otp-history-list",
              children: b.map((e) =>
                (0, _.jsxs)(
                  "article",
                  {
                    className: `${e.order_id === N ? "active" : ""} ${e.closed ? "closed" : ""}`,
                    children: [
                      (0, _.jsxs)("span", {
                        children: [
                          (0, _.jsx)("strong", { children: e.email }),
                          (0, _.jsxs)("small", {
                            children: [
                              e.closed
                                ? "Fechou na API"
                                : e.codes[0]
                                  ? `Código às ${new Date(e.codes[0].at || e.savedAt).toLocaleTimeString("pt-BR")}`
                                  : "Aguardando código",
                              " · ",
                              new Date(e.savedAt).toLocaleString("pt-BR"),
                            ],
                          }),
                        ],
                      }),
                      e.codes[0]
                        ? (0, _.jsxs)("div", {
                            className: "otp-history-code",
                            children: [
                              (0, _.jsx)("b", { children: e.codes[0].code }),
                              (0, _.jsx)("button", {
                                type: "button",
                                className: "primary-button",
                                onClick: () => {
                                  le(e.codes[0].code, "Código");
                                },
                                children: "Copiar",
                              }),
                            ],
                          })
                        : (0, _.jsx)("span", {
                            className:
                              "otp-wait " + (S && !e.closed ? "pulse" : ""),
                            children: e.closed
                              ? "Fechado"
                              : S
                                ? "Buscando…"
                                : "Pausado",
                          }),
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "outline-button",
                        onClick: () =>
                          ((e) => {
                            (C(e.order_id),
                              v(""),
                              e.closed || k(!0),
                              le(e.email, "E-mail"),
                              j(
                                e.closed
                                  ? `Este Gmail já fechou na API. ${e.email}`
                                  : `Voltando para ${e.email}. A busca pega código neste e também nos outros abertos.`,
                              ),
                              w("/api/otp/inbox", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  action: "select",
                                  orderId: e.order_id,
                                }),
                              }));
                          })(e),
                        children:
                          e.order_id === N ? "Buscando neste" : "Usar de novo",
                      }),
                    ],
                  },
                  e.order_id,
                ),
              ),
            }),
          ],
        }),
    ],
  });
}
function $e() {
  let [e, a] = (0, r.useState)(() => "dashboard"),
    s = (e, s = !1) => {
      a(e);
    },
    [n, t] = (0, r.useState)(!1),
    [i, l] = (0, r.useState)(() => !1),
    [o, c] = (0, r.useState)(() => le),
    [d, u] = (0, r.useState)(!1),
    [p, x] = (0, r.useState)(""),
    [j, v] = (0, r.useState)("Todas"),
    [f, N] = (0, r.useState)(!1),
    [S, k] = (0, r.useState)(null),
    [E, A] = (0, r.useState)(""),
    [M, $] = (0, r.useState)("idle"),
    [P, q] = (0, r.useState)(""),
    [L, O] = (0, r.useState)([]),
    [R, F] = (0, r.useState)([]),
    [I, z] = (0, r.useState)(""),
    [D, U] = (0, r.useState)([]),
    [B, V] = (0, r.useState)([]),
    [G, J] = (0, r.useState)(!1),
    [H, K] = (0, r.useState)(!0),
    [W, X] = (0, r.useState)(""),
    [Y, Z] = (0, r.useState)([]),
    [Q, ee] = (0, r.useState)("Todos"),
    [ne, re] = (0, r.useState)("Todos"),
    [me, $e] = (0, r.useState)("Todos"),
    [Ve, Je] = (0, r.useState)("Todas"),
    [We, Xe] = (0, r.useState)("recent"),
    [Ye, Ze] = (0, r.useState)(!1),
    [ea, aa] = (0, r.useState)("bulk"),
    [sa, na] = (0, r.useState)(Ie),
    [ta, ia] = (0, r.useState)({
      configured: !1,
      facebookConfigured: !1,
      connections: [],
    }),
    [ra, la] = (0, r.useState)({
      quarantine: !1,
      publishingEnabled: !0,
      connectionEnabled: !0,
      message: "Carregando o estado operacional…",
    }),
    [oa, ca] = (0, r.useState)(null),
    [da, ma] = (0, r.useState)(null),
    [ua, pa] = (0, r.useState)([]),
    [ha, xa] = (0, r.useState)(null),
    [dashboardScope, setDashboardScope] = (0, r.useState)("workspace"),
    [platformAccounts, setPlatformAccounts] = (0, r.useState)([]),
    [_a, ja] = (0, r.useState)(null),
    [ga, va] = (0, r.useState)(""),
    [ba, fa] = (0, r.useState)(""),
    [ya, Na] = (0, r.useState)(""),
    [wa, Ca] = (0, r.useState)("editor"),
    [Sa, ka] = (0, r.useState)("independent"),
    [Ea, Aa] = (0, r.useState)("all"),
    [Ma, $a] = (0, r.useState)(null),
    [Ta, Pa] = (0, r.useState)(""),
    [qa, La] = (0, r.useState)("editor"),
    [Oa, Ra] = (0, r.useState)(""),
    [Fa, Ia] = (0, r.useState)(!1),
    [za, Da] = (0, r.useState)("todas"),
    [Ua, Ba] = (0, r.useState)(""),
    [Va, Ga] = (0, r.useState)("none"),
    [Ja, Ha] = (0, r.useState)("Todos"),
    [Ka, Wa] = (0, r.useState)({}),
    [Xa, Ya] = (0, r.useState)({}),
    [Za, Qa] = (0, r.useState)({}),
    [es, as] = (0, r.useState)({}),
    [ss, ns] = (0, r.useState)({}),
    [ts, is] = (0, r.useState)(null),
    [rs, ls] = (0, r.useState)(!1),
    [os, cs] = (0, r.useState)(!1),
    [ds, ms] = (0, r.useState)(""),
    [us, ps] = (0, r.useState)("overview"),
    [hs, xs] = (0, r.useState)(Fe),
    [_s, js] = (0, r.useState)(""),
    [gs, vs] = (0, r.useState)(""),
    [bs, fs] = (0, r.useState)(!1),
    [ys, Ns] = (0, r.useState)(""),
    [ws, Cs] = (0, r.useState)(!0),
    [Ss, ks] = (0, r.useState)(!0),
    [Es, As] = (0, r.useState)(!0),
    [Ms, $s] = (0, r.useState)(""),
    [Ts, Ps] = (0, r.useState)(""),
    [qs, Ls] = (0, r.useState)(!1),
    [Os, Rs] = (0, r.useState)(""),
    [Fs, Is] = (0, r.useState)(!1),
    zs = (0, r.useRef)(null),
    [Ds, Us] = (0, r.useState)("priority"),
    Bs = null !== ha && "viewer" !== ha.currentUser.role,
    [Vs, Gs] = (0, r.useState)(!1),
    [Js, Hs] = (0, r.useState)(null),
    [Ks, Ws] = (0, r.useState)({
      name: "",
      caption: "",
      captionVariations: [],
      hashtags: "",
      shareToFeed: !1,
    }),
    [Xs, Ys] = (0, r.useState)([]),
    [Zs, Qs] = (0, r.useState)(null),
    [en, an] = (0, r.useState)(pe()),
    [sn, nn] = (0, r.useState)(""),
    [tn, rn] = (0, r.useState)(60),
    [ln, on] = (0, r.useState)("per_account_shared"),
    [cn, dn] = (0, r.useState)({}),
    [mn, un] = (0, r.useState)(1),
    [pn, hn] = (0, r.useState)("all_accounts"),
    [xn, _n] = (0, r.useState)("random"),
    [jn, gn] = (0, r.useState)(!0),
    [vn, bn] = (0, r.useState)([]),
    [fn, yn] = (0, r.useState)(() => "idle"),
    [Nn, wn] = (0, r.useState)(!1),
    [Cn, Sn] = (0, r.useState)(() => ""),
    [kn, En] = (0, r.useState)({
      name: "",
      mediaType: "IMAGE",
      metaApiVersion: "",
      caption: "",
      hashtags: "",
      shareToFeed: !1,
    }),
    [An, Mn] = (0, r.useState)([]),
    [$n, Tn] = (0, r.useState)(6),
    [Pn, qn] = (0, r.useState)({}),
    [Ln, On] = (0, r.useState)(!1),
    [Rn, Fn] = (0, r.useState)([]),
    [In, zn] = (0, r.useState)([]),
    [Dn, Un] = (0, r.useState)({ completed: 0, total: 0 }),
    [Bn, Vn] = (0, r.useState)(!1),
    [Gn, Jn] = (0, r.useState)(7),
    [Hn, Kn] = (0, r.useState)("static"),
    [Wn, Xn] = (0, r.useState)(() => "news"),
    [Yn, Zn] = (0, r.useState)(""),
    [Qn, et] = (0, r.useState)("Veja mais no perfil"),
    [at, st] = (0, r.useState)({}),
    [nt, tt] = (0, r.useState)(""),
    [it, rt] = (0, r.useState)(!1),
    [lt, ot] = (0, r.useState)(null),
    [ct, dt] = (0, r.useState)(35),
    [mt, ut] = (0, r.useState)(100),
    [pt, ht] = (0, r.useState)(0),
    [xt, _t] = (0, r.useState)(1),
    [jt, gt] = (0, r.useState)(!0),
    [vt, bt] = (0, r.useState)(""),
    [ft, yt] = (0, r.useState)({
      current: 0,
      total: 0,
      progress: 0,
      fileName: "",
    }),
    Nt = (0, r.useRef)(null),
    [wt, Ct] = (0, r.useState)("Todos"),
    [St, kt] = (0, r.useState)("Todos"),
    [Et, At] = (0, r.useState)("Todos"),
    [Mt, $t] = (0, r.useState)(""),
    [Tt, Pt] = (0, r.useState)("live"),
    [qt, Lt] = (0, r.useState)("scheduled_asc"),
    [Ot, Rt] = (0, r.useState)({ live: 0, published: 0, failed: 0, paused: 0 }),
    [Ft, It] = (0, r.useState)([]),
    [zt, Dt] = (0, r.useState)(1),
    [Ut, Bt] = (0, r.useState)(""),
    [Vt, Gt] = (0, r.useState)("Todos"),
    [Jt, Ht] = (0, r.useState)("Todos"),
    [Kt, Wt] = (0, r.useState)("recent"),
    [Xt, Yt] = (0, r.useState)("Todas"),
    [Zt, Qt] = (0, r.useState)("Todos"),
    [ei, ai] = (0, r.useState)(""),
    [si, ni] = (0, r.useState)("Todos"),
    [ti, ii] = (0, r.useState)("views"),
    [ri, li] = (0, r.useState)(""),
    [oi, ci] = (0, r.useState)("views"),
    [di, mi] = (0, r.useState)("30d"),
    [ui, pi] = (0, r.useState)(ye()),
    [hi, xi] = (0, r.useState)(null),
    [_i, ji] = (0, r.useState)(pe()),
    [gi, vi] = (0, r.useState)([]),
    [bi, fi] = (0, r.useState)(null),
    yi = (0, r.useMemo)(() => be(di, ui), [di, ui]),
    Ni = (0, r.useMemo)(
      () =>
        "dashboard" === e && "platform" === dashboardScope
          ? platformAccounts
          : B,
      [B, platformAccounts, dashboardScope, e],
    ),
    wi = (0, r.useMemo)(
      () =>
        B.filter(
          (e) => "Conectada" === e.connectionStatus && "caida" !== e.lifecycle,
        ),
      [B],
    ),
    Ci = new Intl.DateTimeFormat("en", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()),
    Si = `${Ci.find((e) => "year" === e.type)?.value}-${Ci.find((e) => "month" === e.type)?.value}-${Ci.find((e) => "day" === e.type)?.value}`,
    ki = (0, r.useMemo)(
      () => new Map((bi?.perAccount ?? []).map((e) => [e.id, e])),
      [bi],
    ),
    Ei = Ft.length ? Ft : D,
    Ai = (0, r.useMemo)(
      () => Ei.filter((e) => xe(e.scheduledFor, yi)),
      [Ei, yi],
    ),
    Mi = (0, r.useMemo)(
      () =>
        Ei.filter(
          (e) =>
            [
              "pending",
              "retry",
              "container_created",
              "processing",
              "paused",
            ].includes(e.status) &&
            new Date(e.scheduledFor).getTime() >= Date.now(),
        ),
      [Ei],
    ),
    $i = (0, r.useMemo)(
      () =>
        Ni.map((e) => {
          let a = ki.get(e.id);
          return a
            ? {
                ...e,
                views30d: a.views30d || 0,
                reach30d: a.reach30d || 0,
                published30d: a.published,
                failed30d: a.failed,
              }
            : e;
        }),
      [Ni, ki],
    ),
    Ti = (0, r.useMemo)(
      () =>
        $i.map((e, a) => ({
          handle: `@${e.username}`,
          name: e.displayName || e.username,
          initials: e.username.slice(0, 2).toUpperCase(),
          color: ["mint", "violet", "coral", "blue", "amber", "pink"][a % 6],
          model: e.model,
          player: e.player,
          status: Ce(e),
          posts: (() => {
            let a = ki.get(e.id);
            return a
              ? a.published || 0
              : ("today" === di && e.postsTodayDate === Si && e.postsToday) ||
                  0;
          })(),
          queue: Ai.filter(
            (a) =>
              a.accountId === e.id &&
              [
                "pending",
                "retry",
                "container_created",
                "paused",
                "blocked",
              ].includes(a.status),
          ).length,
          views: C(e.views30d),
          priority: ["Alta", "Média", "Normal"].includes(e.priority)
            ? e.priority
            : "Normal",
        })),
      [$i, Si, ki, Ai, di],
    ),
    Pi = (0, r.useMemo)(
      () =>
        [...Ti]
          .sort((e, a) =>
            "performance" === Ds
              ? ($i.find((e) => `@${e.username}` === a.handle)?.views30d || 0) -
                ($i.find((a) => `@${a.username}` === e.handle)?.views30d || 0)
              : { Alta: 3, Média: 2, Normal: 1 }[a.priority] -
                  { Alta: 3, Média: 2, Normal: 1 }[e.priority] ||
                a.queue - e.queue,
          )
          .slice(0, 4),
      [Ti, $i, Ds],
    ),
    qi = (0, r.useMemo)(
      () =>
        $i
          .filter(
            (e) =>
              `${e.username} ${e.displayName || ""} ${e.model} ${e.player} ${e.groupName || ""} ${e.niche || ""}`
                .toLowerCase()
                .includes(p.toLowerCase()) &&
              ("Todas" === j || Ce(e) === j) &&
              ("Todos" === Q || e.model === Q) &&
              ("Todos" === ne || e.player === ne) &&
              ("Todos" === me || (e.groupName || "Sem grupo") === me) &&
              ("Todas" === Ve || e.priority === Ve) &&
              ("all" === Ea || e.metaAppKey === Ea),
          )
          .sort((e, a) =>
            "views" === We
              ? a.views30d - e.views30d
              : "followers" === We
                ? a.followersCount - e.followersCount
                : String(a.createdAt || "").localeCompare(
                    String(e.createdAt || ""),
                  ),
          ),
      [$i, p, j, Q, ne, me, Ve, We, Ea],
    ),
    Li = (0, r.useMemo)(
      () => ({
        Saudável: Ti.filter((e) => "Saudável" === e.status).length,
        Restrita: Ti.filter((e) => "Restrita" === e.status).length,
        Suspensa: Ti.filter((e) => "Suspensa" === e.status).length,
        Desconectada: Ti.filter((e) => "Desconectada" === e.status).length,
        "Aguardando Meta": Ti.filter((e) => "Aguardando Meta" === e.status)
          .length,
        "Limite atingido": Ti.filter((e) => "Limite atingido" === e.status)
          .length,
      }),
      [Ti],
    ),
    Oi = bi?.totals.published ?? Ti.reduce((e, a) => e + a.posts, 0),
    Ri = $i.reduce((e, a) => e + (a.queueCount || 0), 0),
    Fi = bi?.totals.views30d ?? 0,
    Ii = bi?.totals.reach30d ?? 0,
    zi = (0, r.useMemo)(
      () =>
        Ni.reduce((e, a) => {
          let s = a.lastSyncAt;
          return s && (!e || new Date(s).getTime() > new Date(e).getTime())
            ? s
            : e;
        }, null),
      [Ni],
    ),
    Di = Ni.reduce((e, a) => e + a.followersCount, 0),
    Ui = Ni.filter((e) => "Sem modelo" === e.model).length,
    Bi = new Date().getHours(),
    Vi = Bi < 12 ? "Bom dia" : Bi < 18 ? "Boa tarde" : "Boa noite",
    Gi = (e) =>
      "connected" === e
        ? {
            label: "Contas conectadas",
            value: String(
              $i.filter((e) => "Conectada" === e.connectionStatus).length,
            ),
            note: `${$i.filter((e) => "Conectada" === e.connectionStatus && "Saudável" === Ce(e)).length} contas saudáveis`,
            icon: "users",
            go: "accounts",
          }
        : "published" === e
          ? {
              label: `Publicações · ${yi.label}`,
              value: String(Oi),
              note: "Publicações reais no período",
              icon: "campaign",
            }
          : "queue" === e
            ? {
                label: "Conteúdos na fila",
                value: String(Ri),
                note: `Média de ${Ti.length ? (Ri / Ti.length).toFixed(1) : "0"} por conta`,
                icon: "queue",
                go: "queue",
              }
            : "views" === e
              ? {
                  label: `Visualizações · ${yi.label}`,
                  value: C(Fi),
                  note: "Soma dos vídeos publicados neste período",
                  icon: "spark",
                }
              : "reach" === e
                ? {
                    label: `Alcance · ${yi.label}`,
                    value: C(Ii),
                    note: "Alcance dos vídeos publicados neste período",
                    icon: "campaign",
                  }
                : "followers" === e
                  ? {
                      label: "Seguidores",
                      value: C(Di),
                      note: `Última leitura da Meta · ${ve(zi)}`,
                      icon: "users",
                    }
                  : "alerts" === e
                    ? {
                        label: "Alertas no período",
                        value: String(Tr.length),
                        note: `${Tr.filter((e) => "critical" === e.severity).length} críticos`,
                        icon: "bell",
                        go: "alerts",
                      }
                    : {
                        label: "Taxa de sucesso",
                        value: `${bi?.totals.successRate ?? 0}%`,
                        note: "Publicações concluídas no período",
                        icon: "check",
                      },
    Ji =
      !0 === ha?.currentUser.canSeeRanking ||
      !0 === ha?.currentUser.isPlatformAdmin,
    Hi = (e) => {
      let a = e.filter((e) => Ji || "focus" !== e);
      if (!Ji || a.includes("focus")) return a;
      let s = a.indexOf("metrics"),
        n = [...a];
      return (n.splice(s < 0 ? 0 : s + 1, 0, "focus"), n);
    },
    Ki = Hi(o.widgets).filter((e) => !o.hidden.includes(e)),
    Wi = Hi(o.widgets),
    Xi = Math.max(Ti.length, 1),
    Yi = { at: 0 },
    Zi = [
      ["#ff5a00", Li.Saudável],
      ["#f6c665", Li.Restrita + Li["Limite atingido"]],
      ["#ff6f61", Li.Desconectada + Li.Suspensa],
      ["#6b5c52", Li["Aguardando Meta"]],
    ]
      .map(([e, a]) => {
        let s = Yi.at;
        return ((Yi.at += (Number(a) / Xi) * 100), `${e} ${s}% ${Yi.at}%`);
      })
      .join(","),
    Qi = (0, r.useMemo)(() => {
      let e = ["mint", "violet", "coral", "blue", "amber", "pink"],
        a = ha?.currentUser;
      if (bi?.ranking)
        return bi.ranking.map((s, n) => ({
          id: s.id,
          name: s.displayName || s.email,
          email: s.email,
          avatarUrl: s.avatarUrl,
          roleLabel: "Operador",
          posts: s.posts,
          accountCount: s.accountCount,
          color: e[n % 6],
          isYou:
            s.isYou || !(!a || s.email.toLowerCase() !== a.email.toLowerCase()),
        }));
      let s = [],
        n = new Set(),
        t = [
          ...(ha?.members || []),
          ...(ha?.independentWorkspaces || []),
        ].filter((e) => "revoked" !== e.status);
      for (let e of t) {
        let a = (e.email || e.id).toLowerCase();
        n.has(a) ||
          (n.add(a),
          s.push({
            id: e.id,
            name: e.displayName || e.email,
            email: e.email,
            avatarUrl: e.avatarUrl,
            role: e.role,
          }));
      }
      return (
        a &&
          !s.some((e) => e.email.toLowerCase() === a.email.toLowerCase()) &&
          s.unshift({
            id: "me",
            name: a.displayName,
            email: a.email,
            avatarUrl: a.avatarUrl,
            role: a.role,
          }),
        s.map((s, n) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          avatarUrl: s.avatarUrl,
          roleLabel: Ue(s.role),
          posts: 0,
          accountCount: 0,
          color: e[n % 6],
          isYou: !(
            !a ||
            !s.email ||
            s.email.toLowerCase() !== a.email.toLowerCase()
          ),
        }))
      );
    }, [bi, ha]),
    er = (e) => {
      if (e.isYou) return (re("Todos"), x(""), void s("accounts"));
      s("team");
    },
    ar = (0, r.useMemo)(() => {
      let e = Ua.trim().toLowerCase();
      return $i.filter((a) => {
        let s = Xa[a.id],
          n =
            `${a.username} ${a.displayName || ""} ${a.model} ${a.player} ${a.groupName || ""} ${a.niche || ""} ${s?.loginEmail || a.loginEmail || ""} ${s?.phoneNumber || a.phoneNumber || ""}`.toLowerCase();
        return (
          !(
            (e && !n.includes(e)) ||
            ("Todos" !== Ja && Oe(a, "none" === Va ? "model" : Va) !== Ja)
          ) &&
          ("caidas" === za
            ? "caida" === a.lifecycle
            : "caida" !== a.lifecycle &&
              ("operacionais" === za
                ? "operacional" === Me(a).key
                : "checkpoint" === za
                  ? we(a)
                  : "incompletas" === za
                    ? Te(a)
                    : "completas" === za
                      ? je(a, s).complete
                      : "sem_senha" === za
                        ? !a.hasLoginPassword
                        : "sem_meta" !== za ||
                          "Conectada" !== a.connectionStatus))
        );
      });
    }, [$i, Xa, za, Va, Ja, Ua]),
    sr = (0, r.useMemo)(() => {
      let e = "none" === Va ? "model" : Va;
      return Ee($i.map((a) => Oe(a, e)));
    }, [$i, Va]),
    nr = (0, r.useMemo)(() => {
      let e = new Map();
      for (let a of ar) {
        let s = Oe(a, Va),
          n = e.get(s) || [];
        (n.push(a), e.set(s, n));
      }
      return [...e.entries()].sort(
        ([e], [a]) => ke(e) - ke(a) || e.localeCompare(a, "pt-BR"),
      );
    }, [ar, Va]),
    tr = Ee($i.map((e) => e.model)),
    ir = Ee($i.map((e) => e.player)),
    rr = Ee($i.map((e) => e.groupName)),
    lr = (0, r.useMemo)(() => {
      let e = 0,
        a = 0,
        s = 0;
      for (let n of Ni) {
        if ("caida" === n.lifecycle) continue;
        let t = je(n, Xa[n.id]);
        t.complete ? (e += 1) : t.filled ? (a += 1) : (s += 1);
      }
      let n = e + a + s || 1;
      return {
        complete: e,
        partial: a,
        empty: s,
        percent: Math.round((e / n) * 100),
        total: e + a + s,
      };
    }, [Ni, Xa]),
    or = (0, r.useMemo)(
      () =>
        Ni.flatMap((e) => {
          let a = Ne(e);
          return a ? [{ account: e, ...a }] : [];
        }),
      [Ni],
    ),
    cr = Ni.filter((e) => "operacional" === Me(e).key).length,
    dr = L.find((e) => e.id === Zs),
    mr = L.find((e) => e.id === Js);
  ta.connections.filter(
    (e) => "facebook" === e.apiMode && "connected" === e.status,
  );
  let ur = wi,
    pr = dr?.mediaCount || 0,
    hr = ur.filter((e) => vn.includes(e.id)),
    xr = pr * mn * ("all_accounts" === pn ? hr.length : +!!hr.length),
    _r = sn
      ? Math.max(0, new Date(sn).getTime() - new Date(en).getTime())
      : 1 / 0,
    jr = (e) =>
      Number.isFinite(_r)
        ? Math.max(0, Math.floor(_r / (6e4 * Math.max(1, e))) + 1)
        : 1 / 0,
    gr = Number.isFinite(_r)
      ? "distribute" === pn || "global_queue" === ln
        ? jr(tn)
        : "per_account_custom" === ln
          ? hr.reduce((e, a) => e + jr(cn[a.id] || tn), 0)
          : jr(tn) * hr.length
      : 1 / 0,
    vr = Math.min(xr, Number.isFinite(gr) ? gr : xr),
    br = Rn.length * mn * ("all_accounts" === pn ? hr.length : +!!hr.length),
    fr = Math.min(br, Number.isFinite(gr) ? gr : br),
    yr = (Rn[0] && at[g(Rn[0])]) || Yn,
    Nr = !Bn || Rn.every((e) => (at[g(e)] || Yn).trim()),
    wr = Rn.filter((e) => e.type.startsWith("image/")).length,
    Cr = !!Rn[0]?.type.startsWith("image/");
  ((0, r.useEffect)(() => {
    window.localStorage.setItem("nexoflow-video-template", Wn);
  }, [Wn]),
    (0, r.useEffect)(() => {
      localStorage.setItem(de, i ? "1" : "0");
    }, [i]),
    (0, r.useEffect)(() => {
      localStorage.setItem(ue, JSON.stringify(o));
    }, [o]),
    (0, r.useEffect)(() => {
      let e = "",
        a = window.setTimeout(() => {
          "REELS" === kn.mediaType && Rn[0]
            ? Rn[0].templateUrl
              ? tt(Rn[0].templateUrl)
              : ((e = URL.createObjectURL(Rn[0])), tt(e))
            : tt("");
        }, 0);
      return () => {
        (window.clearTimeout(a), e && URL.revokeObjectURL(e));
      };
    }, [Rn, kn.mediaType]),
    (0, r.useEffect)(() => {
      let e = "",
        a = window.setTimeout(() => {
          lt ? ((e = URL.createObjectURL(lt)), bt(e)) : bt("");
        }, 0);
      return () => {
        (window.clearTimeout(a), e && URL.revokeObjectURL(e));
      };
    }, [lt]));
  let Sr = !(
      !mr ||
      (Ks.name === mr.name &&
        Ks.caption === mr.caption &&
        Ks.hashtags === mr.hashtags &&
        Ks.shareToFeed === mr.shareToFeed &&
        JSON.stringify(Ks.captionVariations) ===
          JSON.stringify(Be(mr.captionVariations)))
    ),
    kr = (0, r.useMemo)(
      () =>
        D.filter((e) => {
          if (
            ("Todos" !== wt && e.campaignId !== wt) ||
            ("Todos" !== St && e.accountId !== St) ||
            ("Todos" !== Et && e.status !== Et)
          )
            return !1;
          let a = Mt.trim().toLowerCase();
          return !(
            a && !`${e.username} ${e.campaignName}`.toLowerCase().includes(a)
          );
        }),
      [D, wt, St, Et, Mt],
    ),
    Er = Math.max(1, Math.ceil(kr.length / 80)),
    Ar = Math.min(zt, Er),
    Mr = kr.slice(80 * (Ar - 1), 80 * Ar),
    $r =
      ((0, r.useMemo)(() => new Set(Ai.map((e) => e.campaignId)), [Ai]),
      (0, r.useMemo)(
        () =>
          L.filter(
            (e) =>
              e.name.toLowerCase().includes(Ut.toLowerCase()) &&
              ("Todos" === Vt ||
                ("running" === Vt
                  ? "running" === phaseOf(e).k
                  : "upcoming" === Vt
                    ? "scheduled" === phaseOf(e).k
                    : e.status === Vt)) &&
              ("Todos" === Jt || e.mediaType === Jt),
          ).sort(
            (e, a) =>
              phaseRank(e) - phaseRank(a) ||
              ("oldest" === Kt
                ? new Date(e.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
                : "performance" === Kt
                  ? a.publishedCount -
                    a.failedCount -
                    (e.publishedCount - e.failedCount)
                  : new Date(a.createdAt).getTime() -
                    new Date(e.createdAt).getTime()),
          ),
        [L, Ut, Vt, Jt, Kt],
      )),
    Tr = (0, r.useMemo)(() => {
      let e = ha?.currentUser;
      return gi.filter(
        (a) =>
          !(
            !xe(a.createdAt, yi) ||
            ("Todas" !== Xt && a.severity !== Xt) ||
            ("Todos" !== Zt && a.type !== Zt)
          ) &&
          ("publication" === a.type
            ? !1 !== e?.notifyPublish
            : "connection" === a.type || "token" === a.type
              ? !1 !== e?.notifyConnections
              : !1 !== e?.notifyErrors),
      );
    }, [gi, yi, Xt, Zt, ha]),
    Pr = (0, r.useMemo)(
      () =>
        (bi?.perAccount ?? [])
          .filter(
            (e) =>
              `${e.username} ${e.model} ${e.player} ${e.groupName || ""} ${e.niche || ""}`
                .toLowerCase()
                .includes(ei.toLowerCase()) &&
              ("Todos" === si || e.model === si),
          )
          .sort((e, a) =>
            "reach" === ti
              ? a.reach30d - e.reach30d
              : "followers" === ti
                ? a.followersCount - e.followersCount
                : "success" === ti
                  ? a.successRate - e.successRate
                  : a.views30d - e.views30d,
          ),
      [bi, ei, si, ti],
    ),
    qr = (0, r.useMemo)(
      () =>
        (bi?.perMedia ?? [])
          .filter((e) =>
            `${e.campaignName} ${e.username} ${e.mediaType}`
              .toLowerCase()
              .includes(ri.toLowerCase()),
          )
          .sort((e, a) =>
            "reach" === oi
              ? a.reach - e.reach
              : "recent" === oi
                ? new Date(a.publishedAt || 0).getTime() -
                  new Date(e.publishedAt || 0).getTime()
                : a.views - e.views,
          ),
      [bi, ri, oi],
    ),
    Lr = D.find((e) => e.id === hi) || Ft.find((e) => e.id === hi),
    Or = (0, r.useMemo)(() => {
      let e = new Map();
      for (let a of Mi.filter(
        (e) => !["cancelled", "failed"].includes(e.status),
      )) {
        let s = new Date(a.scheduledFor),
          n = s.toISOString().slice(0, 10),
          t = e.get(n) || {
            label: s.toLocaleDateString("pt-BR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            }),
            count: 0,
            items: [],
          };
        ((t.count += 1), t.items.push(a), e.set(n, t));
      }
      return [...e.entries()]
        .sort(([e], [a]) => e.localeCompare(a))
        .slice(0, 7);
    }, [Mi]),
    Rr = async (e, a = "workspace") => {
      (e || K(!0), X(""));
      let s = "Não foi possível carregar as contas.";
      for (let e = 1; e <= 3; e += 1)
        try {
          let e = await w(
              `/api/accounts?limit=500${"platform" === a ? "&scope=platform" : ""}`,
              { cache: "no-store" },
            ),
            n = await e.json();
          if (!e.ok || !n.accounts) throw Error(n.error || s);
          if ("platform" === a) {
            (setPlatformAccounts(n.accounts), K(!1));
            return;
          }
          return (
            V(n.accounts),
            J(!!n.canViewRecovery),
            K(!1),
            void Ya((e) => {
              let a = { ...e };
              for (let e of n.accounts || [])
                a[e.id] = { ...De(e), ...(a[e.id] || {}) };
              return a;
            })
          );
        } catch (a) {
          if (
            ((s = a instanceof Error ? a.message : s),
            /exceeded|row read limit|D1/i.test(s))
          )
            break;
          e < 3 && (await new Promise((a) => window.setTimeout(a, 700 * e)));
        }
      (X(s), K(!1));
    },
    Fr = async () => {
      let e = await w("/api/campaigns", { cache: "no-store" });
      if (e.ok) {
        let a = await e.json();
        (O(a.campaigns), F(a.templates || []));
      }
    },
    Ir = async (e = Tt, a = qt) => {
      let s = new URLSearchParams({ tab: e, sort: a });
      "platform" === dashboardScope && s.set("scope", "platform");
      ("Todos" !== wt && s.set("campaignId", wt),
        "Todos" !== St && s.set("accountId", St),
        "Todos" !== Et && "live" === e && s.set("status", Et),
        Mt.trim() && s.set("search", Mt.trim()));
      let n = await w(`/api/queue?${s.toString()}`);
      if (!n.ok) return;
      let t = await n.json();
      (t.counts && Rt(t.counts), "live" === e && It(t.queue), U(t.queue));
    },
    zr = async () => {
      let e = await w("/api/meta/status");
      e.ok && ia(await e.json());
    },
    Dr = async () => {
      let e = await fetch("/api/quarantine", { cache: "no-store" });
      e.ok && la(await e.json());
    },
    Ur = async () => {
      let e = await w("/api/system/health", { cache: "no-store" });
      e.ok && ca(await e.json());
    },
    Br = async () => {
      let e = await w("/api/system/storage", { cache: "no-store" });
      e.ok && ma(await e.json());
    },
    Vr = async () => {
      let e = await w("/api/audit", { cache: "no-store" });
      if (e.ok) {
        let a = await e.json();
        pa(a.events);
      }
    },
    Gr = async () => {
      let e = await w("/api/team");
      e.ok && xa(await e.json());
    },
    Jr = async () => {
      let e = await w("/api/workspaces", { cache: "no-store" });
      e.ok && ja(await e.json());
    },
    Hr = async () => {
      let e = await w("/api/alerts");
      if (e.ok) {
        let a = await e.json();
        vi(a.alerts);
      }
    },
    Kr = (0, r.useRef)(!1),
    Wr = async (a = "reports" !== e) => {
      let s = await w(
        `/api/reports?from=${encodeURIComponent(yi.from)}&to=${encodeURIComponent(yi.to)}${a ? "&lite=1" : ""}${"platform" === dashboardScope ? "&scope=platform" : ""}`,
      );
      s.ok && fi(await s.json());
    };
  ((0, r.useEffect)(() => {
    let e = ie();
    (a(e), window.history.replaceState({}, "", b[e]));
    let s = () => a(ie());
    window.addEventListener("popstate", s);
    let n = window.setTimeout(() => {
      (async () => {
        "otp" !== e
          ? ((Kr.current = !0),
            await Promise.all([Rr(), zr(), Dr(), Gr(), Jr()]),
            "campaigns" === e && (await Fr()),
            "queue" === e && (await Ir()),
            "alerts" === e && (await Hr()),
            ("integrations" === e || "team" === e) &&
              (await Promise.all([Ur(), Br(), Vr()])),
            "otp" !== e && il({ silent: !0 }))
          : await Promise.all([Gr(), Jr(), Dr()]);
      })();
    }, 0);
    return () => {
      (window.clearTimeout(n), window.removeEventListener("popstate", s));
    };
  }, []),
    (0, r.useEffect)(() => {
      "otp" === e ||
        Kr.current ||
        ((Kr.current = !0), Promise.all([Rr(), zr(), Fr(), Ir(), Hr()]));
    }, [e]),
    (0, r.useEffect)(() => {
      if ("otp" === e) return;
      let a = "reports" !== e,
        s = window.setTimeout(() => {
          Wr(a);
        }, 280);
      return () => window.clearTimeout(s);
    }, [yi.from, yi.to, e]),
    (0, r.useEffect)(() => {
      if (!ha?.currentUser?.isPlatformAdmin || "dashboard" !== e) return;
      void Promise.all([Rr(!0, dashboardScope), Ir(), Wr(!0)]);
    }, [dashboardScope]),
    (0, r.useEffect)(() => {
      if ("dashboard" !== e && "platform" === dashboardScope)
        setDashboardScope("workspace");
    }, [e, dashboardScope]),
    (0, r.useEffect)(() => {
      if ("queue" !== e) return;
      Ir(Tt, qt);
      let a = window.setInterval(() => {
        Ir(Tt, qt);
      }, 45e3);
      return () => window.clearInterval(a);
    }, [e, Tt, qt, wt, St, Et, Mt]),
    (0, r.useEffect)(() => {
      if ("dashboard" !== e && "accounts" !== e) return;
      let a = window.setInterval(() => {
        Rr(!0);
      }, 9e4);
      return () => window.clearInterval(a);
    }, [e]));
  (0, r.useEffect)(() => {
    if (
      ha &&
      !ha.currentUser?.isPlatformAdmin &&
      ("team" === e || "integrations" === e)
    ) {
      (s("dashboard"), window.history.replaceState({}, "", b.dashboard));
    }
  }, [e, ha]);
  let Xr = (e) => {
      if ((z(""), Sn(""), yn("idle"), e.length > 50))
        return (
          yn("error"),
          void Sn("Selecione no máximo 50 arquivos por campanha.")
        );
      let a =
          "IMAGE" === kn.mediaType
            ? ["image/jpeg", "image/png"]
            : ["image/jpeg", "image/png", "video/mp4", "video/quicktime"],
        s = e.find(
          (e) => !a.includes(e.type) || e.size <= 0 || e.size > 104857600,
        );
      if (s)
        return (
          yn("error"),
          void Sn(
            `${s.name} não é compatível com o formato escolhido ou ultrapassa 100 MB.`,
          )
        );
      (Fn(e),
        st((a) => Object.fromEntries(e.map((e) => [g(e), a[g(e)] || Yn]))),
        Un({ completed: 0, total: e.length }));
    },
    Yr = () => {
      (rt(!1), ot(null), dt(35), ut(100), ht(0), _t(1), gt(!0));
    },
    Zr = () => {
      (z(""),
        Gs(!0),
        an(pe()),
        nn(""),
        rn(60),
        on("per_account_shared"),
        dn(Object.fromEntries(wi.map((e) => [e.id, 60]))),
        un(1),
        hn("all_accounts"),
        gn(!0),
        bn(wi.slice(0, ze).map((e) => e.id)),
        Vn(!1),
        Jn(7),
        Kn("static"),
        Zn(""),
        st({}),
        Yr(),
        Mn([]),
        Tn(6),
        qn({}),
        On(!1),
        yt({ current: 0, total: 0, progress: 0, fileName: "" }),
        yn("idle"),
        Sn(""));
    },
    Qr = (e) => {
      (aa("single"),
        Z([e.id]),
        na({
          ...Ie,
          model: e.model,
          player: e.player,
          groupName: e.groupName || "",
          niche: e.niche || "",
          priority: e.priority,
          notes: e.notes || "",
          loginEmail: e.loginEmail || "",
          recoveryEmail: e.recoveryEmail || "",
          phoneNumber: e.phoneNumber || "",
          twoFactorMethod: e.twoFactorMethod || "",
          emailTwoFactor: e.emailTwoFactor || "",
          vaultReference: e.vaultReference || "",
          lifecycle: e.lifecycle || "ativa",
        }),
        Ze(!0));
    },
    el = async (e, a) => {
      if (a)
        try {
          (await navigator.clipboard.writeText(a),
            yn("success"),
            Sn(`${e} copiado.`));
        } catch {
          (yn("error"),
            Sn("Não foi possível copiar. Permita a área de transferência."));
        }
    },
    al = async (e, a = "login") => {
      if (G) {
        (yn("saving"), Sn(""));
        try {
          let s = await w("/api/accounts/secret", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: e.id, kind: a }),
            }),
            n = await s.json();
          if (!s.ok || !n.password)
            throw Error(n.error || "Senha indisponível.");
          let t = "email" === a ? `${e.id}:email` : e.id;
          (ns((e) => ({ ...e, [t]: n.password })),
            yn("success"),
            Sn(
              "email" === a
                ? `Senha do e-mail de @${e.username} visível neste aparelho.`
                : `Senha de @${e.username} visível neste aparelho. Copie e entre no Instagram.`,
            ),
            window.setTimeout(
              () =>
                ns((e) => {
                  let a = { ...e };
                  return (delete a[t], a);
                }),
              2e4,
            ));
        } catch (e) {
          (yn("error"),
            Sn(
              e instanceof Error
                ? e.message
                : "Não foi possível revelar a senha.",
            ));
        }
      }
    },
    sl = async (e) => {
      if (!e.length || "owner" !== ha?.currentUser.role) return;
      let a = B.filter((a) => e.includes(a.id)).map((e) => `@${e.username}`),
        s = D.filter(
          (a) =>
            e.includes(a.accountId) &&
            !["published", "cancelled"].includes(a.status),
        ).length;
      if (
        window.confirm(
          `Excluir ${1 === a.length ? a[0] : `${a.length} perfil(is)`} da resolv.?\n\nIsso remove a conta da ferramenta, desconecta a Meta e cancela ${s} item(ns) da fila. Publicações já no Instagram não são apagadas.`,
        )
      ) {
        (yn("saving"), Sn(""));
        try {
          let a = await w("/api/accounts", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: e, confirmation: "EXCLUIR" }),
            }),
            s = await a.json();
          if (!a.ok) throw Error(s.error || "Não foi possível excluir.");
          (yn("success"),
            Sn(
              `${s.deleted ?? e.length} perfil(is) removido(s)${s.cancelledPosts ? ` · ${s.cancelledPosts} item(ns) da fila cancelados` : ""}.`,
            ),
            Ze(!1),
            Z([]),
            await Promise.all([Rr(), Ir(), zr(), Hr(), Fr()]));
        } catch (e) {
          (yn("error"),
            Sn(
              e instanceof Error
                ? e.message
                : "Não foi possível excluir a conta.",
            ));
        }
      }
    },
    nl = async (e, a, s) => {
      if (!e.trim())
        return (
          yn("error"),
          void Sn("Escreva a legenda base antes de gerar variações.")
        );
      (On(!0), yn("saving"), Sn("Gerando variações da legenda..."));
      try {
        let n = await w("/api/captions/variations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ caption: e, count: a }),
          }),
          t = await n.json();
        if (!n.ok || !t.variations?.length)
          throw Error(t.error || "Não foi possível gerar as variações.");
        (s(t.variations),
          yn("success"),
          Sn(
            `${t.variations.length} legendas novas geradas pela IA. Apague as que não quiser usar.`,
          ));
      } catch (e) {
        (yn("error"),
          Sn(
            e instanceof Error
              ? e.message
              : "Não foi possível gerar as variações.",
          ));
      } finally {
        On(!1);
      }
    },
    tl = async (e) => {
      if (
        Js &&
        ("cancel" !== e ||
          window.confirm(
            "Cancelar definitivamente todos os próximos posts desta campanha? Os posts já publicados não serão alterados.",
          ))
      ) {
        (yn("saving"), Sn(""));
        try {
          let a = await w(`/api/campaigns/${Js}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: e }),
            }),
            s = await a.json();
          if (!a.ok)
            throw Error(s.error || "Não foi possível alterar a campanha.");
          let n = s.paused ?? s.resumed ?? s.cancelled ?? 0,
            t =
              "pause" === e
                ? `Campanha pausada. ${n} posts futuros foram interrompidos.`
                : "resume" === e
                  ? `Campanha retomada. ${n} posts voltaram para a fila.`
                  : `Campanha encerrada. ${n} posts futuros foram cancelados.`;
          (yn("success"),
            Sn(t),
            Hs(null),
            await Promise.all([Fr(), Ir(), Rr()]));
        } catch (e) {
          (yn("error"),
            Sn(
              e instanceof Error
                ? e.message
                : "Não foi possível alterar a campanha.",
            ));
        }
      }
    },
    il = async (e) => {
      let a = !!e?.silent,
        s = !!e?.automatic;
      if (!pl.current) {
        ((pl.current = !0),
          wn(!0),
          a ||
            (yn("success"),
            Sn(
              "Sincronizando com a Meta. Os números da tela ficam como estão até terminar.",
            )));
        try {
          let e = new Date().toISOString(),
            n = 0,
            t = 0,
            i = 0,
            r = 0,
            l = 0,
            o = 0,
            c = 0;
          do {
            let a = await w("/api/meta/sync", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ runStartedAt: e, automatic: s }),
              }),
              d = await _e(a);
            if (!a.ok) throw Error(d.error || "Falha na sincronização.");
            if (
              ((n += d.synced ?? 0),
              (t = d.total ?? t),
              (i += d.mediaUpdated ?? 0),
              (r += d.partialFailures ?? 0),
              (l += d.viewsCollected ?? 0),
              (o = d.remaining ?? 0),
              (c += 1),
              d.budgetExhausted || s)
            )
              break;
          } while (o > 0 && c < 24);
          if ((await Promise.all([Rr(!0), zr(), Wr(!1)]), !a)) {
            let e = t ? Math.min(n, t) : n;
            (yn("success"),
              Sn(
                `${e} de ${t} contas sincronizadas; ${i} publicações atualizadas; ${C(l)} visualizações lidas da Meta.${r ? ` ${r} vídeo(s) ainda sem insight da Meta.` : ""}${o ? " Ainda restam contas; clique de novo se quiser continuar agora." : ""}`,
              ));
          }
        } catch (e) {
          if (a) return;
          (yn("error"),
            Sn(
              e instanceof Error ? e.message : "Não foi possível sincronizar.",
            ));
        } finally {
          ((pl.current = !1), wn(!1));
        }
      }
    },
    rl = async (e) => {
      if (
        hi &&
        ("cancel" !== e ||
          window.confirm("Cancelar somente esta publicação futura?"))
      ) {
        (yn("saving"), Sn(""));
        try {
          let a = await w(`/api/queue/${hi}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: e,
                ...("reschedule" === e
                  ? { scheduledFor: new Date(_i).toISOString() }
                  : {}),
              }),
            }),
            s = await a.json();
          if (!a.ok)
            throw Error(s.error || "Não foi possível alterar a publicação.");
          (xi(null),
            yn("success"),
            Sn(
              "reschedule" === e
                ? "Publicação reagendada."
                : "cancel" === e
                  ? "Publicação cancelada."
                  : "Publicação devolvida para a fila.",
            ),
            await Promise.all([Ir(), Rr(), Hr(), Wr()]));
        } catch (e) {
          (yn("error"),
            Sn(
              e instanceof Error
                ? e.message
                : "Não foi possível alterar a publicação.",
            ));
        }
      }
    },
    ll = async (e) => {
      if (!e.captionOverride?.trim())
        return (
          yn("error"),
          void Sn(
            "Esta publicação não possui uma legenda preparada para copiar.",
          )
        );
      let a = window.open(e.publishedPermalink || "about:blank", "_blank");
      (yn("saving"), Sn(""));
      try {
        try {
          await navigator.clipboard.writeText(e.captionOverride);
        } catch {
          let a = document.createElement("textarea");
          ((a.value = e.captionOverride),
            (a.style.position = "fixed"),
            (a.style.opacity = "0"),
            document.body.appendChild(a),
            a.select(),
            document.execCommand("copy"),
            a.remove());
        }
        let s = e.publishedPermalink;
        if (!s) {
          let a = await w(`/api/queue/${e.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "resolve_publication" }),
            }),
            n = await a.json();
          if (!a.ok || !n.permalink)
            throw Error(
              n.error || "Não foi possível localizar o post publicado.",
            );
          s = n.permalink;
        }
        (a
          ? (a.location.href = s)
          : window.open(s, "_blank", "noopener,noreferrer"),
          yn("success"),
          Sn(
            "Legenda copiada. O post foi aberto para você colar o texto manualmente.",
          ),
          await Ir());
      } catch (e) {
        (a?.close(),
          yn("error"),
          Sn(
            e instanceof Error
              ? e.message
              : "Não foi possível recuperar esta publicação.",
          ));
      }
    },
    ol = (e, a = !1) => {
      ($a(e.id),
        Pa(e.displayName || e.email),
        La("viewer" === e.role ? "viewer" : "editor"),
        Ra(""),
        Ia(a));
    },
    cl = async () => {
      if (Ma && Oa) {
        (yn("saving"), Sn(""));
        try {
          let e = await w("/api/team", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "reset_password",
                memberId: Ma,
                password: Oa,
              }),
            }),
            a = await e.json();
          if (!e.ok)
            throw Error(a.error || "Não foi possível redefinir a senha.");
          (Ra(""),
            $a(null),
            Ia(!1),
            yn("success"),
            Sn(
              "Senha temporária redefinida. As sessões anteriores foram encerradas.",
            ),
            await Gr());
        } catch (e) {
          (yn("error"),
            Sn(
              e instanceof Error
                ? e.message
                : "Não foi possível redefinir a senha.",
            ));
        }
      }
    },
    dl = async (e) => {
      if (!window.confirm(`Remover o acesso de ${e.email}?`)) return;
      let a = await w(`/api/team?id=${encodeURIComponent(e.id)}`, {
          method: "DELETE",
        }),
        s = await a.json();
      if (!a.ok)
        return (
          yn("error"),
          void Sn(s.error || "Não foi possível remover o acesso.")
        );
      (yn("success"), Sn("Acesso removido."), await Gr());
    },
    ml = f || Ye || !!Ma || !!Lr || Vs || !!mr || !!Zs || d || bs,
    ul = (0, r.useRef)(fn);
  ul.current = fn;
  let pl = (0, r.useRef)(!1);
  return (
    (0, r.useEffect)(() => {
      if (!ml && !n) return;
      let { body: e, documentElement: a } = document,
        s = window.scrollY,
        i = Math.max(0, window.innerWidth - a.clientWidth);
      ((e.dataset.scrollLock = "true"),
        e.style.setProperty("--scroll-lock-gap", `${i}px`),
        (e.style.overflow = "hidden"),
        (a.style.overflow = "hidden"));
      let r = (e) => {
        if ("Escape" === e.key) {
          if (n) return void t(!1);
          if ("saving" !== ul.current) {
            if (d) return void u(!1);
            if (bs) return void fs(!1);
            f
              ? N(!1)
              : Ye
                ? Ze(!1)
                : Ma
                  ? $a(null)
                  : Lr
                    ? xi(null)
                    : Vs
                      ? Gs(!1)
                      : mr
                        ? Hs(null)
                        : Zs && Qs(null);
          }
        }
      };
      return (
        window.addEventListener("keydown", r),
        () => {
          (delete e.dataset.scrollLock,
            e.style.removeProperty("--scroll-lock-gap"),
            (e.style.overflow = ""),
            (a.style.overflow = ""),
            window.removeEventListener("keydown", r),
            window.scrollTo(0, s));
        }
      );
    }, [ml, n, f, Ye, Ma, Lr, Vs, mr, Zs, d, bs]),
    (0, _.jsxs)("main", {
      className: "app-shell " + (i ? "sidebar-collapsed" : ""),
      children: [
        n &&
          (0, _.jsx)("button", {
            className: "mobile-nav-backdrop",
            "aria-label": "Fechar menu",
            onClick: () => t(!1),
          }),
        (0, _.jsxs)("aside", {
          className: "sidebar " + (n ? "mobile-open" : ""),
          children: [
            (0, _.jsx)("button", {
              className: "mobile-sidebar-close",
              "aria-label": "Fechar menu",
              onClick: () => t(!1),
              children: "×",
            }),
            (0, _.jsxs)("div", {
              className: "sidebar-head",
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "brand",
                  onClick: () => {
                    (s("dashboard"), t(!1));
                  },
                  "aria-label": "Ir para a visão geral",
                  children: (0, _.jsxs)("span", {
                    className: "brand-word",
                    children: ["resolv", (0, _.jsx)("i", { children: "flow" })],
                  }),
                }),
                (0, _.jsx)("button", {
                  type: "button",
                  className: "sidebar-toggle",
                  "aria-expanded": !i,
                  "aria-label": i ? "Abrir menu" : "Fechar menu",
                  title: i ? "Abrir menu" : "Fechar menu",
                  onClick: () => l((e) => !e),
                  children: (0, _.jsx)(y, { name: "panel" }),
                }),
              ],
            }),
            (0, _.jsxs)("div", {
              className: "workspace-switcher",
              children: [
                (0, _.jsx)(He, {
                  name: ha?.currentUser.displayName || "RF",
                  url: ha?.currentUser.avatarUrl,
                  className: "workspace-avatar",
                }),
                (0, _.jsxs)("span", {
                  children: [
                    (0, _.jsx)("small", { children: "Espaço de trabalho" }),
                    (0, _.jsx)("strong", {
                      children: ha?.currentUser.displayName || "resolvflow",
                    }),
                  ],
                }),
              ],
            }),
            (0, _.jsxs)("nav", {
              "aria-label": "Navegação principal",
              children: [
                (0, _.jsx)("span", {
                  className: "nav-label",
                  children: "Operação",
                }),
                (0, _.jsxs)("button", {
                  className: "dashboard" === e ? "active" : "",
                  title: "Visão geral",
                  "aria-current": "dashboard" === e ? "page" : void 0,
                  onClick: () => {
                    (s("dashboard"), t(!1));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "grid" }),
                    (0, _.jsx)("span", { children: "Visão geral" }),
                  ],
                }),
                (0, _.jsxs)("button", {
                  className: "accounts" === e ? "active" : "",
                  title: "Contas",
                  "aria-current": "accounts" === e ? "page" : void 0,
                  onClick: () => {
                    (s("accounts"), t(!1), Rr(!0));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "users" }),
                    (0, _.jsx)("span", { children: "Contas" }),
                    " ",
                    (0, _.jsx)("em", { children: Ti.length || "" }),
                  ],
                }),
                G &&
                  (0, _.jsxs)("button", {
                    className: "vault" === e ? "active" : "",
                    title: "Acessos",
                    "aria-current": "vault" === e ? "page" : void 0,
                    onClick: () => {
                      (s("vault"), t(!1), Rr(!0));
                    },
                    children: [
                      (0, _.jsx)(y, { name: "shield" }),
                      (0, _.jsx)("span", { children: "Acessos" }),
                    ],
                  }),
                (0, _.jsxs)("button", {
                  className: "campaigns" === e ? "active" : "",
                  title: "Campanhas",
                  "aria-current": "campaigns" === e ? "page" : void 0,
                  onClick: () => {
                    (s("campaigns"), t(!1), Promise.all([Fr(), Rr(!0), Ir()]));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "campaign" }),
                    (0, _.jsx)("span", { children: "Campanhas" }),
                    " ",
                    (0, _.jsx)("em", { children: L.length || "" }),
                  ],
                }),
                (0, _.jsxs)("button", {
                  className: "queue" === e ? "active" : "",
                  title: "Fila",
                  "aria-current": "queue" === e ? "page" : void 0,
                  onClick: () => {
                    (s("queue"), t(!1), Pt("live"), Ir("live"));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "queue" }),
                    (0, _.jsx)("span", { children: "Fila" }),
                    " ",
                    (0, _.jsx)("em", { children: Ot.live || "" }),
                  ],
                }),
                (0, _.jsxs)("button", {
                  className: "alerts" === e ? "active" : "",
                  title: "Alertas",
                  "aria-current": "alerts" === e ? "page" : void 0,
                  onClick: () => {
                    (s("alerts"), t(!1), Hr());
                  },
                  children: [
                    (0, _.jsx)(y, { name: "bell" }),
                    (0, _.jsx)("span", { children: "Alertas" }),
                    " ",
                    (0, _.jsx)("em", { children: gi.length || "" }),
                  ],
                }),
                (0, _.jsx)("span", {
                  className: "nav-label integrations-label",
                  children: "Análise",
                }),
                (0, _.jsxs)("button", {
                  className: "reports" === e ? "active" : "",
                  title: "Relatórios",
                  "aria-current": "reports" === e ? "page" : void 0,
                  onClick: () => {
                    (s("reports"), t(!1), Wr());
                  },
                  children: [
                    (0, _.jsx)(y, { name: "spark" }),
                    (0, _.jsx)("span", { children: "Relatórios" }),
                  ],
                }),
                (0, _.jsx)("span", {
                  className: "nav-label integrations-label",
                  children: "Sistema",
                }),
                ha?.currentUser?.isPlatformAdmin
                  ? (0, _.jsxs)("button", {
                  className: "integrations" === e ? "active" : "",
                  title: "Integrações",
                  "aria-current": "integrations" === e ? "page" : void 0,
                  onClick: () => {
                    (s("integrations"),
                      t(!1),
                      Promise.all([zr(), Ur(), Br(), Vr()]));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "plug" }),
                    (0, _.jsx)("span", { children: "Integrações" }),
                    " ",
                    (0, _.jsx)("i", { className: "integration-dot" }),
                  ],
                    })
                  : null,
                ha?.currentUser?.isPlatformAdmin
                  ? (0, _.jsxs)("button", {
                      className: "team" === e ? "active" : "",
                      title: "Equipe",
                      "aria-current": "team" === e ? "page" : void 0,
                      onClick: () => {
                        (s("team"), t(!1), Gr());
                      },
                      children: [
                        (0, _.jsx)(y, { name: "users" }),
                        (0, _.jsx)("span", { children: "Equipe" }),
                      ],
                    })
                  : null,
                (0, _.jsxs)("button", {
                  className: "otp" === e ? "active" : "",
                  title: "Gmail OTP",
                  "aria-current": "otp" === e ? "page" : void 0,
                  onClick: () => {
                    (s("otp"), t(!1));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "spark" }),
                    (0, _.jsx)("span", { children: "Gmail OTP" }),
                  ],
                }),
              ],
            }),
            (0, _.jsxs)("div", {
              className: "sidebar-footer",
              children: [
                (0, _.jsxs)("button", {
                  type: "button",
                  className: "sidebar-profile",
                  onClick: () => {
                    ((() => {
                      let e = ha?.currentUser;
                      (Ns(e?.displayName || ""),
                        Cs(!1 !== e?.notifyPublish),
                        ks(!1 !== e?.notifyErrors),
                        As(!1 !== e?.notifyConnections),
                        $s(""),
                        Ps(""),
                        Rs(""),
                        Is(!1),
                        fs(!0));
                    })(),
                      t(!1));
                  },
                  "aria-label": "Abrir meu perfil",
                  title: "Meu perfil",
                  children: [
                    (0, _.jsx)(He, {
                      name: ha?.currentUser.displayName || "RF",
                      url: ha?.currentUser.avatarUrl,
                      className: "mini-avatar",
                    }),
                    (0, _.jsxs)("span", {
                      className: "sidebar-profile-copy",
                      children: [
                        (0, _.jsx)("strong", {
                          children: ha?.currentUser.displayName || "resolv.",
                        }),
                        (0, _.jsx)("small", {
                          children:
                            "owner" === ha?.currentUser.role
                              ? "Administrador"
                              : "editor" === ha?.currentUser.role
                                ? "Editor"
                                : "Somente leitura",
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsx)("a", {
                  href: "/__nexoflow/logout",
                  "aria-label": "Sair da resolv.",
                  title: "Sair",
                  children: "↗",
                }),
              ],
            }),
          ],
        }),
        (0, _.jsxs)("section", {
          className: "main-panel",
          children: [
            (0, _.jsxs)("header", {
              className: "topbar",
              children: [
                (0, _.jsxs)("div", {
                  className: "mobile-brand",
                  children: [
                    (0, _.jsx)("button", {
                      className: "mobile-menu-button",
                      "aria-label": "Abrir menu",
                      onClick: () => t(!0),
                      children: "☰",
                    }),
                    (0, _.jsxs)("span", {
                      className: "brand-word",
                      children: [
                        "resolv",
                        (0, _.jsx)("i", { children: "flow" }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "mobile-workspace-card",
                  "aria-label": "Espaço de trabalho atual",
                  children: [
                    (0, _.jsx)(He, {
                      name: ha?.currentUser.displayName || "RF",
                      url: ha?.currentUser.avatarUrl,
                      className: "workspace-avatar",
                    }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("small", {
                          children: "Espaço de trabalho",
                        }),
                        (0, _.jsx)("strong", {
                          children:
                            ha?.currentUser.displayName || "resolvflow",
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "global-search",
                  children: [
                    (0, _.jsx)(y, { name: "search" }),
                    (0, _.jsx)("input", {
                      "aria-label": "Buscar contas",
                      value: p,
                      onChange: (e) => x(e.target.value),
                      onKeyDown: (e) => {
                        "Enter" === e.key && s("accounts");
                      },
                      placeholder:
                        "Buscar contas por @, modelo, player ou grupo...",
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "global-period",
                  children: [
                    (0, _.jsx)("span", { children: "Período" }),
                    (0, _.jsxs)("select", {
                      "aria-label": "Filtrar toda a plataforma por período",
                      value: di,
                      onChange: (e) => mi(e.target.value),
                      children: [
                        (0, _.jsx)("option", {
                          value: "today",
                          children: "Hoje",
                        }),
                        (0, _.jsx)("option", {
                          value: "yesterday",
                          children: "Ontem",
                        }),
                        (0, _.jsx)("option", {
                          value: "7d",
                          children: "Últimos 7 dias",
                        }),
                        (0, _.jsx)("option", {
                          value: "30d",
                          children: "Últimos 30 dias",
                        }),
                        (0, _.jsx)("option", {
                          value: "custom",
                          children: "Dia específico",
                        }),
                        (0, _.jsx)("option", {
                          value: "all",
                          children: "Todo o período",
                        }),
                      ],
                    }),
                    "custom" === di &&
                      (0, _.jsx)("input", {
                        "aria-label": "Escolher dia",
                        type: "date",
                        value: ui,
                        onChange: (e) => pi(e.target.value),
                      }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "top-actions",
                  children: [
                    (0, _.jsxs)("span", {
                      className:
                        "sync-status " +
                        (ra.publishingEnabled ? "" : "quarantine-sync"),
                      children: [
                        (0, _.jsx)("i", {}),
                        ra.publishingEnabled
                          ? "Motor disponível"
                          : "Publicação desligada",
                      ],
                    }),
                    (0, _.jsxs)("button", {
                      className: "icon-button notification-button",
                      "aria-label": "Notificações",
                      onClick: () => {
                        (s("alerts"), Hr());
                      },
                      children: [
                        (0, _.jsx)(y, { name: "bell" }),
                        Tr.length > 0 &&
                          (0, _.jsx)("b", {
                            children: Math.min(99, Tr.length),
                          }),
                      ],
                    }),
                    (0, _.jsxs)("button", {
                      className: "primary-button",
                      disabled: !Bs,
                      title: Bs
                        ? "Importar contas"
                        : "Seu acesso é somente leitura",
                      onClick: () => Bs && N(!0),
                      children: [
                        (0, _.jsx)(y, { name: "plus" }),
                        "Importar contas",
                      ],
                    }),
                  ],
                }),
              ],
            }),
            !ra.publishingEnabled &&
              (0, _.jsxs)("section", {
                className: "quarantine-banner",
                role: "status",
                children: [
                  (0, _.jsx)("span", {
                    className: "alert-icon",
                    children: (0, _.jsx)(y, { name: "shield" }),
                  }),
                  (0, _.jsxs)("div", {
                    children: [
                      (0, _.jsx)("strong", {
                        children: "Modo seguro · conexão liberada",
                      }),
                      (0, _.jsxs)("p", {
                        children: [
                          ra.message,
                          " Novas contas podem ser autorizadas individualmente, mas nenhuma campanha ou publicação será executada.",
                        ],
                      }),
                    ],
                  }),
                  (0, _.jsx)("span", { children: "Só conexão" }),
                ],
              }),
            W &&
              (0, _.jsxs)("section", {
                className: "quarantine-banner",
                role: "alert",
                children: [
                  (0, _.jsx)("span", {
                    className: "alert-icon",
                    children: (0, _.jsx)(y, { name: "shield" }),
                  }),
                  (0, _.jsxs)("div", {
                    children: [
                      (0, _.jsx)("strong", {
                        children: /exceeded|row read limit|D1/i.test(W)
                          ? "Banco no limite diário"
                          : "Não foi possível carregar a operação",
                      }),
                      (0, _.jsx)("p", {
                        children: /exceeded|row read limit|D1/i.test(W)
                          ? "A cota gratuita da Cloudflare estourou. Contas, fila e números voltam sozinhos hoje às 21h (Brasília). Nada foi apagado."
                          : W,
                      }),
                    ],
                  }),
                  (0, _.jsx)("span", { children: "Aguarde" }),
                ],
              }),
            "dashboard" === e
              ? (0, _.jsxs)("div", {
                  className: "content dashboard-page",
                  children: [
                    (0, _.jsxs)("div", {
                      className: "page-heading dashboard-hero",
                      children: [
                        (0, _.jsxs)("div", {
                          children: [
                            (0, _.jsx)("span", {
                              className: "eyebrow",
                              children: "Central de operações",
                            }),
                            (0, _.jsxs)("h1", {
                              children: [Vi, ", vamos organizar a operação."],
                            }),
                            (0, _.jsxs)("p", {
                              children: [
                                "platform" === dashboardScope
                                  ? "Visão consolidada de todas as contas. Última sincronização: "
                                  : "Os cartões usam só o que já foi lido da Meta. Última sincronização: ",
                                ve(zi),
                                ".",
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsxs)("div", {
                          className: "dash-hero-actions",
                          children: [
                            ha?.currentUser?.isPlatformAdmin
                              ? (0, _.jsxs)("div", {
                                  className: "segmented dashboard-scope-toggle",
                                  role: "group",
                                  "aria-label": "Escopo dos dados da dashboard",
                                  children: [
                                    (0, _.jsx)("button", {
                                      type: "button",
                                      className:
                                        "workspace" === dashboardScope
                                          ? "active"
                                          : "",
                                      onClick: () =>
                                        setDashboardScope("workspace"),
                                      children: "Minha conta",
                                    }),
                                    (0, _.jsx)("button", {
                                      type: "button",
                                      className:
                                        "platform" === dashboardScope
                                          ? "active"
                                          : "",
                                      onClick: () =>
                                        setDashboardScope("platform"),
                                      children: "Todas as contas",
                                    }),
                                  ],
                                })
                              : null,
                            (0, _.jsxs)("div", {
                              className: "global-period mobile-dashboard-period",
                              children: [
                                (0, _.jsx)("span", { children: "Período" }),
                                (0, _.jsxs)("select", {
                                  "aria-label":
                                    "Filtrar toda a plataforma por período",
                                  value: di,
                                  onChange: (e) => mi(e.target.value),
                                  children: [
                                    (0, _.jsx)("option", {
                                      value: "today",
                                      children: "Hoje",
                                    }),
                                    (0, _.jsx)("option", {
                                      value: "yesterday",
                                      children: "Ontem",
                                    }),
                                    (0, _.jsx)("option", {
                                      value: "7d",
                                      children: "Últimos 7 dias",
                                    }),
                                    (0, _.jsx)("option", {
                                      value: "30d",
                                      children: "Últimos 30 dias",
                                    }),
                                    (0, _.jsx)("option", {
                                      value: "custom",
                                      children: "Dia específico",
                                    }),
                                    (0, _.jsx)("option", {
                                      value: "all",
                                      children: "Todo o período",
                                    }),
                                  ],
                                }),
                                "custom" === di
                                  ? (0, _.jsx)("input", {
                                      "aria-label": "Escolher dia",
                                      type: "date",
                                      value: ui,
                                      onChange: (e) => pi(e.target.value),
                                    })
                                  : null,
                              ],
                            }),
                            (0, _.jsx)("button", {
                              type: "button",
                              className: "primary-button",
                              disabled:
                                !Bs || "platform" === dashboardScope,
                              onClick: () =>
                                Bs &&
                                "workspace" === dashboardScope &&
                                void il(),
                              children: Nn
                                ? "Sincronizando…"
                                : "platform" === dashboardScope
                                  ? "Visão consolidada"
                                  : "Sincronizar dados",
                            }),
                            (0, _.jsxs)("button", {
                              type: "button",
                              className: "outline-button dash-customize-button",
                              onClick: () => u(!0),
                              children: [
                                (0, _.jsx)(y, { name: "sliders" }),
                                "Personalizar",
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                    Cn &&
                      (0, _.jsx)("div", {
                        className: `operation-banner ${fn}`,
                        children: Cn,
                      }),
                    0 === Ki.length &&
                      (0, _.jsxs)("div", {
                        className: "automation-empty compact",
                        children: [
                          (0, _.jsx)("h3", { children: "Nada nesta visão" }),
                          (0, _.jsx)("p", {
                            children:
                              "Use Personalizar para trazer os blocos de volta.",
                          }),
                        ],
                      }),
                    Ki.map((e) =>
                      "metrics" === e
                        ? (0, _.jsx)(
                            "section",
                            {
                              className: "metric-grid",
                              "aria-label": "Indicadores principais",
                              children: o.cards.map((e, a) => {
                                let n = Gi(e),
                                  t = (0, _.jsxs)(_.Fragment, {
                                    children: [
                                      (0, _.jsxs)("div", {
                                        className: "metric-top",
                                        children: [
                                          (0, _.jsx)("span", {
                                            children: n.label,
                                          }),
                                          (0, _.jsx)("span", {
                                            className: "metric-icon",
                                            children: (0, _.jsx)(y, {
                                              name: n.icon,
                                            }),
                                          }),
                                        ],
                                      }),
                                      (0, _.jsx)("strong", {
                                        children: n.value,
                                      }),
                                      (0, _.jsx)("div", {
                                        className: "metric-note",
                                        children: n.note,
                                      }),
                                      n.go
                                        ? (0, _.jsx)("span", {
                                            className: "metric-go",
                                            children: "Abrir",
                                          })
                                        : null,
                                    ],
                                  });
                                return n.go
                                  ? (0, _.jsx)(
                                      "button",
                                      {
                                        type: "button",
                                        className:
                                          "metric-card metric-link " +
                                          ("connected" === e ? "accent" : ""),
                                        onClick: () => {
                                          (s(n.go),
                                            "queue" === n.go && Ir(),
                                            "alerts" === n.go && Hr());
                                        },
                                        children: t,
                                      },
                                      `${e}-${a}`,
                                    )
                                  : (0, _.jsx)(
                                      "article",
                                      { className: "metric-card", children: t },
                                      `${e}-${a}`,
                                    );
                              }),
                            },
                            "metrics",
                          )
                        : "strip" === e
                          ? (0, _.jsx)(
                              "section",
                              {
                                className: "secondary-metrics panel",
                                children: o.strip.map((e, a) => {
                                  let s = Gi(e);
                                  return (0, _.jsxs)(
                                    "article",
                                    {
                                      children: [
                                        (0, _.jsx)("span", {
                                          children: s.label,
                                        }),
                                        (0, _.jsx)("strong", {
                                          children: s.value,
                                        }),
                                        (0, _.jsx)("small", {
                                          children: s.note,
                                        }),
                                      ],
                                    },
                                    `${e}-${a}`,
                                  );
                                }),
                              },
                              "strip",
                            )
                          : "health" === e
                            ? (0, _.jsxs)(
                                "section",
                                {
                                  className: "panel health-panel",
                                  children: [
                                    (0, _.jsxs)("div", {
                                      className: "panel-heading",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          children: [
                                            (0, _.jsx)("span", {
                                              className: "panel-kicker",
                                              children: "Saúde das contas",
                                            }),
                                            (0, _.jsx)("h2", {
                                              children:
                                                "Onde sua atenção é necessária",
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("button", {
                                          className: "text-button",
                                          onClick: () => s("accounts"),
                                          children: [
                                            "Gerenciar ",
                                            (0, _.jsx)(y, {
                                              name: "arrow",
                                              size: 15,
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "health-summary",
                                      children: [
                                        (0, _.jsx)("div", {
                                          className: "donut",
                                          style: {
                                            background: `conic-gradient(${Ti.length ? Zi : "#3a322c 0 100%"})`,
                                          },
                                          children: (0, _.jsxs)("div", {
                                            children: [
                                              (0, _.jsx)("strong", {
                                                children: Ti.length,
                                              }),
                                              (0, _.jsx)("span", {
                                                children: "contas",
                                              }),
                                            ],
                                          }),
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "health-legend",
                                          children: [
                                            (0, _.jsxs)("button", {
                                              onClick: () => {
                                                (v("Saudável"), s("accounts"));
                                              },
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("i", {
                                                      className: "healthy-dot",
                                                    }),
                                                    "Saudáveis",
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children: Li.Saudável,
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("button", {
                                              onClick: () => {
                                                (v("Restrita"), s("accounts"));
                                              },
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("i", {
                                                      className:
                                                        "restricted-dot",
                                                    }),
                                                    "Restritas pela Meta",
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children: Li.Restrita,
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("button", {
                                              onClick: () => {
                                                (v("Limite atingido"),
                                                  s("accounts"));
                                              },
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("i", {
                                                      className: "waiting-dot",
                                                    }),
                                                    "Limite de vídeos",
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children:
                                                    Li["Limite atingido"],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("button", {
                                              onClick: () => {
                                                (v("Desconectada"),
                                                  s("accounts"));
                                              },
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("i", {
                                                      className:
                                                        "disconnected-dot",
                                                    }),
                                                    "Desconectadas",
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children: Li.Desconectada,
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("button", {
                                              onClick: () => {
                                                (v("Aguardando Meta"),
                                                  s("accounts"));
                                              },
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("i", {
                                                      className: "waiting-dot",
                                                    }),
                                                    "Aguardando Meta",
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children:
                                                    Li["Aguardando Meta"],
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    Li.Restrita + Li.Desconectada > 0
                                      ? (0, _.jsxs)("div", {
                                          className: "health-alert",
                                          children: [
                                            (0, _.jsx)("span", {
                                              className: "alert-icon",
                                              children: (0, _.jsx)(y, {
                                                name: "shield",
                                              }),
                                            }),
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsxs)("strong", {
                                                  children: [
                                                    Li.Restrita +
                                                      Li.Desconectada,
                                                    " contas precisam de revisão",
                                                  ],
                                                }),
                                                (0, _.jsx)("p", {
                                                  children:
                                                    "Acompanhe restrições e expiração de conexão.",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("button", {
                                              onClick: () => s("accounts"),
                                              children: (0, _.jsx)(y, {
                                                name: "arrow",
                                              }),
                                            }),
                                          ],
                                        })
                                      : null,
                                  ],
                                },
                                "health",
                              )
                            : "focus" === e
                              ? Ji
                                ? (0, _.jsx)(
                                    Ge,
                                    {
                                      users: Qi,
                                      periodLabel: yi.label,
                                      onOpen: er,
                                      onSeePerformance: () => {
                                        (s("reports"), Wr());
                                      },
                                    },
                                    "focus",
                                  )
                                : null
                              : "accounts" === e
                                ? (0, _.jsxs)(
                                    "section",
                                    {
                                      className: "panel accounts-preview",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "panel-heading",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "panel-kicker",
                                                  children: "Base operacional",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Perfis monitorados",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className: "segmented",
                                              children: [
                                                (0, _.jsx)("button", {
                                                  className:
                                                    "priority" === Ds
                                                      ? "active"
                                                      : "",
                                                  onClick: () => Us("priority"),
                                                  children: "Prioridade",
                                                }),
                                                (0, _.jsx)("button", {
                                                  className:
                                                    "performance" === Ds
                                                      ? "active"
                                                      : "",
                                                  onClick: () =>
                                                    Us("performance"),
                                                  children: "Performance",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsx)(Ke, {
                                          rows: Pi,
                                          onInspect: (e) => {
                                            let a = B.find(
                                              (a) =>
                                                `@${a.username}` === e.handle,
                                            );
                                            a && Qr(a);
                                          },
                                        }),
                                        (0, _.jsxs)("button", {
                                          className: "table-footer-button",
                                          onClick: () => s("accounts"),
                                          children: [
                                            "Ver ",
                                            Ti.length,
                                            " contas ",
                                            (0, _.jsx)(y, { name: "arrow" }),
                                          ],
                                        }),
                                      ],
                                    },
                                    "accounts",
                                  )
                                : null,
                    ),
                  ],
                })
              : "accounts" === e
                ? (0, _.jsxs)("div", {
                    className: "content accounts-page",
                    children: [
                      (0, _.jsxs)("div", {
                        className: "page-heading",
                        children: [
                          (0, _.jsxs)("div", {
                            children: [
                              (0, _.jsxs)("span", {
                                className: "eyebrow",
                                children: [
                                  (0, _.jsx)(y, { name: "users", size: 14 }),
                                  " Base operacional",
                                ],
                              }),
                              (0, _.jsx)("h1", { children: "Contas" }),
                              (0, _.jsx)("p", {
                                children:
                                  "Peça conexão, aceite o convite e acompanhe a base no mesmo lugar.",
                              }),
                            ],
                          }),
                          (0, _.jsxs)("button", {
                            className: "primary-button",
                            disabled: !Bs,
                            onClick: () => Bs && N(!0),
                            children: [
                              (0, _.jsx)(y, { name: "upload" }),
                              Bs ? "Importar CSV" : "Somente leitura",
                            ],
                          }),
                        ],
                      }),
                      H &&
                        (0, _.jsx)("div", {
                          className: "operation-banner saving",
                          children: "Carregando as contas da base operacional…",
                        }),
                      W &&
                        (0, _.jsxs)("div", {
                          className: "operation-banner error",
                          children: [
                            "A leitura das contas demorou mais que o esperado. ",
                            (0, _.jsx)("button", {
                              className: "text-button",
                              onClick: () => {
                                Rr();
                              },
                              children: "Tentar novamente",
                            }),
                          ],
                        }),
                      Cn &&
                        (0, _.jsx)("div", {
                          className: `operation-banner ${fn}`,
                          children: Cn,
                        }),
                      (0, _.jsx)(ConnectQueue, { canOperate: Bs }),
                      (0, _.jsxs)("section", {
                        className: "status-strip",
                        children: [
                          Object.entries(Li).map(([e, a]) =>
                            (0, _.jsxs)(
                              "button",
                              {
                                className: j === e ? "selected" : "",
                                onClick: () => v(j === e ? "Todas" : e),
                                children: [
                                  (0, _.jsx)(Le, { status: e }),
                                  (0, _.jsx)("strong", {
                                    children: H ? "…" : a,
                                  }),
                                ],
                              },
                              e,
                            ),
                          ),
                          (0, _.jsxs)("div", {
                            children: [
                              (0, _.jsx)("span", {
                                children: "Sem modelo definido",
                              }),
                              (0, _.jsx)("strong", { children: H ? "…" : Ui }),
                            ],
                          }),
                        ],
                      }),
                      (0, _.jsxs)("section", {
                        className: "panel account-directory",
                        children: [
                          (0, _.jsxs)("div", {
                            className: "directory-toolbar expanded-toolbar",
                            children: [
                              (0, _.jsxs)("div", {
                                className: "table-search",
                                children: [
                                  (0, _.jsx)(y, { name: "search" }),
                                  (0, _.jsx)("input", {
                                    value: p,
                                    onChange: (e) => x(e.target.value),
                                    placeholder:
                                      "Buscar por @, modelo, player, grupo ou nicho",
                                    "aria-label": "Buscar contas",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                "aria-label": "Filtrar por modelo",
                                value: Q,
                                onChange: (e) => ee(e.target.value),
                                children: [
                                  (0, _.jsx)("option", { children: "Todos" }),
                                  [...new Set(Ni.map((e) => e.model))].map(
                                    (e) =>
                                      (0, _.jsx)("option", { children: e }, e),
                                  ),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                "aria-label": "Filtrar por player",
                                value: ne,
                                onChange: (e) => re(e.target.value),
                                children: [
                                  (0, _.jsx)("option", { children: "Todos" }),
                                  [...new Set(Ni.map((e) => e.player))].map(
                                    (e) =>
                                      (0, _.jsx)("option", { children: e }, e),
                                  ),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                "aria-label": "Filtrar por grupo",
                                value: me,
                                onChange: (e) => $e(e.target.value),
                                children: [
                                  (0, _.jsx)("option", { children: "Todos" }),
                                  [
                                    ...new Set(
                                      Ni.map((e) => e.groupName || "Sem grupo"),
                                    ),
                                  ].map((e) =>
                                    (0, _.jsx)("option", { children: e }, e),
                                  ),
                                ],
                              }),
                              (0, _.jsx)(oe, {
                                includeAll: !0,
                                value: Ea,
                                onChange: (e) => Aa(e),
                                ariaLabel: "Filtrar por app Meta",
                              }),
                              (0, _.jsxs)("select", {
                                "aria-label": "Filtrar por prioridade",
                                value: Ve,
                                onChange: (e) => Je(e.target.value),
                                children: [
                                  (0, _.jsx)("option", { children: "Todas" }),
                                  (0, _.jsx)("option", { children: "Alta" }),
                                  (0, _.jsx)("option", { children: "Média" }),
                                  (0, _.jsx)("option", { children: "Normal" }),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                "aria-label": "Ordenar contas",
                                value: We,
                                onChange: (e) => Xe(e.target.value),
                                children: [
                                  (0, _.jsx)("option", {
                                    value: "recent",
                                    children: "Mais recentes",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "followers",
                                    children: "Mais seguidores",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "views",
                                    children: "Mais visualizações",
                                  }),
                                ],
                              }),
                              (0, _.jsx)("button", {
                                className: "outline-button compact-button",
                                onClick: () =>
                                  Se("nexoflow-contas.csv", [
                                    [
                                      "Conta",
                                      "Modelo",
                                      "Player",
                                      "Grupo",
                                      "Nicho",
                                      "Saúde",
                                      "Views 30d",
                                      "Alcance 30d",
                                      "Seguidores",
                                      "Na fila",
                                      "Prioridade",
                                    ],
                                    ...qi.map((e) => [
                                      e.username,
                                      e.model,
                                      e.player,
                                      e.groupName,
                                      e.niche,
                                      Ce(e),
                                      e.views30d,
                                      e.reach30d,
                                      e.followersCount,
                                      e.queueCount,
                                      e.priority,
                                    ]),
                                  ]),
                                children: "Exportar CSV",
                              }),
                              (0, _.jsxs)("small", {
                                children: [
                                  qi.length,
                                  " de ",
                                  Ti.length,
                                  " contas",
                                ],
                              }),
                            ],
                          }),
                          Y.length > 0 &&
                            (0, _.jsxs)("div", {
                              className: "bulk-toolbar",
                              children: [
                                (0, _.jsxs)("strong", {
                                  children: [Y.length, " selecionada(s)"],
                                }),
                                (0, _.jsx)("span", {
                                  children:
                                    "Altere modelo, player, grupo, nicho ou prioridade em conjunto.",
                                }),
                                (0, _.jsx)("button", {
                                  className: "primary-button",
                                  onClick: () => {
                                    (aa("bulk"), na(Ie), Ze(!0));
                                  },
                                  children: "Editar seleção",
                                }),
                                "owner" === ha?.currentUser.role &&
                                  (0, _.jsx)("button", {
                                    type: "button",
                                    className: "text-button danger-action",
                                    onClick: () => {
                                      sl(Y);
                                    },
                                    children: "Excluir seleção",
                                  }),
                                (0, _.jsx)("button", {
                                  className: "text-button",
                                  onClick: () => Z([]),
                                  children: "Limpar",
                                }),
                              ],
                            }),
                          !W &&
                            (0, _.jsx)(qe, {
                              rows: qi,
                              selected: Y,
                              onToggle: (e) =>
                                Z(
                                  Y.includes(e)
                                    ? Y.filter((a) => a !== e)
                                    : [...Y, e],
                                ),
                              onToggleAll: () =>
                                Z(
                                  qi.every((e) => Y.includes(e.id))
                                    ? Y.filter(
                                        (e) => !qi.some((a) => a.id === e),
                                      )
                                    : [
                                        ...new Set([
                                          ...Y,
                                          ...qi.map((e) => e.id),
                                        ]),
                                      ],
                                ),
                              onEdit: Qr,
                              canEdit: Bs,
                            }),
                        ],
                      }),
                    ],
                  })
                : "vault" === e
                  ? (0, _.jsxs)("div", {
                      className: "content vault-page",
                      children: [
                        (0, _.jsxs)("div", {
                          className: "page-heading",
                          children: [
                            (0, _.jsxs)("div", {
                              children: [
                                (0, _.jsxs)("span", {
                                  className: "eyebrow",
                                  children: [
                                    (0, _.jsx)(y, { name: "shield", size: 14 }),
                                    " Central de contas",
                                  ],
                                }),
                                (0, _.jsx)("h1", {
                                  children:
                                    "Toda a sua operação, finalmente organizada.",
                                }),
                                (0, _.jsx)("p", {
                                  children:
                                    "Contas, acessos, responsáveis e próximos passos em um só lugar. Cadastre perfil novo mesmo sem conectar na Meta.",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("div", {
                              className: "heading-actions",
                              children: [
                                (0, _.jsxs)("button", {
                                  type: "button",
                                  className: "outline-button",
                                  disabled: !Bs,
                                  onClick: () => Bs && N(!0),
                                  children: [
                                    (0, _.jsx)(y, { name: "upload" }),
                                    "Importar CSV",
                                  ],
                                }),
                                (0, _.jsx)("button", {
                                  type: "button",
                                  className: "outline-button",
                                  onClick: () => {
                                    (is(null), ls(!1), cs(!0), ps("inventory"));
                                  },
                                  children: "Cadastrar lista",
                                }),
                                (0, _.jsxs)("button", {
                                  type: "button",
                                  className: "primary-button",
                                  onClick: () => {
                                    (is(null), cs(!1), ls(!0), ps("inventory"));
                                  },
                                  children: [
                                    (0, _.jsx)(y, { name: "plus" }),
                                    "Nova conta",
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsx)("nav", {
                          className: "vault-nav",
                          children: [
                            { id: "overview", label: "Visão geral" },
                            {
                              id: "inventory",
                              label: "Contas",
                              count: Ni.length,
                            },
                            {
                              id: "pendencias",
                              label: "Pendências",
                              count: or.length,
                            },
                          ].map((e) =>
                            (0, _.jsxs)(
                              "button",
                              {
                                type: "button",
                                className: us === e.id ? "active" : "",
                                onClick: () => ps(e.id),
                                children: [
                                  e.label,
                                  "number" == typeof e.count
                                    ? (0, _.jsx)("em", {
                                        className:
                                          "pendencias" === e.id && e.count
                                            ? "hot"
                                            : "",
                                        children: e.count,
                                      })
                                    : null,
                                ],
                              },
                              e.id,
                            ),
                          ),
                        }),
                        Cn &&
                          (0, _.jsx)("div", {
                            className: `operation-banner ${fn}`,
                            children: Cn,
                          }),
                        G
                          ? (0, _.jsxs)(_.Fragment, {
                              children: [
                                "inventory" !== us &&
                                  (0, _.jsx)("section", {
                                    className: "vault-metrics",
                                    children: [
                                      {
                                        filter: "todas",
                                        label: "Contas cadastradas",
                                        value: Ni.filter(
                                          (e) => "caida" !== e.lifecycle,
                                        ).length,
                                        note: `${Ee(Ni.filter((e) => "caida" !== e.lifecycle).map((e) => e.model)).length} grupos / modelos`,
                                      },
                                      {
                                        filter: "operacionais",
                                        label: "Operacionais",
                                        value: cr,
                                        note: "prontas para operar",
                                        pane: "inventory",
                                      },
                                      {
                                        filter: "checkpoint",
                                        label: "Precisam de atenção",
                                        value: or.length,
                                        note: "checkpoints, restrições ou acessos",
                                        pane: "pendencias",
                                      },
                                      {
                                        filter: "completas",
                                        label: "Acessos completos",
                                        value: lr.complete,
                                        note: "e-mail, 2FA, senha e telefone",
                                      },
                                    ].map((e) =>
                                      (0, _.jsxs)(
                                        "button",
                                        {
                                          type: "button",
                                          className: "vault-metric",
                                          onClick: () => {
                                            (Da(e.filter),
                                              ps(e.pane || "inventory"));
                                          },
                                          children: [
                                            (0, _.jsx)("span", {
                                              children: e.label,
                                            }),
                                            (0, _.jsx)("strong", {
                                              children: e.value,
                                            }),
                                            (0, _.jsx)("small", {
                                              children: e.note,
                                            }),
                                          ],
                                        },
                                        e.label,
                                      ),
                                    ),
                                  }),
                                "inventory" !== us &&
                                  (0, _.jsxs)("div", {
                                    className: "vault-overview-grid",
                                    children: [
                                      (0, _.jsxs)("section", {
                                        className: "panel vault-priority-panel",
                                        children: [
                                          (0, _.jsxs)("div", {
                                            className: "panel-heading",
                                            children: [
                                              (0, _.jsxs)("div", {
                                                children: [
                                                  (0, _.jsx)("span", {
                                                    className: "panel-kicker",
                                                    children: "Prioridades",
                                                  }),
                                                  (0, _.jsx)("h2", {
                                                    children:
                                                      "O que precisa da sua atenção",
                                                  }),
                                                ],
                                              }),
                                              (0, _.jsxs)("button", {
                                                type: "button",
                                                className: "text-button",
                                                onClick: () => {
                                                  (cs(!1),
                                                    ls(!0),
                                                    ps("inventory"));
                                                },
                                                children: [
                                                  (0, _.jsx)(y, {
                                                    name: "plus",
                                                    size: 14,
                                                  }),
                                                  "Nova conta",
                                                ],
                                              }),
                                            ],
                                          }),
                                          or.length
                                            ? or
                                                .slice(
                                                  0,
                                                  "pendencias" === us ? 40 : 6,
                                                )
                                                .map((e) =>
                                                  (0, _.jsxs)(
                                                    "button",
                                                    {
                                                      type: "button",
                                                      className: `vault-priority ${e.severity}`,
                                                      onClick: () => {
                                                        (ps("inventory"),
                                                          is(e.account.id),
                                                          ls(!1),
                                                          cs(!1));
                                                      },
                                                      children: [
                                                        (0, _.jsx)("b", {
                                                          children: "!",
                                                        }),
                                                        (0, _.jsxs)("span", {
                                                          children: [
                                                            (0, _.jsxs)(
                                                              "strong",
                                                              {
                                                                children: [
                                                                  "@",
                                                                  e.account
                                                                    .username,
                                                                  " · ",
                                                                  e.title,
                                                                ],
                                                              },
                                                            ),
                                                            (0, _.jsx)(
                                                              "small",
                                                              {
                                                                children:
                                                                  e.detail,
                                                              },
                                                            ),
                                                          ],
                                                        }),
                                                        (0, _.jsx)("em", {
                                                          children:
                                                            e.account.player ||
                                                            "Sem player",
                                                        }),
                                                      ],
                                                    },
                                                    e.account.id,
                                                  ),
                                                )
                                            : (0, _.jsxs)("div", {
                                                className:
                                                  "automation-empty compact",
                                                children: [
                                                  (0, _.jsx)("h3", {
                                                    children: "Nada pendente",
                                                  }),
                                                  (0, _.jsx)("p", {
                                                    children:
                                                      "E-mail, senha e 2FA estão em dia nesta operação.",
                                                  }),
                                                ],
                                              }),
                                        ],
                                      }),
                                      (0, _.jsxs)("section", {
                                        className: "panel vault-coverage-panel",
                                        children: [
                                          (0, _.jsx)("div", {
                                            className: "panel-heading",
                                            children: (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "panel-kicker",
                                                  children: "Segurança",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Cobertura dos acessos",
                                                }),
                                              ],
                                            }),
                                          }),
                                          (0, _.jsxs)("div", {
                                            className: "vault-coverage",
                                            children: [
                                              (0, _.jsx)("div", {
                                                className: "vault-ring",
                                                style: {
                                                  background: `conic-gradient(var(--success) 0 ${lr.percent}%, var(--mint) ${lr.percent}% ${lr.percent + Math.round((lr.partial / Math.max(1, lr.total)) * 100)}%, rgba(255,255,255,.08) 0)`,
                                                },
                                                children: (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsxs)("strong", {
                                                      children: [
                                                        lr.percent,
                                                        "%",
                                                      ],
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "completo",
                                                    }),
                                                  ],
                                                }),
                                              }),
                                              (0, _.jsxs)("ul", {
                                                children: [
                                                  (0, _.jsxs)("li", {
                                                    children: [
                                                      (0, _.jsx)("i", {
                                                        className: "ok",
                                                      }),
                                                      "E-mail + 2FA + senha + telefone ",
                                                      (0, _.jsx)("b", {
                                                        children: lr.complete,
                                                      }),
                                                    ],
                                                  }),
                                                  (0, _.jsxs)("li", {
                                                    children: [
                                                      (0, _.jsx)("i", {
                                                        className: "warn",
                                                      }),
                                                      "Parcial ",
                                                      (0, _.jsx)("b", {
                                                        children: lr.partial,
                                                      }),
                                                    ],
                                                  }),
                                                  (0, _.jsxs)("li", {
                                                    children: [
                                                      (0, _.jsx)("i", {
                                                        className: "danger",
                                                      }),
                                                      "Sem senha no cofre ",
                                                      (0, _.jsx)("b", {
                                                        children: Ni.filter(
                                                          (e) =>
                                                            !e.hasLoginPassword,
                                                        ).length,
                                                      }),
                                                    ],
                                                  }),
                                                ],
                                              }),
                                            ],
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                "pendencias" !== us &&
                                  (0, _.jsxs)(_.Fragment, {
                                    children: [
                                      (0, _.jsxs)("div", {
                                        className:
                                          "queue-filters panel vault-toolbar",
                                        children: [
                                          (0, _.jsxs)("div", {
                                            className: "table-search",
                                            children: [
                                              (0, _.jsx)(y, { name: "search" }),
                                              (0, _.jsx)("input", {
                                                value: Ua,
                                                onChange: (e) =>
                                                  Ba(e.target.value),
                                                placeholder:
                                                  "Buscar por @, e-mail, telefone, modelo ou player",
                                              }),
                                            ],
                                          }),
                                          (0, _.jsxs)("select", {
                                            value: Va,
                                            onChange: (e) => {
                                              (Ga(e.target.value), Ha("Todos"));
                                            },
                                            children: [
                                              (0, _.jsx)("option", {
                                                value: "none",
                                                children: "Inventário único",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "model",
                                                children: "Agrupar por modelo",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "player",
                                                children: "Agrupar por player",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "group",
                                                children: "Agrupar por grupo",
                                              }),
                                            ],
                                          }),
                                          (0, _.jsxs)("select", {
                                            value: Ja,
                                            onChange: (e) => Ha(e.target.value),
                                            children: [
                                              (0, _.jsx)("option", {
                                                children: "Todos",
                                              }),
                                              sr.map((e) =>
                                                (0, _.jsx)(
                                                  "option",
                                                  { children: e },
                                                  e,
                                                ),
                                              ),
                                            ],
                                          }),
                                          (0, _.jsxs)("select", {
                                            value: za,
                                            onChange: (e) => Da(e.target.value),
                                            children: [
                                              (0, _.jsx)("option", {
                                                value: "todas",
                                                children: "Todos os status",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "operacionais",
                                                children: "Operacionais",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "checkpoint",
                                                children: "Checkpoint",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "incompletas",
                                                children: "Cadastro incompleto",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "completas",
                                                children: "Acessos completos",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "sem_senha",
                                                children: "Sem senha",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "sem_meta",
                                                children: "Ainda sem Meta",
                                              }),
                                              (0, _.jsx)("option", {
                                                value: "caidas",
                                                children: "Caídas / arquivo",
                                              }),
                                            ],
                                          }),
                                          (0, _.jsx)("button", {
                                            type: "button",
                                            className:
                                              "outline-button compact-button",
                                            onClick: () =>
                                              Se("nexoflow-acessos.csv", [
                                                [
                                                  "Conta",
                                                  "Modelo",
                                                  "Player",
                                                  "Grupo",
                                                  "Nicho",
                                                  "E-mail",
                                                  "Recuperação",
                                                  "Telefone",
                                                  "2FA",
                                                  "Senha guardada",
                                                  "Meta",
                                                  "Saúde",
                                                ],
                                                ...ar.map((e) => {
                                                  let a = Xa[e.id] || De(e);
                                                  return [
                                                    e.username,
                                                    a.model || e.model,
                                                    a.player || e.player,
                                                    a.groupName || e.groupName,
                                                    a.niche || e.niche,
                                                    a.loginEmail,
                                                    a.recoveryEmail,
                                                    a.phoneNumber,
                                                    a.twoFactorMethod,
                                                    e.hasLoginPassword
                                                      ? "sim"
                                                      : "não",
                                                    e.connectionStatus,
                                                    Ce(e),
                                                  ];
                                                }),
                                              ]),
                                            children: "Exportar CSV",
                                          }),
                                          (0, _.jsxs)("small", {
                                            children: [
                                              ar.length,
                                              " de ",
                                              Ni.length,
                                              " contas",
                                            ],
                                          }),
                                        ],
                                      }),
                                      rs &&
                                        (0, _.jsxs)("form", {
                                          className: "vault-composer",
                                          onSubmit: (e) => {
                                            (e.preventDefault(),
                                              (async () => {
                                                if (G) {
                                                  (yn("saving"), Sn(""));
                                                  try {
                                                    let e = await w(
                                                        "/api/accounts",
                                                        {
                                                          method: "POST",
                                                          headers: {
                                                            "content-type":
                                                              "application/json",
                                                          },
                                                          body: JSON.stringify(
                                                            hs,
                                                          ),
                                                        },
                                                      ),
                                                      a = await e.json();
                                                    if (!e.ok || !a.account)
                                                      throw Error(
                                                        a.error ||
                                                          "Não foi possível cadastrar a conta.",
                                                      );
                                                    (xs(Fe),
                                                      ls(!1),
                                                      is(a.account.id),
                                                      yn("success"),
                                                      Sn(
                                                        `@${a.account.username} cadastrada no cofre. Conecte na Meta só quando quiser publicar.`,
                                                      ),
                                                      await Rr());
                                                  } catch (e) {
                                                    (yn("error"),
                                                      Sn(
                                                        e instanceof Error
                                                          ? e.message
                                                          : "Não foi possível cadastrar a conta.",
                                                      ));
                                                  }
                                                }
                                              })());
                                          },
                                          children: [
                                            (0, _.jsxs)("div", {
                                              className: "vault-composer-head",
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "mini-avatar",
                                                  children: "+",
                                                }),
                                                (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsx)("strong", {
                                                      children:
                                                        "Nova conta no cofre",
                                                    }),
                                                    (0, _.jsx)("small", {
                                                      children:
                                                        "Não precisa estar conectada. Depois você autoriza na aba Contas quando for publicar.",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsx)("button", {
                                                  type: "button",
                                                  className: "text-button",
                                                  onClick: () => ls(!1),
                                                  children: "Fechar",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className:
                                                "form-grid compact-grid",
                                              children: [
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "@ do Instagram",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      required: !0,
                                                      maxLength: 30,
                                                      value: hs.username,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          username:
                                                            e.target.value,
                                                        }),
                                                      placeholder: "usuario",
                                                      autoComplete: "off",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Nome interno · opcional",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      maxLength: 120,
                                                      value: hs.displayName,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          displayName:
                                                            e.target.value,
                                                        }),
                                                      placeholder:
                                                        "Apelido da operação",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Modelo",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      list: "vault-model-options",
                                                      maxLength: 120,
                                                      value: hs.model,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          model: e.target.value,
                                                        }),
                                                      placeholder: "Sem modelo",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Player",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      list: "vault-player-options",
                                                      maxLength: 120,
                                                      value: hs.player,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          player:
                                                            e.target.value,
                                                        }),
                                                      placeholder: "Sem player",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Grupo",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      list: "vault-group-options",
                                                      maxLength: 120,
                                                      value: hs.groupName,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          groupName:
                                                            e.target.value,
                                                        }),
                                                      placeholder: "Sem grupo",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Nicho",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      maxLength: 120,
                                                      value: hs.niche,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          niche: e.target.value,
                                                        }),
                                                      placeholder: "Sem nicho",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "E-mail de login",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      type: "email",
                                                      value: hs.loginEmail,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          loginEmail:
                                                            e.target.value,
                                                        }),
                                                      placeholder:
                                                        "email da conta",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "E-mail de recuperação",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      type: "email",
                                                      value: hs.recoveryEmail,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          recoveryEmail:
                                                            e.target.value,
                                                        }),
                                                      placeholder:
                                                        "recuperação",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Telefone",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      value: hs.phoneNumber,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          phoneNumber:
                                                            e.target.value,
                                                        }),
                                                      placeholder: "+55 …",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "2FA do Instagram",
                                                    }),
                                                    (0, _.jsxs)("select", {
                                                      value: hs.twoFactorMethod,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          twoFactorMethod:
                                                            e.target.value,
                                                        }),
                                                      children: [
                                                        (0, _.jsx)("option", {
                                                          value: "",
                                                          children:
                                                            "Não informado",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          children:
                                                            "Aplicativo autenticador",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          children: "SMS",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          children: "E-mail",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          children:
                                                            "Chave física",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          children:
                                                            "Não configurado",
                                                        }),
                                                      ],
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Situação",
                                                    }),
                                                    (0, _.jsxs)("select", {
                                                      value: hs.lifecycle,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          lifecycle:
                                                            e.target.value,
                                                        }),
                                                      children: [
                                                        (0, _.jsx)("option", {
                                                          value: "ativa",
                                                          children:
                                                            "Ativa · operação",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          value: "aquecendo",
                                                          children: "Aquecendo",
                                                        }),
                                                        (0, _.jsx)("option", {
                                                          value: "caida",
                                                          children:
                                                            "Caída · arquivo",
                                                        }),
                                                      ],
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  className: "full-field",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Senha do Instagram",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      type: "password",
                                                      autoComplete:
                                                        "new-password",
                                                      value: hs.loginPassword,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          loginPassword:
                                                            e.target.value,
                                                        }),
                                                      placeholder:
                                                        "Cole a senha se já tiver",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  className: "full-field",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Senha do e-mail",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      type: "password",
                                                      autoComplete:
                                                        "new-password",
                                                      value: hs.emailPassword,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          emailPassword:
                                                            e.target.value,
                                                        }),
                                                      placeholder:
                                                        "Senha da caixa de e-mail",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  className: "full-field",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "2FA do e-mail",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      value: hs.emailTwoFactor,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          emailTwoFactor:
                                                            e.target.value,
                                                        }),
                                                      placeholder:
                                                        "Authy, SMS, códigos de backup…",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  className: "full-field",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Anotação",
                                                    }),
                                                    (0, _.jsx)("textarea", {
                                                      rows: 2,
                                                      value: hs.notes,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          notes: e.target.value,
                                                        }),
                                                      placeholder:
                                                        "PIN, e-mail da Apple, o que for útil na hora de logar",
                                                    }),
                                                  ],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("footer", {
                                              className: "vault-actions",
                                              children: [
                                                (0, _.jsx)("button", {
                                                  type: "button",
                                                  className: "outline-button",
                                                  onClick: () => ls(!1),
                                                  children: "Cancelar",
                                                }),
                                                (0, _.jsx)("button", {
                                                  className: "primary-button",
                                                  disabled: "saving" === fn,
                                                  children:
                                                    "saving" === fn
                                                      ? "Salvando..."
                                                      : "Cadastrar conta",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                      os &&
                                        (0, _.jsxs)("form", {
                                          className:
                                            "vault-composer vault-bulk",
                                          onSubmit: (e) => {
                                            (e.preventDefault(),
                                              (async () => {
                                                if (!G) return;
                                                let e = ds
                                                  .split(/[\s,;]+/)
                                                  .map((e) =>
                                                    e
                                                      .replace(/^@/, "")
                                                      .trim()
                                                      .toLowerCase(),
                                                  )
                                                  .filter(Boolean);
                                                if (!e.length)
                                                  return (
                                                    yn("error"),
                                                    void Sn(
                                                      "Cole pelo menos um @, um por linha.",
                                                    )
                                                  );
                                                (yn("saving"), Sn(""));
                                                try {
                                                  let a = await w(
                                                      "/api/accounts",
                                                      {
                                                        method: "POST",
                                                        headers: {
                                                          "content-type":
                                                            "application/json",
                                                        },
                                                        body: JSON.stringify({
                                                          usernames: e,
                                                          model: hs.model,
                                                          player: hs.player,
                                                          groupName:
                                                            hs.groupName,
                                                          niche: hs.niche,
                                                        }),
                                                      },
                                                    ),
                                                    s = await a.json();
                                                  if (!a.ok)
                                                    throw Error(
                                                      s.error ||
                                                        "Não foi possível cadastrar a lista.",
                                                    );
                                                  (ms(""),
                                                    cs(!1),
                                                    yn("success"),
                                                    Sn(
                                                      `${s.created ?? 0} conta(s) novas no cofre${s.skipped ? ` · ${s.skipped} já existiam` : ""}${s.invalid ? ` · ${s.invalid} @ inválido(s)` : ""}.`,
                                                    ),
                                                    await Rr());
                                                } catch (e) {
                                                  (yn("error"),
                                                    Sn(
                                                      e instanceof Error
                                                        ? e.message
                                                        : "Não foi possível cadastrar a lista.",
                                                    ));
                                                }
                                              })());
                                          },
                                          children: [
                                            (0, _.jsxs)("div", {
                                              className: "vault-composer-head",
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "mini-avatar",
                                                  children: "≡",
                                                }),
                                                (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsx)("strong", {
                                                      children:
                                                        "Cadastrar várias contas",
                                                    }),
                                                    (0, _.jsx)("small", {
                                                      children:
                                                        "Um @ por linha. Elas entram no cofre sem Meta. Dá para preencher e-mail e senha depois, uma a uma.",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsx)("button", {
                                                  type: "button",
                                                  className: "text-button",
                                                  onClick: () => cs(!1),
                                                  children: "Fechar",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className:
                                                "form-grid compact-grid",
                                              children: [
                                                (0, _.jsxs)("label", {
                                                  className: "full-field",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Lista de @",
                                                    }),
                                                    (0, _.jsx)("textarea", {
                                                      required: !0,
                                                      rows: 8,
                                                      value: ds,
                                                      onChange: (e) =>
                                                        ms(e.target.value),
                                                      placeholder:
                                                        "luna.oficial\nmaya.stories\nconta_backup",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Modelo para todas",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      list: "vault-model-options",
                                                      maxLength: 120,
                                                      value: hs.model,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          model: e.target.value,
                                                        }),
                                                      placeholder: "Sem modelo",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Player para todas",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      list: "vault-player-options",
                                                      maxLength: 120,
                                                      value: hs.player,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          player:
                                                            e.target.value,
                                                        }),
                                                      placeholder: "Sem player",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Grupo",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      list: "vault-group-options",
                                                      maxLength: 120,
                                                      value: hs.groupName,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          groupName:
                                                            e.target.value,
                                                        }),
                                                      placeholder: "Sem grupo",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("label", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Nicho",
                                                    }),
                                                    (0, _.jsx)("input", {
                                                      maxLength: 120,
                                                      value: hs.niche,
                                                      onChange: (e) =>
                                                        xs({
                                                          ...hs,
                                                          niche: e.target.value,
                                                        }),
                                                      placeholder: "Sem nicho",
                                                    }),
                                                  ],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("footer", {
                                              className: "vault-actions",
                                              children: [
                                                (0, _.jsx)("button", {
                                                  type: "button",
                                                  className: "outline-button",
                                                  onClick: () => cs(!1),
                                                  children: "Cancelar",
                                                }),
                                                (0, _.jsx)("button", {
                                                  className: "primary-button",
                                                  disabled: "saving" === fn,
                                                  children:
                                                    "saving" === fn
                                                      ? "Cadastrando..."
                                                      : "Cadastrar lista",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                      (0, _.jsx)("datalist", {
                                        id: "vault-model-options",
                                        children: tr.map((e) =>
                                          (0, _.jsx)("option", { value: e }, e),
                                        ),
                                      }),
                                      (0, _.jsx)("datalist", {
                                        id: "vault-player-options",
                                        children: ir.map((e) =>
                                          (0, _.jsx)("option", { value: e }, e),
                                        ),
                                      }),
                                      (0, _.jsx)("datalist", {
                                        id: "vault-group-options",
                                        children: rr.map((e) =>
                                          (0, _.jsx)("option", { value: e }, e),
                                        ),
                                      }),
                                      (0, _.jsxs)("section", {
                                        className: "panel vault-inventory",
                                        children: [
                                          (0, _.jsxs)("div", {
                                            className: "panel-heading",
                                            children: [
                                              (0, _.jsxs)("div", {
                                                children: [
                                                  (0, _.jsx)("span", {
                                                    className: "panel-kicker",
                                                    children:
                                                      "Inventário central",
                                                  }),
                                                  (0, _.jsx)("h2", {
                                                    children:
                                                      "Contas do Instagram",
                                                  }),
                                                ],
                                              }),
                                              (0, _.jsxs)("span", {
                                                className: "date-pill",
                                                children: [
                                                  ar.length,
                                                  " de ",
                                                  Ni.length,
                                                ],
                                              }),
                                            ],
                                          }),
                                          (0, _.jsxs)("div", {
                                            className: "vault-inventory-head",
                                            children: [
                                              (0, _.jsx)("span", {
                                                children: "Conta",
                                              }),
                                              (0, _.jsx)("span", {
                                                children: "Organização",
                                              }),
                                              (0, _.jsx)("span", {
                                                children: "Responsável",
                                              }),
                                              (0, _.jsx)("span", {
                                                children: "Status",
                                              }),
                                              (0, _.jsx)("span", {
                                                children: "Acesso",
                                              }),
                                            ],
                                          }),
                                          (0, _.jsx)("section", {
                                            className: "vault-board",
                                            children: ar.length
                                              ? nr.map(([e, a]) => {
                                                  let s =
                                                      "none" !== Va && !!Ka[e],
                                                    n = a.filter(we).length,
                                                    t = a.filter(Te).length;
                                                  return (0, _.jsxs)(
                                                    "section",
                                                    {
                                                      className: `vault-group ${s ? "collapsed" : ""} ${"none" === Va ? "flat" : ""}`,
                                                      children: [
                                                        "none" !== Va &&
                                                          (0, _.jsxs)(
                                                            "button",
                                                            {
                                                              type: "button",
                                                              className:
                                                                "vault-group-head",
                                                              onClick: () =>
                                                                Wa((a) => ({
                                                                  ...a,
                                                                  [e]: !a[e],
                                                                })),
                                                              children: [
                                                                (0, _.jsx)(
                                                                  "i",
                                                                  {
                                                                    className:
                                                                      "vault-chevron",
                                                                    "aria-hidden":
                                                                      "true",
                                                                    children:
                                                                      "›",
                                                                  },
                                                                ),
                                                                (0, _.jsx)(
                                                                  "strong",
                                                                  {
                                                                    children: e,
                                                                  },
                                                                ),
                                                                (0, _.jsxs)(
                                                                  "small",
                                                                  {
                                                                    children: [
                                                                      a.length,
                                                                      " conta",
                                                                      1 ===
                                                                      a.length
                                                                        ? ""
                                                                        : "s",
                                                                      n
                                                                        ? ` · ${n} precisam logar`
                                                                        : "",
                                                                      t
                                                                        ? ` · ${t} incompletas`
                                                                        : "",
                                                                    ],
                                                                  },
                                                                ),
                                                              ],
                                                            },
                                                          ),
                                                        !s &&
                                                          (0, _.jsx)("div", {
                                                            className:
                                                              "vault-list",
                                                            children: a.map(
                                                              (e) => {
                                                                let a =
                                                                    Xa[e.id] ||
                                                                    De(e),
                                                                  s = ss[e.id],
                                                                  n =
                                                                    ts === e.id,
                                                                  t = (s) =>
                                                                    Ya((n) => ({
                                                                      ...n,
                                                                      [e.id]: {
                                                                        ...a,
                                                                        ...s,
                                                                      },
                                                                    })),
                                                                  i = Me(e),
                                                                  r = Pe(e, a);
                                                                return (0,
                                                                _.jsxs)(
                                                                  "article",
                                                                  {
                                                                    className: `vault-row ${we(e) ? "needs-login" : ""} ${n ? "expanded" : ""}`,
                                                                    children: [
                                                                      (0,
                                                                      _.jsxs)(
                                                                        "div",
                                                                        {
                                                                          className:
                                                                            "vault-row-toggle",
                                                                          children:
                                                                            [
                                                                              (0,
                                                                              _.jsxs)(
                                                                                "button",
                                                                                {
                                                                                  type: "button",
                                                                                  className:
                                                                                    "vault-row-main",
                                                                                  onClick:
                                                                                    () => {
                                                                                      (ls(
                                                                                        !1,
                                                                                      ),
                                                                                        cs(
                                                                                          !1,
                                                                                        ),
                                                                                        is(
                                                                                          n
                                                                                            ? null
                                                                                            : e.id,
                                                                                        ));
                                                                                    },
                                                                                  children:
                                                                                    [
                                                                                      (0,
                                                                                      _.jsxs)(
                                                                                        "span",
                                                                                        {
                                                                                          className:
                                                                                            "account-cell",
                                                                                          children:
                                                                                            [
                                                                                              (0,
                                                                                              _.jsx)(
                                                                                                "span",
                                                                                                {
                                                                                                  className:
                                                                                                    "mini-avatar",
                                                                                                  children:
                                                                                                    e.username
                                                                                                      .slice(
                                                                                                        0,
                                                                                                        2,
                                                                                                      )
                                                                                                      .toUpperCase(),
                                                                                                },
                                                                                              ),
                                                                                              (0,
                                                                                              _.jsxs)(
                                                                                                "div",
                                                                                                {
                                                                                                  children:
                                                                                                    [
                                                                                                      (0,
                                                                                                      _.jsxs)(
                                                                                                        "strong",
                                                                                                        {
                                                                                                          children:
                                                                                                            [
                                                                                                              "@",
                                                                                                              e.username,
                                                                                                            ],
                                                                                                        },
                                                                                                      ),
                                                                                                      (0,
                                                                                                      _.jsx)(
                                                                                                        "span",
                                                                                                        {
                                                                                                          className:
                                                                                                            "vault-row-meta",
                                                                                                          children:
                                                                                                            e.displayName ||
                                                                                                            a.loginEmail ||
                                                                                                            "Sem nome interno",
                                                                                                        },
                                                                                                      ),
                                                                                                    ],
                                                                                                },
                                                                                              ),
                                                                                            ],
                                                                                        },
                                                                                      ),
                                                                                      (0,
                                                                                      _.jsxs)(
                                                                                        "span",
                                                                                        {
                                                                                          className:
                                                                                            "vault-col",
                                                                                          children:
                                                                                            [
                                                                                              (0,
                                                                                              _.jsx)(
                                                                                                "strong",
                                                                                                {
                                                                                                  children:
                                                                                                    a.model ||
                                                                                                    e.model,
                                                                                                },
                                                                                              ),
                                                                                              (0,
                                                                                              _.jsx)(
                                                                                                "small",
                                                                                                {
                                                                                                  children:
                                                                                                    a.groupName ||
                                                                                                    e.groupName ||
                                                                                                    a.niche ||
                                                                                                    e.niche ||
                                                                                                    "Sem grupo",
                                                                                                },
                                                                                              ),
                                                                                            ],
                                                                                        },
                                                                                      ),
                                                                                      (0,
                                                                                      _.jsxs)(
                                                                                        "span",
                                                                                        {
                                                                                          className:
                                                                                            "vault-col",
                                                                                          children:
                                                                                            [
                                                                                              (0,
                                                                                              _.jsx)(
                                                                                                "strong",
                                                                                                {
                                                                                                  children:
                                                                                                    a.player ||
                                                                                                    e.player,
                                                                                                },
                                                                                              ),
                                                                                              (0,
                                                                                              _.jsx)(
                                                                                                "small",
                                                                                                {
                                                                                                  children:
                                                                                                    "responsável",
                                                                                                },
                                                                                              ),
                                                                                            ],
                                                                                        },
                                                                                      ),
                                                                                      (0,
                                                                                      _.jsx)(
                                                                                        "em",
                                                                                        {
                                                                                          className: `vault-run ${i.key}`,
                                                                                          children:
                                                                                            i.label,
                                                                                        },
                                                                                      ),
                                                                                      (0,
                                                                                      _.jsx)(
                                                                                        "em",
                                                                                        {
                                                                                          className: `vault-access ${r.key}`,
                                                                                          children:
                                                                                            r.label,
                                                                                        },
                                                                                      ),
                                                                                      (0,
                                                                                      _.jsx)(
                                                                                        Ae,
                                                                                        {
                                                                                          account:
                                                                                            e,
                                                                                          draft:
                                                                                            a,
                                                                                        },
                                                                                      ),
                                                                                      (0,
                                                                                      _.jsx)(
                                                                                        "i",
                                                                                        {
                                                                                          className:
                                                                                            "vault-chevron",
                                                                                          "aria-hidden":
                                                                                            "true",
                                                                                          children:
                                                                                            "›",
                                                                                        },
                                                                                      ),
                                                                                    ],
                                                                                },
                                                                              ),
                                                                              (0,
                                                                              _.jsx)(
                                                                                "button",
                                                                                {
                                                                                  type: "button",
                                                                                  className:
                                                                                    "text-button vault-row-copy",
                                                                                  onClick:
                                                                                    (
                                                                                      a,
                                                                                    ) => {
                                                                                      (a.stopPropagation(),
                                                                                        el(
                                                                                          "@",
                                                                                          e.username,
                                                                                        ));
                                                                                    },
                                                                                  children:
                                                                                    "Copiar @",
                                                                                },
                                                                              ),
                                                                            ],
                                                                        },
                                                                      ),
                                                                      n &&
                                                                        (0,
                                                                        _.jsxs)(
                                                                          _.Fragment,
                                                                          {
                                                                            children:
                                                                              [
                                                                                we(
                                                                                  e,
                                                                                ) &&
                                                                                  (0,
                                                                                  _.jsx)(
                                                                                    "p",
                                                                                    {
                                                                                      className:
                                                                                        "vault-alert",
                                                                                      children:
                                                                                        "Abra o Instagram nesta conta, cumpra o aviso e depois reconecte em Integrações.",
                                                                                    },
                                                                                  ),
                                                                                (0,
                                                                                _.jsxs)(
                                                                                  "div",
                                                                                  {
                                                                                    className:
                                                                                      "vault-row-body",
                                                                                    children:
                                                                                      [
                                                                                        (0,
                                                                                        _.jsxs)(
                                                                                          "div",
                                                                                          {
                                                                                            className:
                                                                                              "form-grid compact-grid",
                                                                                            children:
                                                                                              [
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Modelo",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "input",
                                                                                                          {
                                                                                                            list: "vault-model-options",
                                                                                                            value:
                                                                                                              a.model,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    model:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "Sem modelo",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Player",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "input",
                                                                                                          {
                                                                                                            list: "vault-player-options",
                                                                                                            value:
                                                                                                              a.player,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    player:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "Sem player",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Grupo",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "input",
                                                                                                          {
                                                                                                            list: "vault-group-options",
                                                                                                            value:
                                                                                                              a.groupName,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    groupName:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "Sem grupo",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Nicho",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "input",
                                                                                                          {
                                                                                                            value:
                                                                                                              a.niche,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    niche:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "Sem nicho",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "E-mail de login",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "div",
                                                                                                          {
                                                                                                            className:
                                                                                                              "copy-field",
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "input",
                                                                                                                  {
                                                                                                                    type: "email",
                                                                                                                    value:
                                                                                                                      a.loginEmail,
                                                                                                                    onChange:
                                                                                                                      (
                                                                                                                        e,
                                                                                                                      ) =>
                                                                                                                        t(
                                                                                                                          {
                                                                                                                            loginEmail:
                                                                                                                              e
                                                                                                                                .target
                                                                                                                                .value,
                                                                                                                          },
                                                                                                                        ),
                                                                                                                    placeholder:
                                                                                                                      "email da conta",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "button",
                                                                                                                  {
                                                                                                                    type: "button",
                                                                                                                    className:
                                                                                                                      "text-button",
                                                                                                                    onClick:
                                                                                                                      () => {
                                                                                                                        el(
                                                                                                                          "E-mail",
                                                                                                                          a.loginEmail,
                                                                                                                        );
                                                                                                                      },
                                                                                                                    children:
                                                                                                                      "Copiar",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "E-mail de recuperação",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "div",
                                                                                                          {
                                                                                                            className:
                                                                                                              "copy-field",
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "input",
                                                                                                                  {
                                                                                                                    type: "email",
                                                                                                                    value:
                                                                                                                      a.recoveryEmail,
                                                                                                                    onChange:
                                                                                                                      (
                                                                                                                        e,
                                                                                                                      ) =>
                                                                                                                        t(
                                                                                                                          {
                                                                                                                            recoveryEmail:
                                                                                                                              e
                                                                                                                                .target
                                                                                                                                .value,
                                                                                                                          },
                                                                                                                        ),
                                                                                                                    placeholder:
                                                                                                                      "recuperação",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "button",
                                                                                                                  {
                                                                                                                    type: "button",
                                                                                                                    className:
                                                                                                                      "text-button",
                                                                                                                    onClick:
                                                                                                                      () => {
                                                                                                                        el(
                                                                                                                          "E-mail de recuperação",
                                                                                                                          a.recoveryEmail,
                                                                                                                        );
                                                                                                                      },
                                                                                                                    children:
                                                                                                                      "Copiar",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Telefone",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "div",
                                                                                                          {
                                                                                                            className:
                                                                                                              "copy-field",
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "input",
                                                                                                                  {
                                                                                                                    value:
                                                                                                                      a.phoneNumber,
                                                                                                                    onChange:
                                                                                                                      (
                                                                                                                        e,
                                                                                                                      ) =>
                                                                                                                        t(
                                                                                                                          {
                                                                                                                            phoneNumber:
                                                                                                                              e
                                                                                                                                .target
                                                                                                                                .value,
                                                                                                                          },
                                                                                                                        ),
                                                                                                                    placeholder:
                                                                                                                      "+55 …",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "button",
                                                                                                                  {
                                                                                                                    type: "button",
                                                                                                                    className:
                                                                                                                      "text-button",
                                                                                                                    onClick:
                                                                                                                      () => {
                                                                                                                        el(
                                                                                                                          "Telefone",
                                                                                                                          a.phoneNumber,
                                                                                                                        );
                                                                                                                      },
                                                                                                                    children:
                                                                                                                      "Copiar",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "2FA do Instagram",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "select",
                                                                                                          {
                                                                                                            value:
                                                                                                              a.twoFactorMethod,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    twoFactorMethod:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    value:
                                                                                                                      "",
                                                                                                                    children:
                                                                                                                      "Não informado",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    children:
                                                                                                                      "Aplicativo autenticador",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    children:
                                                                                                                      "SMS",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    children:
                                                                                                                      "E-mail",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    children:
                                                                                                                      "Chave física",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    children:
                                                                                                                      "Não configurado",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Situação",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "select",
                                                                                                          {
                                                                                                            value:
                                                                                                              a.lifecycle,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    lifecycle:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    value:
                                                                                                                      "ativa",
                                                                                                                    children:
                                                                                                                      "Ativa · operação",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    value:
                                                                                                                      "aquecendo",
                                                                                                                    children:
                                                                                                                      "Aquecendo",
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "option",
                                                                                                                  {
                                                                                                                    value:
                                                                                                                      "caida",
                                                                                                                    children:
                                                                                                                      "Caída · arquivo",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    className:
                                                                                                      "full-field",
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              [
                                                                                                                "Senha do Instagram ",
                                                                                                                e.hasLoginPassword
                                                                                                                  ? "· guardada cifrada"
                                                                                                                  : "· ainda vazia",
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "div",
                                                                                                          {
                                                                                                            className:
                                                                                                              "copy-field",
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "input",
                                                                                                                  {
                                                                                                                    type: s
                                                                                                                      ? "text"
                                                                                                                      : "password",
                                                                                                                    autoComplete:
                                                                                                                      "new-password",
                                                                                                                    value:
                                                                                                                      s ||
                                                                                                                      Za[
                                                                                                                        e
                                                                                                                          .id
                                                                                                                      ] ||
                                                                                                                      "",
                                                                                                                    placeholder:
                                                                                                                      e.hasLoginPassword
                                                                                                                        ? "••••••••"
                                                                                                                        : "Cole a senha e salve",
                                                                                                                    onChange:
                                                                                                                      (
                                                                                                                        a,
                                                                                                                      ) => {
                                                                                                                        (ns(
                                                                                                                          (
                                                                                                                            a,
                                                                                                                          ) => {
                                                                                                                            let s =
                                                                                                                              {
                                                                                                                                ...a,
                                                                                                                              };
                                                                                                                            return (
                                                                                                                              delete s[
                                                                                                                                e
                                                                                                                                  .id
                                                                                                                              ],
                                                                                                                              s
                                                                                                                            );
                                                                                                                          },
                                                                                                                        ),
                                                                                                                          Qa(
                                                                                                                            (
                                                                                                                              s,
                                                                                                                            ) => ({
                                                                                                                              ...s,
                                                                                                                              [e.id]:
                                                                                                                                a
                                                                                                                                  .target
                                                                                                                                  .value,
                                                                                                                            }),
                                                                                                                          ));
                                                                                                                      },
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "button",
                                                                                                                  {
                                                                                                                    type: "button",
                                                                                                                    className:
                                                                                                                      "text-button",
                                                                                                                    onClick:
                                                                                                                      () =>
                                                                                                                        s
                                                                                                                          ? void el(
                                                                                                                              "Senha",
                                                                                                                              s,
                                                                                                                            )
                                                                                                                          : e.hasLoginPassword
                                                                                                                            ? void al(
                                                                                                                                e,
                                                                                                                              )
                                                                                                                            : void el(
                                                                                                                                "Senha",
                                                                                                                                Za[
                                                                                                                                  e
                                                                                                                                    .id
                                                                                                                                ] ||
                                                                                                                                  "",
                                                                                                                              ),
                                                                                                                    children:
                                                                                                                      s
                                                                                                                        ? "Copiar senha"
                                                                                                                        : e.hasLoginPassword
                                                                                                                          ? "Revelar"
                                                                                                                          : "Copiar",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                        e.hasLoginPassword &&
                                                                                                          (0,
                                                                                                          _.jsx)(
                                                                                                            "button",
                                                                                                            {
                                                                                                              type: "button",
                                                                                                              className:
                                                                                                                "text-button danger-action",
                                                                                                              onClick:
                                                                                                                () => {
                                                                                                                  (async (
                                                                                                                    e,
                                                                                                                  ) => {
                                                                                                                    if (
                                                                                                                      G &&
                                                                                                                      e.hasLoginPassword &&
                                                                                                                      window.confirm(
                                                                                                                        `Apagar a senha guardada de @${e.username}?`,
                                                                                                                      )
                                                                                                                    ) {
                                                                                                                      (yn(
                                                                                                                        "saving",
                                                                                                                      ),
                                                                                                                        Sn(
                                                                                                                          "",
                                                                                                                        ));
                                                                                                                      try {
                                                                                                                        let a =
                                                                                                                            await w(
                                                                                                                              "/api/accounts",
                                                                                                                              {
                                                                                                                                method:
                                                                                                                                  "PATCH",
                                                                                                                                headers:
                                                                                                                                  {
                                                                                                                                    "content-type":
                                                                                                                                      "application/json",
                                                                                                                                  },
                                                                                                                                body: JSON.stringify(
                                                                                                                                  {
                                                                                                                                    ids: [
                                                                                                                                      e.id,
                                                                                                                                    ],
                                                                                                                                    clearLoginPassword:
                                                                                                                                      !0,
                                                                                                                                  },
                                                                                                                                ),
                                                                                                                              },
                                                                                                                            ),
                                                                                                                          s =
                                                                                                                            await a.json();
                                                                                                                        if (
                                                                                                                          !a.ok
                                                                                                                        )
                                                                                                                          throw Error(
                                                                                                                            s.error ||
                                                                                                                              "Não foi possível apagar a senha.",
                                                                                                                          );
                                                                                                                        (ns(
                                                                                                                          (
                                                                                                                            a,
                                                                                                                          ) => {
                                                                                                                            let s =
                                                                                                                              {
                                                                                                                                ...a,
                                                                                                                              };
                                                                                                                            return (
                                                                                                                              delete s[
                                                                                                                                e
                                                                                                                                  .id
                                                                                                                              ],
                                                                                                                              s
                                                                                                                            );
                                                                                                                          },
                                                                                                                        ),
                                                                                                                          Qa(
                                                                                                                            (
                                                                                                                              a,
                                                                                                                            ) => ({
                                                                                                                              ...a,
                                                                                                                              [e.id]:
                                                                                                                                "",
                                                                                                                            }),
                                                                                                                          ),
                                                                                                                          yn(
                                                                                                                            "success",
                                                                                                                          ),
                                                                                                                          Sn(
                                                                                                                            `Senha de @${e.username} removida do cofre.`,
                                                                                                                          ),
                                                                                                                          await Rr());
                                                                                                                      } catch (e) {
                                                                                                                        (yn(
                                                                                                                          "error",
                                                                                                                        ),
                                                                                                                          Sn(
                                                                                                                            e instanceof
                                                                                                                              Error
                                                                                                                              ? e.message
                                                                                                                              : "Não foi possível apagar a senha.",
                                                                                                                          ));
                                                                                                                      }
                                                                                                                    }
                                                                                                                  })(
                                                                                                                    e,
                                                                                                                  );
                                                                                                                },
                                                                                                              children:
                                                                                                                "Apagar senha guardada",
                                                                                                            },
                                                                                                          ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    className:
                                                                                                      "full-field",
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              [
                                                                                                                "Senha do e-mail ",
                                                                                                                e.hasEmailPassword
                                                                                                                  ? "· guardada cifrada"
                                                                                                                  : "· ainda vazia",
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsxs)(
                                                                                                          "div",
                                                                                                          {
                                                                                                            className:
                                                                                                              "copy-field",
                                                                                                            children:
                                                                                                              [
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "input",
                                                                                                                  {
                                                                                                                    type: ss[
                                                                                                                      `${e.id}:email`
                                                                                                                    ]
                                                                                                                      ? "text"
                                                                                                                      : "password",
                                                                                                                    autoComplete:
                                                                                                                      "new-password",
                                                                                                                    value:
                                                                                                                      ss[
                                                                                                                        `${e.id}:email`
                                                                                                                      ] ||
                                                                                                                      es[
                                                                                                                        e
                                                                                                                          .id
                                                                                                                      ] ||
                                                                                                                      "",
                                                                                                                    placeholder:
                                                                                                                      e.hasEmailPassword
                                                                                                                        ? "••••••••"
                                                                                                                        : "Cole a senha do e-mail",
                                                                                                                    onChange:
                                                                                                                      (
                                                                                                                        a,
                                                                                                                      ) => {
                                                                                                                        (ns(
                                                                                                                          (
                                                                                                                            a,
                                                                                                                          ) => {
                                                                                                                            let s =
                                                                                                                              {
                                                                                                                                ...a,
                                                                                                                              };
                                                                                                                            return (
                                                                                                                              delete s[
                                                                                                                                `${e.id}:email`
                                                                                                                              ],
                                                                                                                              s
                                                                                                                            );
                                                                                                                          },
                                                                                                                        ),
                                                                                                                          as(
                                                                                                                            (
                                                                                                                              s,
                                                                                                                            ) => ({
                                                                                                                              ...s,
                                                                                                                              [e.id]:
                                                                                                                                a
                                                                                                                                  .target
                                                                                                                                  .value,
                                                                                                                            }),
                                                                                                                          ));
                                                                                                                      },
                                                                                                                  },
                                                                                                                ),
                                                                                                                (0,
                                                                                                                _.jsx)(
                                                                                                                  "button",
                                                                                                                  {
                                                                                                                    type: "button",
                                                                                                                    className:
                                                                                                                      "text-button",
                                                                                                                    onClick:
                                                                                                                      () =>
                                                                                                                        ss[
                                                                                                                          `${e.id}:email`
                                                                                                                        ]
                                                                                                                          ? void el(
                                                                                                                              "Senha do e-mail",
                                                                                                                              ss[
                                                                                                                                `${e.id}:email`
                                                                                                                              ],
                                                                                                                            )
                                                                                                                          : e.hasEmailPassword
                                                                                                                            ? void al(
                                                                                                                                e,
                                                                                                                                "email",
                                                                                                                              )
                                                                                                                            : void el(
                                                                                                                                "Senha do e-mail",
                                                                                                                                es[
                                                                                                                                  e
                                                                                                                                    .id
                                                                                                                                ] ||
                                                                                                                                  "",
                                                                                                                              ),
                                                                                                                    children:
                                                                                                                      ss[
                                                                                                                        `${e.id}:email`
                                                                                                                      ]
                                                                                                                        ? "Copiar senha"
                                                                                                                        : e.hasEmailPassword
                                                                                                                          ? "Revelar"
                                                                                                                          : "Copiar",
                                                                                                                  },
                                                                                                                ),
                                                                                                              ],
                                                                                                          },
                                                                                                        ),
                                                                                                        e.hasEmailPassword &&
                                                                                                          (0,
                                                                                                          _.jsx)(
                                                                                                            "button",
                                                                                                            {
                                                                                                              type: "button",
                                                                                                              className:
                                                                                                                "text-button danger-action",
                                                                                                              onClick:
                                                                                                                () => {
                                                                                                                  (async (
                                                                                                                    e,
                                                                                                                  ) => {
                                                                                                                    if (
                                                                                                                      G &&
                                                                                                                      e.hasEmailPassword &&
                                                                                                                      window.confirm(
                                                                                                                        `Apagar a senha do e-mail de @${e.username}?`,
                                                                                                                      )
                                                                                                                    ) {
                                                                                                                      (yn(
                                                                                                                        "saving",
                                                                                                                      ),
                                                                                                                        Sn(
                                                                                                                          "",
                                                                                                                        ));
                                                                                                                      try {
                                                                                                                        let a =
                                                                                                                            await w(
                                                                                                                              "/api/accounts",
                                                                                                                              {
                                                                                                                                method:
                                                                                                                                  "PATCH",
                                                                                                                                headers:
                                                                                                                                  {
                                                                                                                                    "content-type":
                                                                                                                                      "application/json",
                                                                                                                                  },
                                                                                                                                body: JSON.stringify(
                                                                                                                                  {
                                                                                                                                    ids: [
                                                                                                                                      e.id,
                                                                                                                                    ],
                                                                                                                                    clearEmailPassword:
                                                                                                                                      !0,
                                                                                                                                  },
                                                                                                                                ),
                                                                                                                              },
                                                                                                                            ),
                                                                                                                          s =
                                                                                                                            await a.json();
                                                                                                                        if (
                                                                                                                          !a.ok
                                                                                                                        )
                                                                                                                          throw Error(
                                                                                                                            s.error ||
                                                                                                                              "Não foi possível apagar a senha do e-mail.",
                                                                                                                          );
                                                                                                                        (ns(
                                                                                                                          (
                                                                                                                            a,
                                                                                                                          ) => {
                                                                                                                            let s =
                                                                                                                              {
                                                                                                                                ...a,
                                                                                                                              };
                                                                                                                            return (
                                                                                                                              delete s[
                                                                                                                                `${e.id}:email`
                                                                                                                              ],
                                                                                                                              s
                                                                                                                            );
                                                                                                                          },
                                                                                                                        ),
                                                                                                                          as(
                                                                                                                            (
                                                                                                                              a,
                                                                                                                            ) => ({
                                                                                                                              ...a,
                                                                                                                              [e.id]:
                                                                                                                                "",
                                                                                                                            }),
                                                                                                                          ),
                                                                                                                          yn(
                                                                                                                            "success",
                                                                                                                          ),
                                                                                                                          Sn(
                                                                                                                            `Senha do e-mail de @${e.username} removida do cofre.`,
                                                                                                                          ),
                                                                                                                          await Rr());
                                                                                                                      } catch (e) {
                                                                                                                        (yn(
                                                                                                                          "error",
                                                                                                                        ),
                                                                                                                          Sn(
                                                                                                                            e instanceof
                                                                                                                              Error
                                                                                                                              ? e.message
                                                                                                                              : "Não foi possível apagar a senha do e-mail.",
                                                                                                                          ));
                                                                                                                      }
                                                                                                                    }
                                                                                                                  })(
                                                                                                                    e,
                                                                                                                  );
                                                                                                                },
                                                                                                              children:
                                                                                                                "Apagar senha do e-mail",
                                                                                                            },
                                                                                                          ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    className:
                                                                                                      "full-field",
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "2FA do e-mail",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "input",
                                                                                                          {
                                                                                                            value:
                                                                                                              a.emailTwoFactor,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    emailTwoFactor:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "Authy, SMS, códigos de backup…",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    className:
                                                                                                      "full-field",
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Onde está no cofre externo",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "input",
                                                                                                          {
                                                                                                            value:
                                                                                                              a.vaultReference,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    vaultReference:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "1Password / Bitwarden › Instagram › @perfil",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsxs)(
                                                                                                  "label",
                                                                                                  {
                                                                                                    className:
                                                                                                      "full-field",
                                                                                                    children:
                                                                                                      [
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "span",
                                                                                                          {
                                                                                                            children:
                                                                                                              "Anotação",
                                                                                                          },
                                                                                                        ),
                                                                                                        (0,
                                                                                                        _.jsx)(
                                                                                                          "textarea",
                                                                                                          {
                                                                                                            rows: 2,
                                                                                                            value:
                                                                                                              a.notes,
                                                                                                            onChange:
                                                                                                              (
                                                                                                                e,
                                                                                                              ) =>
                                                                                                                t(
                                                                                                                  {
                                                                                                                    notes:
                                                                                                                      e
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                  },
                                                                                                                ),
                                                                                                            placeholder:
                                                                                                              "PIN do SIM, e-mail da Apple, o que for útil na hora de logar",
                                                                                                          },
                                                                                                        ),
                                                                                                      ],
                                                                                                  },
                                                                                                ),
                                                                                              ],
                                                                                          },
                                                                                        ),
                                                                                        (0,
                                                                                        _.jsxs)(
                                                                                          "footer",
                                                                                          {
                                                                                            className:
                                                                                              "vault-actions",
                                                                                            children:
                                                                                              [
                                                                                                (0,
                                                                                                _.jsx)(
                                                                                                  "button",
                                                                                                  {
                                                                                                    type: "button",
                                                                                                    className:
                                                                                                      "text-button",
                                                                                                    onClick:
                                                                                                      () => {
                                                                                                        el(
                                                                                                          "@",
                                                                                                          e.username,
                                                                                                        );
                                                                                                      },
                                                                                                    children:
                                                                                                      "Copiar @",
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsx)(
                                                                                                  "a",
                                                                                                  {
                                                                                                    className:
                                                                                                      "text-button",
                                                                                                    href: "https://www.instagram.com/accounts/login/",
                                                                                                    target:
                                                                                                      "_blank",
                                                                                                    rel: "noreferrer",
                                                                                                    children:
                                                                                                      "Logar no IG",
                                                                                                  },
                                                                                                ),
                                                                                                (0,
                                                                                                _.jsx)(
                                                                                                  "button",
                                                                                                  {
                                                                                                    type: "button",
                                                                                                    className:
                                                                                                      "primary-button",
                                                                                                    disabled:
                                                                                                      "saving" ===
                                                                                                      fn,
                                                                                                    onClick:
                                                                                                      () => {
                                                                                                        (async (
                                                                                                          e,
                                                                                                        ) => {
                                                                                                          if (
                                                                                                            !G
                                                                                                          )
                                                                                                            return;
                                                                                                          let a =
                                                                                                              Xa[
                                                                                                                e
                                                                                                                  .id
                                                                                                              ] ||
                                                                                                              De(
                                                                                                                e,
                                                                                                              ),
                                                                                                            s =
                                                                                                              Za[
                                                                                                                e
                                                                                                                  .id
                                                                                                              ] ||
                                                                                                              "",
                                                                                                            n =
                                                                                                              es[
                                                                                                                e
                                                                                                                  .id
                                                                                                              ] ||
                                                                                                              "";
                                                                                                          (yn(
                                                                                                            "saving",
                                                                                                          ),
                                                                                                            Sn(
                                                                                                              "",
                                                                                                            ));
                                                                                                          try {
                                                                                                            let t =
                                                                                                                await w(
                                                                                                                  "/api/accounts",
                                                                                                                  {
                                                                                                                    method:
                                                                                                                      "PATCH",
                                                                                                                    headers:
                                                                                                                      {
                                                                                                                        "content-type":
                                                                                                                          "application/json",
                                                                                                                      },
                                                                                                                    body: JSON.stringify(
                                                                                                                      {
                                                                                                                        ids: [
                                                                                                                          e.id,
                                                                                                                        ],
                                                                                                                        loginEmail:
                                                                                                                          a.loginEmail,
                                                                                                                        recoveryEmail:
                                                                                                                          a.recoveryEmail,
                                                                                                                        phoneNumber:
                                                                                                                          a.phoneNumber,
                                                                                                                        twoFactorMethod:
                                                                                                                          a.twoFactorMethod,
                                                                                                                        emailTwoFactor:
                                                                                                                          a.emailTwoFactor,
                                                                                                                        vaultReference:
                                                                                                                          a.vaultReference,
                                                                                                                        notes:
                                                                                                                          a.notes,
                                                                                                                        model:
                                                                                                                          a.model,
                                                                                                                        player:
                                                                                                                          a.player,
                                                                                                                        groupName:
                                                                                                                          a.groupName,
                                                                                                                        niche:
                                                                                                                          a.niche,
                                                                                                                        lifecycle:
                                                                                                                          a.lifecycle,
                                                                                                                        ...(s
                                                                                                                          ? {
                                                                                                                              loginPassword:
                                                                                                                                s,
                                                                                                                            }
                                                                                                                          : {}),
                                                                                                                        ...(n
                                                                                                                          ? {
                                                                                                                              emailPassword:
                                                                                                                                n,
                                                                                                                            }
                                                                                                                          : {}),
                                                                                                                      },
                                                                                                                    ),
                                                                                                                  },
                                                                                                                ),
                                                                                                              i =
                                                                                                                await t.json();
                                                                                                            if (
                                                                                                              !t.ok
                                                                                                            )
                                                                                                              throw Error(
                                                                                                                i.error ||
                                                                                                                  "Não foi possível guardar o acesso.",
                                                                                                              );
                                                                                                            (Qa(
                                                                                                              (
                                                                                                                a,
                                                                                                              ) => ({
                                                                                                                ...a,
                                                                                                                [e.id]:
                                                                                                                  "",
                                                                                                              }),
                                                                                                            ),
                                                                                                              as(
                                                                                                                (
                                                                                                                  a,
                                                                                                                ) => ({
                                                                                                                  ...a,
                                                                                                                  [e.id]:
                                                                                                                    "",
                                                                                                                }),
                                                                                                              ),
                                                                                                              Ya(
                                                                                                                (
                                                                                                                  a,
                                                                                                                ) => {
                                                                                                                  let s =
                                                                                                                    {
                                                                                                                      ...a,
                                                                                                                    };
                                                                                                                  return (
                                                                                                                    delete s[
                                                                                                                      e
                                                                                                                        .id
                                                                                                                    ],
                                                                                                                    s
                                                                                                                  );
                                                                                                                },
                                                                                                              ),
                                                                                                              yn(
                                                                                                                "success",
                                                                                                              ),
                                                                                                              Sn(
                                                                                                                `Acesso de @${e.username} salvo.`,
                                                                                                              ),
                                                                                                              await Rr());
                                                                                                          } catch (e) {
                                                                                                            (yn(
                                                                                                              "error",
                                                                                                            ),
                                                                                                              Sn(
                                                                                                                e instanceof
                                                                                                                  Error
                                                                                                                  ? e.message
                                                                                                                  : "Não foi possível guardar o acesso.",
                                                                                                              ));
                                                                                                          }
                                                                                                        })(
                                                                                                          e,
                                                                                                        );
                                                                                                      },
                                                                                                    children:
                                                                                                      "Salvar acesso",
                                                                                                  },
                                                                                                ),
                                                                                              ],
                                                                                          },
                                                                                        ),
                                                                                      ],
                                                                                  },
                                                                                ),
                                                                              ],
                                                                          },
                                                                        ),
                                                                    ],
                                                                  },
                                                                  e.id,
                                                                );
                                                              },
                                                            ),
                                                          }),
                                                      ],
                                                    },
                                                    e,
                                                  );
                                                })
                                              : (0, _.jsxs)("div", {
                                                  className:
                                                    "automation-empty compact",
                                                  children: [
                                                    (0, _.jsx)(y, {
                                                      name: "users",
                                                      size: 26,
                                                    }),
                                                    (0, _.jsx)("h3", {
                                                      children:
                                                        "Nenhuma conta neste filtro",
                                                    }),
                                                    (0, _.jsx)("p", {
                                                      children:
                                                        "Cadastre um perfil novo, cole uma lista de @ ou limpe a busca.",
                                                    }),
                                                  ],
                                                }),
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                              ],
                            })
                          : (0, _.jsxs)("div", {
                              className: "automation-empty",
                              children: [
                                (0, _.jsx)(y, { name: "shield", size: 28 }),
                                (0, _.jsx)("h3", {
                                  children:
                                    "Somente o administrador vê o cofre",
                                }),
                                (0, _.jsx)("p", {
                                  children:
                                    "E-mails, telefones e senhas ficam visíveis só para quem criou a operação.",
                                }),
                              ],
                            }),
                      ],
                    })
                  : "campaigns" === e
                    ? (0, _.jsxs)("div", {
                        className: "content automation-page",
                        children: [
                          (0, _.jsxs)("div", {
                            className: "page-heading",
                            children: [
                              (0, _.jsxs)("div", {
                                children: [
                                  (0, _.jsxs)("span", {
                                    className: "eyebrow",
                                    children: [
                                      (0, _.jsx)(y, {
                                        name: "campaign",
                                        size: 14,
                                      }),
                                      " Automação multicanal",
                                    ],
                                  }),
                                  (0, _.jsx)("h1", { children: "Campanhas" }),
                                  (0, _.jsx)("p", {
                                    children:
                                      "Crie, organize e agende publicações com legenda opcional e sem comentários automáticos.",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("button", {
                                className: "primary-button",
                                disabled: !Bs,
                                onClick: () => Bs && Zr(),
                                children: [
                                  (0, _.jsx)(y, {
                                    name: ra.publishingEnabled
                                      ? "plus"
                                      : "campaign",
                                  }),
                                  Bs
                                    ? ra.publishingEnabled
                                      ? "Nova campanha"
                                      : "Novo rascunho"
                                    : "Somente leitura",
                                ],
                              }),
                            ],
                          }),
                          Cn &&
                            (0, _.jsx)("div", {
                              className: `operation-banner ${fn}`,
                              children: Cn,
                            }),
                          (0, _.jsxs)("section", {
                            className: "automation-flow panel",
                            children: [
                              (0, _.jsxs)("div", {
                                children: [
                                  (0, _.jsx)("span", {
                                    className: "flow-icon mint-flow",
                                    children: (0, _.jsx)(y, { name: "upload" }),
                                  }),
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)("b", { children: "01" }),
                                      (0, _.jsx)("strong", {
                                        children: "Upload em lote",
                                      }),
                                      (0, _.jsx)("small", {
                                        children:
                                          "Até 50 vídeos ou imagens por campanha",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              (0, _.jsx)("i", {}),
                              (0, _.jsxs)("div", {
                                children: [
                                  (0, _.jsx)("span", {
                                    className: "flow-icon violet-flow",
                                    children: (0, _.jsx)(y, { name: "users" }),
                                  }),
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)("b", { children: "02" }),
                                      (0, _.jsx)("strong", {
                                        children: "Contas conectadas",
                                      }),
                                      (0, _.jsx)("small", {
                                        children:
                                          "Cada arquivo vai para todas as contas escolhidas",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              (0, _.jsx)("i", {}),
                              (0, _.jsxs)("div", {
                                children: [
                                  (0, _.jsx)("span", {
                                    className: "flow-icon blue-flow",
                                    children: (0, _.jsx)(y, { name: "queue" }),
                                  }),
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)("b", { children: "03" }),
                                      (0, _.jsx)("strong", {
                                        children: "Fila inteligente",
                                      }),
                                      (0, _.jsx)("small", {
                                        children:
                                          "Intervalos, tentativas e acompanhamento",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          (0, _.jsxs)("div", {
                            className: "campaign-filters panel",
                            children: [
                              (0, _.jsxs)("div", {
                                className: "table-search",
                                children: [
                                  (0, _.jsx)(y, { name: "search" }),
                                  (0, _.jsx)("input", {
                                    value: Ut,
                                    onChange: (e) => Bt(e.target.value),
                                    placeholder: "Buscar campanha",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                value: Vt,
                                onChange: (e) => Gt(e.target.value),
                                children: [
                                  (0, _.jsx)("option", {
                                    value: "Todos",
                                    children: "Todos os status",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "running",
                                    children: "Em andamento",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "upcoming",
                                    children: "Agendadas",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "draft",
                                    children: "Rascunhos",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "paused",
                                    children: "Pausadas",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "completed",
                                    children: "Concluídas",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "cancelled",
                                    children: "Encerradas",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                value: Jt,
                                onChange: (e) => Ht(e.target.value),
                                children: [
                                  (0, _.jsx)("option", {
                                    value: "Todos",
                                    children: "Todos os formatos",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "IMAGE",
                                    children: "Imagens",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "REELS",
                                    children: "Reels",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "STORIES",
                                    children: "Stories",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("select", {
                                value: Kt,
                                onChange: (e) => Wt(e.target.value),
                                children: [
                                  (0, _.jsx)("option", {
                                    value: "recent",
                                    children: "Mais recentes",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "oldest",
                                    children: "Mais antigas",
                                  }),
                                  (0, _.jsx)("option", {
                                    value: "performance",
                                    children: "Melhor desempenho",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("small", {
                                children: [$r.length, " encontradas"],
                              }),
                            ],
                          }),
                          (0, _.jsxs)("section", {
                            className: "panel campaign-directory",
                            children: [
                              (0, _.jsxs)("div", {
                                className: "panel-heading",
                                children: [
                                  (0, _.jsxs)("div", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        className: "panel-kicker",
                                        children: "Centro de publicação",
                                      }),
                                      (0, _.jsx)("h2", {
                                        children: "Campanhas criadas",
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("span", {
                                    className: "date-pill",
                                    children: [$r.length, " de ", L.length],
                                  }),
                                ],
                              }),
                              $r.length
                                ? (0, _.jsx)("div", {
                                    className: "campaign-list",
                                    children: $r.map((e) =>
                                      (0, _.jsxs)(
                                        "article",
                                        {
                                          children: [
                                            (0, _.jsx)("span", {
                                              className: `campaign-kind ${e.mediaType.toLowerCase()}`,
                                              children:
                                                "IMAGE" === e.mediaType
                                                  ? "IMG"
                                                  : "REELS" === e.mediaType
                                                    ? "REEL"
                                                    : "STORY",
                                            }),
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("strong", {
                                                  children: e.name,
                                                }),
                                                (0, _.jsxs)("small", {
                                                  children: [
                                                    e.mediaCount,
                                                    " arquivo(s) · ",
                                                    e.startAt
                                                      ? `início ${new Date(e.startAt).toLocaleString("pt-BR")}`
                                                      : "rascunho ainda não agendado",
                                                    " · ",
                                                    e.failedCount,
                                                    " falha(s)",
                                                  ],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("span", {
                                              className: `campaign-status ${phaseOf(e).k}`,
                                              children: phaseOf(e).n,
                                            }),
                                            (0, _.jsxs)("div", {
                                              className: "campaign-count",
                                              children: [
                                                (0, _.jsxs)("strong", {
                                                  children: [
                                                    e.publishedCount,
                                                    "/",
                                                    e.totalAccounts,
                                                  ],
                                                }),
                                                (0, _.jsx)("small", {
                                                  children: "publicadas",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className: "campaign-actions",
                                              children: [
                                                (0, _.jsx)("button", {
                                                  className: "outline-button",
                                                  onClick: () =>
                                                    (async (e) => {
                                                      (Hs(e.id),
                                                        Ys([]),
                                                        Ws({
                                                          name: e.name,
                                                          caption: e.caption,
                                                          captionVariations: Be(
                                                            e.captionVariations,
                                                          ),
                                                          hashtags: e.hashtags,
                                                          shareToFeed:
                                                            e.shareToFeed,
                                                        }),
                                                        yn("idle"),
                                                        Sn(""));
                                                      let a = await w(
                                                        `/api/campaigns/${e.id}`,
                                                      );
                                                      if (a.ok) {
                                                        let e = await a.json();
                                                        Ys(e.media);
                                                      }
                                                    })(e),
                                                  children: Bs
                                                    ? "Gerenciar"
                                                    : "Consultar",
                                                }),
                                                Bs &&
                                                  [
                                                    "running",
                                                    "completed",
                                                  ].includes(phaseOf(e).k) &&
                                                  (0, _.jsx)("button", {
                                                    className: "outline-button",
                                                    onClick: () => {
                                                      (async (e) => {
                                                        (yn("saving"), Sn(""));
                                                        try {
                                                          let a = await w(
                                                              `/api/campaigns/${e.id}`,
                                                              {
                                                                method: "PATCH",
                                                                headers: {
                                                                  "content-type":
                                                                    "application/json",
                                                                },
                                                                body: JSON.stringify(
                                                                  {
                                                                    action:
                                                                      "create_template",
                                                                  },
                                                                ),
                                                              },
                                                            ),
                                                            s = await a.json();
                                                          if (
                                                            !a.ok ||
                                                            !s.template
                                                          )
                                                            throw Error(
                                                              s.error ||
                                                                "Não foi possível criar o template.",
                                                            );
                                                          (yn("success"),
                                                            Sn(
                                                              `Template “${s.template.name}” criado sem reenviar os arquivos.`,
                                                            ),
                                                            await Fr());
                                                        } catch (e) {
                                                          (yn("error"),
                                                            Sn(
                                                              e instanceof Error
                                                                ? e.message
                                                                : "Não foi possível criar o template.",
                                                            ));
                                                        }
                                                      })(e);
                                                    },
                                                    children: "Criar template",
                                                  }),
                                                Bs &&
                                                  "draft" === e.status &&
                                                  (ra.publishingEnabled
                                                    ? (0, _.jsxs)("button", {
                                                        className:
                                                          "text-button",
                                                        onClick: () => {
                                                          (Qs(e.id), an(pe()));
                                                        },
                                                        children: [
                                                          "Agendar ",
                                                          (0, _.jsx)(y, {
                                                            name: "arrow",
                                                          }),
                                                        ],
                                                      })
                                                    : (0, _.jsxs)("button", {
                                                        className:
                                                          "text-button",
                                                        disabled: !0,
                                                        children: [
                                                          "Agendamento desligado ",
                                                          (0, _.jsx)(y, {
                                                            name: "shield",
                                                          }),
                                                        ],
                                                      })),
                                              ],
                                            }),
                                          ],
                                        },
                                        e.id,
                                      ),
                                    ),
                                  })
                                : (0, _.jsxs)("div", {
                                    className: "automation-empty",
                                    children: [
                                      (0, _.jsx)("span", {
                                        className: "modal-icon",
                                        children: (0, _.jsx)(y, {
                                          name: "campaign",
                                        }),
                                      }),
                                      (0, _.jsx)("h3", {
                                        children: "Nenhuma campanha ativa",
                                      }),
                                      (0, _.jsx)("p", {
                                        children: ra.publishingEnabled
                                          ? "Crie a primeira campanha quando houver uma conta recuperada conectada."
                                          : "Prepare seus rascunhos agora. O agendamento continua desligado por segurança.",
                                      }),
                                      (0, _.jsx)("button", {
                                        className: "primary-button",
                                        disabled: !Bs,
                                        onClick: () => Bs && Zr(),
                                        children: Bs
                                          ? ra.publishingEnabled
                                            ? "Criar campanha"
                                            : "Criar rascunho"
                                          : "Somente leitura",
                                      }),
                                    ],
                                  }),
                            ],
                          }),
                          (0, _.jsxs)("section", {
                            className: "panel campaign-calendar",
                            children: [
                              (0, _.jsxs)("div", {
                                className: "panel-heading",
                                children: [
                                  (0, _.jsxs)("div", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        className: "panel-kicker",
                                        children: "Calendário operacional",
                                      }),
                                      (0, _.jsx)("h2", {
                                        children: "Próximos dias",
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("button", {
                                    className: "text-button",
                                    onClick: () => s("queue"),
                                    children: [
                                      "Abrir fila ",
                                      (0, _.jsx)(y, {
                                        name: "arrow",
                                        size: 15,
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              Or.length
                                ? (0, _.jsx)("div", {
                                    className: "calendar-strip",
                                    children: Or.map(([e, a]) =>
                                      (0, _.jsxs)(
                                        "article",
                                        {
                                          children: [
                                            (0, _.jsx)("span", {
                                              children: a.label,
                                            }),
                                            (0, _.jsx)("strong", {
                                              children: a.count,
                                            }),
                                            (0, _.jsx)("small", {
                                              children: "publicações",
                                            }),
                                            (0, _.jsx)("div", {
                                              children: a.items
                                                .slice(0, 3)
                                                .map((e) =>
                                                  (0, _.jsx)(
                                                    "i",
                                                    {
                                                      title: `${e.campaignName} · @${e.username}`,
                                                    },
                                                    e.id,
                                                  ),
                                                ),
                                            }),
                                          ],
                                        },
                                        e,
                                      ),
                                    ),
                                  })
                                : (0, _.jsx)("div", {
                                    className: "calendar-empty",
                                    children:
                                      "Nenhuma publicação futura no calendário.",
                                  }),
                            ],
                          }),
                        ],
                      })
                    : "queue" === e
                      ? (0, _.jsxs)("div", {
                          className: "content automation-page",
                          children: [
                            (0, _.jsx)(PublishPace, {}),
                            (0, _.jsxs)("div", {
                              className: "page-heading",
                              children: [
                                (0, _.jsxs)("div", {
                                  children: [
                                    (0, _.jsxs)("span", {
                                      className: "eyebrow",
                                      children: [
                                        (0, _.jsx)(y, {
                                          name: "queue",
                                          size: 14,
                                        }),
                                        " Motor de publicação",
                                      ],
                                    }),
                                    (0, _.jsx)("h1", { children: "Fila" }),
                                    (0, _.jsx)("p", {
                                      children: ra.publishingEnabled
                                        ? "O que ainda vai sair, o que já publicou hoje e o que falhou — separados para não misturar."
                                        : "Histórico preservado para auditoria; novos processamentos estão desligados.",
                                    }),
                                  ],
                                }),
                                (0, _.jsxs)("div", {
                                  className: "heading-actions",
                                  children: [
                                    (0, _.jsx)("button", {
                                      className: "outline-button",
                                      disabled: !Bs,
                                      onClick: () =>
                                        Bs &&
                                        void (async () => {
                                          if (
                                            window.confirm(
                                              "Cancelar itens bloqueados e retries mortos (conexão Meta inválida)? Publicados e pendentes válidos ficam.",
                                            )
                                          ) {
                                            (yn("saving"), Sn(""));
                                            try {
                                              let e = await w("/api/queue", {
                                                  method: "POST",
                                                  headers: {
                                                    "content-type":
                                                      "application/json",
                                                  },
                                                  body: JSON.stringify({
                                                    action: "purge_dead",
                                                  }),
                                                }),
                                                a = await e.json();
                                              if (!e.ok)
                                                throw Error(
                                                  a.error ||
                                                    "Não foi possível limpar a fila.",
                                                );
                                              (yn("success"),
                                                Sn(
                                                  `${a.cancelled ?? 0} item(ns) mortos cancelados.`,
                                                ),
                                                await Promise.all([
                                                  Ir(),
                                                  Rr(),
                                                  Hr(),
                                                ]));
                                            } catch (e) {
                                              (yn("error"),
                                                Sn(
                                                  e instanceof Error
                                                    ? e.message
                                                    : "Não foi possível limpar a fila.",
                                                ));
                                            }
                                          }
                                        })(),
                                      children: Bs
                                        ? "Limpar fila morta"
                                        : "Somente leitura",
                                    }),
                                    (0, _.jsxs)("button", {
                                      className: "outline-button",
                                      disabled: !Bs || !ra.publishingEnabled,
                                      onClick: () =>
                                        Bs &&
                                        ra.publishingEnabled &&
                                        void (async () => {
                                          (yn("saving"), Sn(""));
                                          try {
                                            let e = await w("/api/jobs/run", {
                                                method: "POST",
                                              }),
                                              a = await e.json();
                                            if (!e.ok)
                                              throw Error(
                                                a.error ||
                                                  "Não foi possível processar a fila.",
                                              );
                                            (yn("success"),
                                              Sn(
                                                `${a.found ?? 0} item(ns) vencido(s) verificado(s); ${a.published ?? 0} publicação(ões) concluída(s).`,
                                              ),
                                              await Promise.all([
                                                Ir(),
                                                Fr(),
                                                Rr(),
                                              ]));
                                          } catch (e) {
                                            (yn("error"),
                                              Sn(
                                                e instanceof Error
                                                  ? e.message
                                                  : "Não foi possível processar a fila.",
                                              ));
                                          }
                                        })(),
                                      children: [
                                        Bs
                                          ? ra.publishingEnabled
                                            ? "Processar itens vencidos"
                                            : "Processamento desligado"
                                          : "Somente leitura",
                                        " ",
                                        (0, _.jsx)(y, {
                                          name:
                                            Bs && ra.publishingEnabled
                                              ? "arrow"
                                              : "shield",
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            Cn &&
                              (0, _.jsx)("div", {
                                className: `operation-banner ${fn}`,
                                children: Cn,
                              }),
                            (0, _.jsx)("section", {
                              className: "queue-summary queue-tabs",
                              children: [
                                [
                                  "live",
                                  "Na fila",
                                  Ot.live,
                                  "Próximas publicações, sem teto de 500",
                                ],
                                [
                                  "published",
                                  "Publicadas",
                                  Ot.published,
                                  "Últimos 7 dias",
                                ],
                                [
                                  "failed",
                                  "Falhas",
                                  Ot.failed,
                                  "Bloqueadas e com erro",
                                ],
                              ].map(([e, a, s, n]) =>
                                (0, _.jsxs)(
                                  "button",
                                  {
                                    type: "button",
                                    className: Tt === e ? "active" : "",
                                    onClick: () => {
                                      (Pt(e),
                                        Lt(
                                          "live" === e
                                            ? "scheduled_asc"
                                            : "event_desc",
                                        ),
                                        Dt(1),
                                        At("Todos"));
                                    },
                                    children: [
                                      (0, _.jsx)("span", { children: a }),
                                      (0, _.jsx)("strong", { children: s }),
                                      (0, _.jsx)("small", { children: n }),
                                    ],
                                  },
                                  e,
                                ),
                              ),
                            }),
                            (0, _.jsxs)("div", {
                              className: "queue-filters panel",
                              children: [
                                (0, _.jsxs)("div", {
                                  className: "table-search",
                                  children: [
                                    (0, _.jsx)(y, { name: "search" }),
                                    (0, _.jsx)("input", {
                                      value: Mt,
                                      onChange: (e) => {
                                        ($t(e.target.value), Dt(1));
                                      },
                                      placeholder: "Buscar @ ou campanha",
                                    }),
                                  ],
                                }),
                                (0, _.jsxs)("select", {
                                  value: wt,
                                  onChange: (e) => {
                                    (Ct(e.target.value), Dt(1));
                                  },
                                  children: [
                                    (0, _.jsx)("option", {
                                      value: "Todos",
                                      children: "Todas as campanhas",
                                    }),
                                    L.filter(
                                      (e) => "cancelled" !== e.status,
                                    ).map((e) =>
                                      (0, _.jsx)(
                                        "option",
                                        { value: e.id, children: e.name },
                                        e.id,
                                      ),
                                    ),
                                  ],
                                }),
                                (0, _.jsxs)("select", {
                                  value: St,
                                  onChange: (e) => {
                                    (kt(e.target.value), Dt(1));
                                  },
                                  children: [
                                    (0, _.jsx)("option", {
                                      value: "Todos",
                                      children: "Todas as contas",
                                    }),
                                    [
                                      ...new Map(
                                        (Ft.length ? Ft : D).map((e) => [
                                          e.accountId,
                                          e.username,
                                        ]),
                                      ).entries(),
                                    ]
                                      .sort((e, a) =>
                                        e[1].localeCompare(a[1], "pt-BR"),
                                      )
                                      .map(([e, a]) =>
                                        (0, _.jsxs)(
                                          "option",
                                          { value: e, children: ["@", a] },
                                          e,
                                        ),
                                      ),
                                  ],
                                }),
                                (0, _.jsxs)("select", {
                                  value: qt,
                                  "aria-label": "Ordenar fila",
                                  onChange: (e) => {
                                    (Lt(e.target.value), Dt(1));
                                  },
                                  children:
                                    "live" === Tt
                                      ? [
                                          (0, _.jsx)("option", {
                                            value: "scheduled_asc",
                                            children: "Marcado · mais antigo",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "scheduled_desc",
                                            children: "Marcado · mais recente",
                                          }),
                                        ]
                                      : [
                                          (0, _.jsx)("option", {
                                            value: "event_desc",
                                            children:
                                              "published" === Tt
                                                ? "Publicado · mais recente"
                                                : "Falhou · mais recente",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "event_asc",
                                            children:
                                              "published" === Tt
                                                ? "Publicado · mais antigo"
                                                : "Falhou · mais antigo",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "scheduled_desc",
                                            children: "Marcado · mais recente",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "scheduled_asc",
                                            children: "Marcado · mais antigo",
                                          }),
                                        ],
                                }),
                                "live" === Tt
                                  ? (0, _.jsxs)("select", {
                                      value: Et,
                                      onChange: (e) => {
                                        (At(e.target.value), Dt(1));
                                      },
                                      children: [
                                        (0, _.jsx)("option", {
                                          value: "Todos",
                                          children: "Todas as etapas",
                                        }),
                                        (0, _.jsx)("option", {
                                          value: "pending",
                                          children: "Pendente",
                                        }),
                                        (0, _.jsx)("option", {
                                          value: "container_created",
                                          children: "Mídia preparada",
                                        }),
                                        (0, _.jsx)("option", {
                                          value: "processing",
                                          children: "Publicando",
                                        }),
                                        (0, _.jsx)("option", {
                                          value: "retry",
                                          children: "Nova tentativa",
                                        }),
                                        (0, _.jsx)("option", {
                                          value: "paused",
                                          children: "Pausada",
                                        }),
                                      ],
                                    })
                                  : (0, _.jsxs)("small", {
                                      children: [kr.length, " itens nesta aba"],
                                    }),
                              ],
                            }),
                            (0, _.jsxs)("section", {
                              className: "panel queue-directory",
                              children: [
                                (0, _.jsxs)("div", {
                                  className: "queue-head",
                                  children: [
                                    (0, _.jsx)("span", {
                                      children: "Publicação",
                                    }),
                                    (0, _.jsx)("span", { children: "Conta" }),
                                    (0, _.jsx)("span", { children: "Horário" }),
                                    (0, _.jsx)("span", { children: "Etapa" }),
                                    (0, _.jsx)("span", {
                                      children: "Tentativas",
                                    }),
                                    (0, _.jsx)("span", { children: "Ações" }),
                                  ],
                                }),
                                kr.length
                                  ? Mr.map((e) =>
                                      (0, _.jsxs)(
                                        "article",
                                        {
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: `campaign-kind ${e.mediaType.toLowerCase()}`,
                                                  children:
                                                    "IMAGE" === e.mediaType
                                                      ? "IMG"
                                                      : "REELS" === e.mediaType
                                                        ? "REEL"
                                                        : "STORY",
                                                }),
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("strong", {
                                                      children: e.campaignName,
                                                    }),
                                                    (0, _.jsx)("small", {
                                                      children:
                                                        "published" === e.status
                                                          ? `${e.lastError || e.insightsError || (e.captionOverride ? "Legenda preparada" : "Sem legenda")}${null != e.mediaViews || null != e.mediaReach ? ` · ${null != e.mediaViews ? `Visualizações ${C(e.mediaViews)}` : ""}${null != e.mediaViews && null != e.mediaReach ? " · " : ""}${null != e.mediaReach ? `Alcance ${C(e.mediaReach)}` : ""}${e.insightsSyncedAt ? ` · Lido em ${new Date(e.insightsSyncedAt).toLocaleString("pt-BR")}` : ""}` : ""}`
                                                          : e.lastError ||
                                                            (e.captionOverride
                                                              ? "Legenda preparada"
                                                              : "Sem legenda"),
                                                    }),
                                                  ],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("strong", {
                                              children: ["@", e.username],
                                            }),
                                            (0, _.jsxs)("time", {
                                              children: [
                                                new Date(
                                                  e.scheduledFor,
                                                ).toLocaleString("pt-BR"),
                                                "published" === e.status &&
                                                e.publishedAt
                                                  ? (0, _.jsxs)("small", {
                                                      children: [
                                                        "Publicado · ",
                                                        new Date(
                                                          e.publishedAt,
                                                        ).toLocaleString(
                                                          "pt-BR",
                                                        ),
                                                      ],
                                                    })
                                                  : [
                                                        "failed",
                                                        "blocked",
                                                      ].includes(e.status) &&
                                                      e.updatedAt
                                                    ? (0, _.jsxs)("small", {
                                                        children: [
                                                          "Falhou · ",
                                                          new Date(
                                                            e.updatedAt,
                                                          ).toLocaleString(
                                                            "pt-BR",
                                                          ),
                                                        ],
                                                      })
                                                    : null,
                                              ],
                                            }),
                                            (0, _.jsx)("span", {
                                              className: `queue-status ${e.status}`,
                                              children:
                                                "published" === e.status &&
                                                "Sem legenda" === e.lastError
                                                  ? "Sem legenda"
                                                  : T(e.status),
                                            }),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                e.attemptCount,
                                                "/",
                                                e.maxAttempts,
                                              ],
                                            }),
                                            (0, _.jsx)("span", {
                                              className: "queue-row-actions",
                                              children:
                                                "published" === e.status
                                                  ? e.publishedPermalink
                                                    ? (0, _.jsx)("button", {
                                                        className:
                                                          "outline-button compact-button recovery-button",
                                                        onClick: () =>
                                                          window.open(
                                                            e.publishedPermalink,
                                                            "_blank",
                                                            "noopener,noreferrer",
                                                          ),
                                                        children: "Abrir post",
                                                      })
                                                    : e.captionOverride
                                                      ? (0, _.jsx)("button", {
                                                          className:
                                                            "outline-button compact-button recovery-button",
                                                          onClick: () => {
                                                            ll(e);
                                                          },
                                                          children:
                                                            "Copiar + abrir",
                                                        })
                                                      : null
                                                  : "cancelled" === e.status
                                                    ? null
                                                    : (0, _.jsx)("button", {
                                                        className:
                                                          "outline-button compact-button",
                                                        disabled: !Bs,
                                                        onClick: () => {
                                                          if (!Bs) return;
                                                          xi(e.id);
                                                          let a = new Date(
                                                            e.scheduledFor,
                                                          );
                                                          (a.setMinutes(
                                                            a.getMinutes() -
                                                              a.getTimezoneOffset(),
                                                          ),
                                                            ji(
                                                              a
                                                                .toISOString()
                                                                .slice(0, 16),
                                                            ));
                                                        },
                                                        children: Bs
                                                          ? "Editar"
                                                          : "Somente leitura",
                                                      }),
                                            }),
                                          ],
                                        },
                                        e.id,
                                      ),
                                    )
                                  : (0, _.jsxs)("div", {
                                      className: "automation-empty compact",
                                      children: [
                                        (0, _.jsx)(y, {
                                          name: "queue",
                                          size: 26,
                                        }),
                                        (0, _.jsx)("h3", {
                                          children:
                                            "live" === Tt
                                              ? "Nada na fila com esses filtros"
                                              : "published" === Tt
                                                ? "Nenhuma publicação recente"
                                                : "Nenhuma falha nesta lista",
                                        }),
                                        (0, _.jsx)("p", {
                                          children:
                                            "Todos" === wt
                                              ? "Agende uma campanha ou limpe a busca."
                                              : "Essa campanha não tem itens nesta aba. Troque o filtro ou abra Na fila.",
                                        }),
                                      ],
                                    }),
                                kr.length > 80
                                  ? (0, _.jsxs)("footer", {
                                      className: "queue-pagination",
                                      children: [
                                        (0, _.jsxs)("span", {
                                          children: [
                                            "Exibindo ",
                                            80 * (Ar - 1) + 1,
                                            "–",
                                            Math.min(80 * Ar, kr.length),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          children: [
                                            (0, _.jsx)("button", {
                                              className:
                                                "outline-button compact-button",
                                              disabled: 1 === Ar,
                                              onClick: () =>
                                                Dt((e) => Math.max(1, e - 1)),
                                              children: "Anterior",
                                            }),
                                            (0, _.jsxs)("strong", {
                                              children: [Ar, " / ", Er],
                                            }),
                                            (0, _.jsx)("button", {
                                              className:
                                                "outline-button compact-button",
                                              disabled: Ar === Er,
                                              onClick: () =>
                                                Dt((e) => Math.min(Er, e + 1)),
                                              children: "Próxima",
                                            }),
                                          ],
                                        }),
                                      ],
                                    })
                                  : null,
                              ],
                            }),
                          ],
                        })
                      : "alerts" === e
                        ? (0, _.jsxs)("div", {
                            className: "content automation-page",
                            children: [
                              (0, _.jsxs)("div", {
                                className: "page-heading",
                                children: [
                                  (0, _.jsxs)("div", {
                                    children: [
                                      (0, _.jsxs)("span", {
                                        className: "eyebrow",
                                        children: [
                                          (0, _.jsx)(y, {
                                            name: "bell",
                                            size: 14,
                                          }),
                                          " Central de atenção",
                                        ],
                                      }),
                                      (0, _.jsx)("h1", { children: "Alertas" }),
                                      (0, _.jsx)("p", {
                                        children:
                                          "Conexões, restrições, limites e falhas de publicação reunidos por prioridade.",
                                      }),
                                    ],
                                  }),
                                  (0, _.jsx)("button", {
                                    className: "outline-button",
                                    onClick: () => {
                                      Hr();
                                    },
                                    children: "Atualizar alertas",
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("section", {
                                className: "alert-summary",
                                children: [
                                  (0, _.jsxs)("article", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        children: "Críticos",
                                      }),
                                      (0, _.jsx)("strong", {
                                        children: Tr.filter(
                                          (e) => "critical" === e.severity,
                                        ).length,
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("article", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        children: "Atenção",
                                      }),
                                      (0, _.jsx)("strong", {
                                        children: Tr.filter(
                                          (e) => "warning" === e.severity,
                                        ).length,
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("article", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        children: "Total no período",
                                      }),
                                      (0, _.jsx)("strong", {
                                        children: Tr.length,
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("div", {
                                className: "alert-filters panel",
                                children: [
                                  (0, _.jsxs)("select", {
                                    value: Xt,
                                    onChange: (e) => Yt(e.target.value),
                                    children: [
                                      (0, _.jsx)("option", {
                                        value: "Todas",
                                        children: "Todas as prioridades",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "critical",
                                        children: "Críticos",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "warning",
                                        children: "Atenção",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "info",
                                        children: "Informativos",
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("select", {
                                    value: Zt,
                                    onChange: (e) => Qt(e.target.value),
                                    children: [
                                      (0, _.jsx)("option", {
                                        value: "Todos",
                                        children: "Todos os tipos",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "connection",
                                        children: "Conexão",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "token",
                                        children: "Token",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "quota",
                                        children: "Limite Meta",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "restriction",
                                        children: "Restrição",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "publication",
                                        children: "Publicação",
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("small", {
                                    children: [Tr.length, " alertas exibidos"],
                                  }),
                                ],
                              }),
                              (0, _.jsx)("section", {
                                className: "panel alerts-directory",
                                children: Tr.length
                                  ? Tr.map((e) =>
                                      (0, _.jsxs)(
                                        "article",
                                        {
                                          className: e.severity,
                                          children: [
                                            (0, _.jsx)("span", {
                                              className: "alert-icon",
                                              children: (0, _.jsx)(y, {
                                                name:
                                                  "publication" === e.type
                                                    ? "campaign"
                                                    : "quota" === e.type
                                                      ? "queue"
                                                      : "shield",
                                              }),
                                            }),
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("strong", {
                                                  children: e.title,
                                                }),
                                                (0, _.jsx)("p", {
                                                  children: e.description,
                                                }),
                                                (0, _.jsx)("small", {
                                                  children: new Date(
                                                    e.createdAt,
                                                  ).toLocaleString("pt-BR"),
                                                }),
                                              ],
                                            }),
                                            e.accountId &&
                                              (0, _.jsxs)("button", {
                                                className: "text-button",
                                                onClick: () => {
                                                  (s("accounts"),
                                                    x(
                                                      B.find(
                                                        (a) =>
                                                          a.id === e.accountId,
                                                      )?.username || "",
                                                    ));
                                                },
                                                children: [
                                                  "Ver conta ",
                                                  (0, _.jsx)(y, {
                                                    name: "arrow",
                                                    size: 14,
                                                  }),
                                                ],
                                              }),
                                            e.campaignId &&
                                              !e.accountId &&
                                              (0, _.jsxs)("button", {
                                                className: "text-button",
                                                onClick: () => {
                                                  (s("queue"),
                                                    Ct(
                                                      e.campaignId || "Todos",
                                                    ));
                                                },
                                                children: [
                                                  "Ver fila ",
                                                  (0, _.jsx)(y, {
                                                    name: "arrow",
                                                    size: 14,
                                                  }),
                                                ],
                                              }),
                                          ],
                                        },
                                        e.id,
                                      ),
                                    )
                                  : (0, _.jsxs)("div", {
                                      className: "automation-empty",
                                      children: [
                                        (0, _.jsx)(y, {
                                          name: "check",
                                          size: 28,
                                        }),
                                        (0, _.jsx)("h3", {
                                          children:
                                            "Nenhum alerta com esses filtros",
                                        }),
                                        (0, _.jsx)("p", {
                                          children:
                                            "Altere os filtros para consultar outras ocorrências.",
                                        }),
                                      ],
                                    }),
                              }),
                            ],
                          })
                        : "reports" === e
                          ? (0, _.jsxs)("div", {
                              className: "content reports-page",
                              children: [
                                (0, _.jsxs)("div", {
                                  className: "page-heading",
                                  children: [
                                    (0, _.jsxs)("div", {
                                      children: [
                                        (0, _.jsxs)("span", {
                                          className: "eyebrow",
                                          children: [
                                            (0, _.jsx)(y, {
                                              name: "spark",
                                              size: 14,
                                            }),
                                            " Desempenho real",
                                          ],
                                        }),
                                        (0, _.jsx)("h1", {
                                          children: "Relatórios",
                                        }),
                                        (0, _.jsx)("p", {
                                          children:
                                            "Views e alcance vêm de cada vídeo na Meta. Clique em atualizar para ler de novo. Posts novos podem levar alguns minutos até a Meta liberar o número.",
                                        }),
                                      ],
                                    }),
                                    (0, _.jsx)("button", {
                                      className: "outline-button",
                                      disabled: !Bs,
                                      onClick: () => Bs && void il(),
                                      children: Bs
                                        ? Nn
                                          ? "Sincronizando…"
                                          : "Atualizar agora"
                                        : "Somente leitura",
                                    }),
                                  ],
                                }),
                                Cn &&
                                  (0, _.jsx)("div", {
                                    className: `operation-banner ${fn}`,
                                    children: Cn,
                                  }),
                                bi
                                  ? (0, _.jsxs)(_.Fragment, {
                                      children: [
                                        (0, _.jsxs)("section", {
                                          className: "report-metrics",
                                          children: [
                                            (0, _.jsxs)("article", {
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    "Visualizações · ",
                                                    yi.label,
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children: C(
                                                    bi.totals.views30d,
                                                  ),
                                                }),
                                                (0, _.jsx)("small", {
                                                  children:
                                                    "Views dos vídeos publicados no período",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("article", {
                                              children: [
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    "Alcance acumulado · ",
                                                    yi.label,
                                                  ],
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children: C(
                                                    bi.totals.reach30d,
                                                  ),
                                                }),
                                                (0, _.jsx)("small", {
                                                  children:
                                                    "Alcance dos vídeos publicados no período",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("article", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  children: "Seguidores",
                                                }),
                                                (0, _.jsx)("strong", {
                                                  children: C(
                                                    bi.totals.followers,
                                                  ),
                                                }),
                                                (0, _.jsxs)("small", {
                                                  children: [
                                                    bi.totals.accounts,
                                                    " contas integradas",
                                                  ],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("article", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  children:
                                                    "Sucesso de publicação",
                                                }),
                                                (0, _.jsxs)("strong", {
                                                  children: [
                                                    bi.totals.successRate,
                                                    "%",
                                                  ],
                                                }),
                                                (0, _.jsxs)("small", {
                                                  children: [
                                                    bi.totals.published,
                                                    " publicadas · ",
                                                    bi.totals.failed,
                                                    " falhas",
                                                  ],
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "report-filters panel",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              className: "table-search",
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "search",
                                                }),
                                                (0, _.jsx)("input", {
                                                  value: ei,
                                                  onChange: (e) =>
                                                    ai(e.target.value),
                                                  placeholder:
                                                    "Buscar conta, modelo, player ou grupo",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("select", {
                                              value: si,
                                              onChange: (e) =>
                                                ni(e.target.value),
                                              children: [
                                                (0, _.jsx)("option", {
                                                  children: "Todos",
                                                }),
                                                [
                                                  ...new Set(
                                                    bi.perAccount.map(
                                                      (e) => e.model,
                                                    ),
                                                  ),
                                                ].map((e) =>
                                                  (0, _.jsx)(
                                                    "option",
                                                    { children: e },
                                                    e,
                                                  ),
                                                ),
                                              ],
                                            }),
                                            (0, _.jsxs)("select", {
                                              value: ti,
                                              onChange: (e) =>
                                                ii(e.target.value),
                                              children: [
                                                (0, _.jsx)("option", {
                                                  value: "views",
                                                  children:
                                                    "Mais visualizações",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: "reach",
                                                  children: "Maior alcance",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: "followers",
                                                  children: "Mais seguidores",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: "success",
                                                  children: "Maior sucesso",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("button", {
                                              className: "outline-button",
                                              onClick: () =>
                                                Se("nexoflow-relatorio.csv", [
                                                  [
                                                    "Conta",
                                                    "Modelo",
                                                    "Player",
                                                    "Grupo",
                                                    "Nicho",
                                                    "Views no período",
                                                    "Alcance no período",
                                                    "Seguidores",
                                                    "Publicadas",
                                                    "Falhas",
                                                    "Sucesso %",
                                                  ],
                                                  ...Pr.map((e) => [
                                                    e.username,
                                                    e.model,
                                                    e.player,
                                                    e.groupName,
                                                    e.niche,
                                                    e.views30d,
                                                    e.reach30d,
                                                    e.followersCount,
                                                    e.published,
                                                    e.failed,
                                                    e.successRate,
                                                  ]),
                                                ]),
                                              children: "Exportar CSV",
                                            }),
                                            (0, _.jsxs)("small", {
                                              children: [Pr.length, " contas"],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("section", {
                                          className: "panel report-directory",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              className: "panel-heading",
                                              children: [
                                                (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      className: "panel-kicker",
                                                      children:
                                                        "Comparativo por conta",
                                                    }),
                                                    (0, _.jsxs)("h2", {
                                                      children: [
                                                        "Performance · ",
                                                        yi.label,
                                                      ],
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsx)("span", {
                                                  className: "date-pill",
                                                  children: "Meta Insights",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className: "report-table",
                                              children: [
                                                (0, _.jsxs)("div", {
                                                  className: "report-head",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Conta",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Organização",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Views",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Alcance",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Seguidores",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Publicações",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Sucesso",
                                                    }),
                                                  ],
                                                }),
                                                Pr.map((e) =>
                                                  (0, _.jsxs)(
                                                    "article",
                                                    {
                                                      children: [
                                                        (0, _.jsxs)("strong", {
                                                          children: [
                                                            "@",
                                                            e.username,
                                                          ],
                                                        }),
                                                        (0, _.jsxs)("span", {
                                                          children: [
                                                            e.model,
                                                            (0, _.jsxs)(
                                                              "small",
                                                              {
                                                                children: [
                                                                  e.player,
                                                                  " · ",
                                                                  e.groupName ||
                                                                    "sem grupo",
                                                                ],
                                                              },
                                                            ),
                                                          ],
                                                        }),
                                                        (0, _.jsx)("b", {
                                                          children: C(
                                                            e.views30d,
                                                          ),
                                                        }),
                                                        (0, _.jsx)("b", {
                                                          children: C(
                                                            e.reach30d,
                                                          ),
                                                        }),
                                                        (0, _.jsx)("b", {
                                                          children: C(
                                                            e.followersCount,
                                                          ),
                                                        }),
                                                        (0, _.jsxs)("span", {
                                                          children: [
                                                            e.published,
                                                            (0, _.jsxs)(
                                                              "small",
                                                              {
                                                                children: [
                                                                  e.failed,
                                                                  " falhas",
                                                                ],
                                                              },
                                                            ),
                                                          ],
                                                        }),
                                                        (0, _.jsxs)("span", {
                                                          className:
                                                            "success-meter",
                                                          children: [
                                                            (0, _.jsx)("i", {
                                                              style: {
                                                                width: `${e.successRate}%`,
                                                              },
                                                            }),
                                                            (0, _.jsxs)("b", {
                                                              children: [
                                                                e.successRate,
                                                                "%",
                                                              ],
                                                            }),
                                                          ],
                                                        }),
                                                      ],
                                                    },
                                                    e.id,
                                                  ),
                                                ),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className:
                                            "report-filters media-performance-filters panel",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              className: "table-search",
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "search",
                                                }),
                                                (0, _.jsx)("input", {
                                                  value: ri,
                                                  onChange: (e) =>
                                                    li(e.target.value),
                                                  placeholder:
                                                    "Buscar vídeo, campanha ou conta",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("select", {
                                              value: oi,
                                              onChange: (e) =>
                                                ci(e.target.value),
                                              children: [
                                                (0, _.jsx)("option", {
                                                  value: "views",
                                                  children:
                                                    "Mais visualizações",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: "reach",
                                                  children: "Maior alcance",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: "recent",
                                                  children: "Mais recentes",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("button", {
                                              className: "outline-button",
                                              onClick: () =>
                                                Se("nexoflow-videos.csv", [
                                                  [
                                                    "Campanha",
                                                    "Conta",
                                                    "Formato",
                                                    "Publicado em",
                                                    "Views",
                                                    "Alcance",
                                                    "Última leitura",
                                                    "Situação",
                                                  ],
                                                  ...qr.map((e) => [
                                                    e.campaignName,
                                                    e.username,
                                                    e.mediaType,
                                                    e.publishedAt,
                                                    e.views,
                                                    e.reach,
                                                    e.insightsSyncedAt,
                                                    e.insightsError ||
                                                      "Atualizado",
                                                  ]),
                                                ]),
                                              children: "Exportar vídeos",
                                            }),
                                            (0, _.jsxs)("small", {
                                              children: [qr.length, " vídeos"],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("section", {
                                          className: "panel media-performance",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              className: "panel-heading",
                                              children: [
                                                (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      className: "panel-kicker",
                                                      children:
                                                        "Desempenho por vídeo",
                                                    }),
                                                    (0, _.jsxs)("h2", {
                                                      children: [
                                                        "Cada publicação · ",
                                                        yi.label,
                                                      ],
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("span", {
                                                  className: "date-pill",
                                                  children: [
                                                    qr.length,
                                                    " publicações",
                                                  ],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className:
                                                "media-performance-table",
                                              children: [
                                                (0, _.jsxs)("div", {
                                                  className:
                                                    "media-performance-head",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Vídeo",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Conta",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Publicado",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Views",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Alcance",
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      children: "Leitura Meta",
                                                    }),
                                                  ],
                                                }),
                                                qr.length
                                                  ? qr.map((e) =>
                                                      (0, _.jsxs)(
                                                        "article",
                                                        {
                                                          children: [
                                                            (0, _.jsxs)(
                                                              "span",
                                                              {
                                                                children: [
                                                                  (0, _.jsx)(
                                                                    "strong",
                                                                    {
                                                                      children:
                                                                        e.campaignName,
                                                                    },
                                                                  ),
                                                                  (0, _.jsx)(
                                                                    "small",
                                                                    {
                                                                      children:
                                                                        "REELS" ===
                                                                        e.mediaType
                                                                          ? "Reel"
                                                                          : e.mediaType,
                                                                    },
                                                                  ),
                                                                ],
                                                              },
                                                            ),
                                                            (0, _.jsxs)(
                                                              "strong",
                                                              {
                                                                children: [
                                                                  "@",
                                                                  e.username,
                                                                ],
                                                              },
                                                            ),
                                                            (0, _.jsx)("time", {
                                                              children:
                                                                e.publishedAt
                                                                  ? new Date(
                                                                      e.publishedAt,
                                                                    ).toLocaleString(
                                                                      "pt-BR",
                                                                    )
                                                                  : "-",
                                                            }),
                                                            (0, _.jsx)("b", {
                                                              children: C(
                                                                e.views,
                                                              ),
                                                            }),
                                                            (0, _.jsx)("b", {
                                                              children: C(
                                                                e.reach,
                                                              ),
                                                            }),
                                                            (0, _.jsx)("span", {
                                                              className:
                                                                e.insightsError
                                                                  ? "media-insight pending"
                                                                  : "media-insight ready",
                                                              children:
                                                                e.insightsError ||
                                                                (e.insightsSyncedAt
                                                                  ? `Atualizado ${new Date(e.insightsSyncedAt).toLocaleString("pt-BR")}`
                                                                  : "Aguardando sincronização"),
                                                            }),
                                                          ],
                                                        },
                                                        e.id,
                                                      ),
                                                    )
                                                  : (0, _.jsxs)("div", {
                                                      className:
                                                        "automation-empty compact",
                                                      children: [
                                                        (0, _.jsx)(y, {
                                                          name: "spark",
                                                          size: 26,
                                                        }),
                                                        (0, _.jsx)("h3", {
                                                          children:
                                                            "Nenhum vídeo no período",
                                                        }),
                                                        (0, _.jsx)("p", {
                                                          children:
                                                            "Escolha outro dia ou período no filtro superior.",
                                                        }),
                                                      ],
                                                    }),
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    })
                                  : (0, _.jsx)("div", {
                                      className: "automation-empty",
                                      children: "Carregando os relatórios...",
                                    }),
                              ],
                            })
                          : "team" === e
                            ? (0, _.jsxs)("div", {
                                className: "content team-page",
                                children: [
                                  (0, _.jsx)("div", {
                                    className: "page-heading",
                                    children: (0, _.jsxs)("div", {
                                      children: [
                                        (0, _.jsxs)("span", {
                                          className: "eyebrow",
                                          children: [
                                            (0, _.jsx)(y, {
                                              name: "users",
                                              size: 14,
                                            }),
                                            " Acessos individuais",
                                          ],
                                        }),
                                        (0, _.jsx)("h1", {
                                          children: "Equipe",
                                        }),
                                        (0, _.jsx)("p", {
                                          children:
                                            "Crie um login na sua operação ou uma conta 100% separada, sem nenhum dado seu.",
                                        }),
                                      ],
                                    }),
                                  }),
                                  Cn &&
                                    (0, _.jsx)("div", {
                                      className: `operation-banner ${fn}`,
                                      children: Cn,
                                    }),
                                  (0, _.jsxs)("div", {
                                    className: "team-layout",
                                    children: [
                                      (0, _.jsxs)("section", {
                                        className: "panel team-directory",
                                        children: [
                                          (0, _.jsxs)("div", {
                                            className: "panel-heading",
                                            children: [
                                              (0, _.jsxs)("div", {
                                                children: [
                                                  (0, _.jsxs)("span", {
                                                    className: "panel-kicker",
                                                    children: [
                                                      "Espaço ",
                                                      _a?.current.name ||
                                                        "Operação MK",
                                                    ],
                                                  }),
                                                  (0, _.jsx)("h2", {
                                                    children:
                                                      "Pessoas com acesso",
                                                  }),
                                                ],
                                              }),
                                              (0, _.jsxs)("span", {
                                                className: "date-pill",
                                                children: [
                                                  ha?.members.filter(
                                                    (e) =>
                                                      "revoked" !== e.status,
                                                  ).length || 0,
                                                  " membros",
                                                ],
                                              }),
                                            ],
                                          }),
                                          ha?.members
                                            .filter(
                                              (e) => "revoked" !== e.status,
                                            )
                                            .map((e) =>
                                              (0, _.jsxs)(
                                                "article",
                                                {
                                                  children: [
                                                    (0, _.jsx)(He, {
                                                      name:
                                                        e.displayName ||
                                                        e.email,
                                                      url: e.avatarUrl,
                                                      className: "mini-avatar",
                                                    }),
                                                    (0, _.jsxs)("span", {
                                                      children: [
                                                        (0, _.jsx)("strong", {
                                                          children:
                                                            e.displayName ||
                                                            e.email,
                                                        }),
                                                        (0, _.jsx)("small", {
                                                          children: e.email,
                                                        }),
                                                        (0, _.jsxs)("small", {
                                                          children: [
                                                            e.lastLoginAt
                                                              ? `Último acesso ${new Date(e.lastLoginAt).toLocaleString("pt-BR")}`
                                                              : "Ainda não entrou",
                                                            e.mustChangePassword
                                                              ? " · troca de senha pendente"
                                                              : "",
                                                          ],
                                                        }),
                                                      ],
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      className:
                                                        "queue-status " +
                                                        ("active" === e.status
                                                          ? "published"
                                                          : "blocked"),
                                                      children:
                                                        "active" === e.status
                                                          ? "Ativo"
                                                          : "Revogado",
                                                    }),
                                                    (0, _.jsx)("b", {
                                                      children:
                                                        "owner" === e.role
                                                          ? "Administrador"
                                                          : "editor" === e.role
                                                            ? "Editor"
                                                            : "Somente leitura",
                                                    }),
                                                    "owner" ===
                                                      ha.currentUser.role &&
                                                    "owner" !== e.role
                                                      ? (0, _.jsxs)("span", {
                                                          className:
                                                            "member-actions",
                                                          children: [
                                                            (0, _.jsx)(
                                                              "button",
                                                              {
                                                                className:
                                                                  "text-button",
                                                                onClick: () =>
                                                                  ol(e),
                                                                children:
                                                                  "Gerenciar",
                                                              },
                                                            ),
                                                            (0, _.jsx)(
                                                              "button",
                                                              {
                                                                className:
                                                                  "text-button danger-action",
                                                                onClick: () => {
                                                                  dl(e);
                                                                },
                                                                children:
                                                                  "Remover",
                                                              },
                                                            ),
                                                          ],
                                                        })
                                                      : (0, _.jsx)("span", {}),
                                                  ],
                                                },
                                                e.id,
                                              ),
                                            ) ||
                                            (0, _.jsx)("div", {
                                              className: "automation-empty",
                                              children: "Carregando equipe…",
                                            }),
                                        ],
                                      }),
                                      (0, _.jsxs)("form", {
                                        className: "panel invite-panel",
                                        onSubmit: async (e) => {
                                          (e.preventDefault(),
                                            yn("saving"),
                                            Sn(""));
                                          try {
                                            let e = await w("/api/team", {
                                                method: "POST",
                                                headers: {
                                                  "content-type":
                                                    "application/json",
                                                },
                                                body: JSON.stringify({
                                                  email: ba,
                                                  displayName: ga,
                                                  password: ya,
                                                  role: wa,
                                                  workspaceKind: Sa,
                                                }),
                                              }),
                                              a = await e.json();
                                            if (!e.ok)
                                              throw Error(
                                                a.error ||
                                                  "Não foi possível criar o acesso.",
                                              );
                                            (va(""),
                                              fa(""),
                                              Na(""),
                                              yn("success"),
                                              Sn(
                                                "independent" ===
                                                  a.workspaceKind
                                                  ? "Login independente criado. Ele entra no mesmo endereço, painel vazio, e escolhe MK 1, 2 ou 3 só na hora de conectar."
                                                  : "Acesso à sua operação criado. Entregue o link, o e-mail e a senha temporária diretamente à pessoa.",
                                              ),
                                              await Gr());
                                          } catch (e) {
                                            (yn("error"),
                                              Sn(
                                                e instanceof Error
                                                  ? e.message
                                                  : "Não foi possível preparar o acesso.",
                                              ));
                                          }
                                        },
                                        children: [
                                          (0, _.jsx)("span", {
                                            className: "alert-icon",
                                            children: (0, _.jsx)(y, {
                                              name: "users",
                                            }),
                                          }),
                                          (0, _.jsx)("h2", {
                                            children: "Criar acesso",
                                          }),
                                          (0, _.jsx)("p", {
                                            children:
                                              "Mesmo endereço de login. Você escolhe se a pessoa entra na sua operação ou numa conta vazia, só dela.",
                                          }),
                                          (0, _.jsxs)("label", {
                                            children: [
                                              (0, _.jsx)("span", {
                                                children: "Tipo de conta",
                                              }),
                                              (0, _.jsxs)("select", {
                                                value: Sa,
                                                onChange: (e) =>
                                                  ka(e.target.value),
                                                children: [
                                                  (0, _.jsx)("option", {
                                                    value: "independent",
                                                    children:
                                                      "Independente · painel vazio, zero dados seus",
                                                  }),
                                                  (0, _.jsx)("option", {
                                                    value: "shared",
                                                    children:
                                                      "Na minha operação · vê minhas contas",
                                                  }),
                                                ],
                                              }),
                                            ],
                                          }),
                                          (0, _.jsxs)("label", {
                                            children: [
                                              (0, _.jsx)("span", {
                                                children: "Nome",
                                              }),
                                              (0, _.jsx)("input", {
                                                required: !0,
                                                maxLength: 120,
                                                value: ga,
                                                onChange: (e) =>
                                                  va(e.target.value),
                                                placeholder:
                                                  "Nome do sócio ou colaborador",
                                              }),
                                            ],
                                          }),
                                          (0, _.jsxs)("label", {
                                            children: [
                                              (0, _.jsx)("span", {
                                                children: "E-mail de acesso",
                                              }),
                                              (0, _.jsx)("input", {
                                                type: "email",
                                                required: !0,
                                                value: ba,
                                                onChange: (e) =>
                                                  fa(e.target.value),
                                                placeholder:
                                                  "socio@exemplo.com",
                                              }),
                                            ],
                                          }),
                                          (0, _.jsxs)("label", {
                                            children: [
                                              (0, _.jsx)("span", {
                                                children: "Senha temporária",
                                              }),
                                              (0, _.jsx)("input", {
                                                type: "password",
                                                required: !0,
                                                minLength: 10,
                                                autoComplete: "new-password",
                                                value: ya,
                                                onChange: (e) =>
                                                  Na(e.target.value),
                                                placeholder:
                                                  "10+ caracteres, letras e números",
                                              }),
                                            ],
                                          }),
                                          "shared" === Sa &&
                                            (0, _.jsxs)("label", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  children: "Nível de acesso",
                                                }),
                                                (0, _.jsxs)("select", {
                                                  value: wa,
                                                  onChange: (e) =>
                                                    Ca(e.target.value),
                                                  children: [
                                                    (0, _.jsx)("option", {
                                                      value: "editor",
                                                      children:
                                                        "Editor · organiza e opera",
                                                    }),
                                                    (0, _.jsx)("option", {
                                                      value: "viewer",
                                                      children:
                                                        "Somente leitura · consulta dados",
                                                    }),
                                                  ],
                                                }),
                                              ],
                                            }),
                                          "independent" === Sa &&
                                            (0, _.jsx)("small", {
                                              className: "field-help",
                                              children:
                                                "Ele entra com o login dele, painel vazio. Na hora de conectar, escolhe MK 1, 2 ou 3. Nada das outras operações aparece.",
                                            }),
                                          (0, _.jsx)("button", {
                                            className: "primary-button",
                                            disabled:
                                              "owner" !==
                                                ha?.currentUser.role ||
                                              "saving" === fn,
                                            children:
                                              "owner" === ha?.currentUser.role
                                                ? "Criar login"
                                                : "Somente o administrador cria acessos",
                                          }),
                                          (0, _.jsx)("small", {
                                            children:
                                              "Envie a senha por um canal privado. A pessoa será obrigada a trocá-la no primeiro acesso.",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  !!ha?.independentWorkspaces?.filter(
                                    (e) => "revoked" !== e.status,
                                  ).length &&
                                    (0, _.jsxs)("section", {
                                      className: "panel team-directory",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "panel-heading",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "panel-kicker",
                                                  children: "Isoladas",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Contas independentes",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("span", {
                                              className: "date-pill",
                                              children: [
                                                ha?.independentWorkspaces?.filter(
                                                  (e) => "revoked" !== e.status,
                                                ).length,
                                                " operação(ões)",
                                              ],
                                            }),
                                          ],
                                        }),
                                        ha?.independentWorkspaces
                                          ?.filter(
                                            (e) => "revoked" !== e.status,
                                          )
                                          .map((e) =>
                                            (0, _.jsxs)(
                                              "article",
                                              {
                                                children: [
                                                  (0, _.jsx)(He, {
                                                    name:
                                                      e.displayName || e.email,
                                                    url: e.avatarUrl,
                                                    className: "mini-avatar",
                                                  }),
                                                  (0, _.jsxs)("span", {
                                                    children: [
                                                      (0, _.jsx)("strong", {
                                                        children:
                                                          e.displayName ||
                                                          e.email,
                                                      }),
                                                      (0, _.jsx)("small", {
                                                        children: e.email,
                                                      }),
                                                      (0, _.jsx)("small", {
                                                        children: e.lastLoginAt
                                                          ? `Último acesso ${new Date(e.lastLoginAt).toLocaleString("pt-BR")}`
                                                          : "Ainda não entrou",
                                                      }),
                                                    ],
                                                  }),
                                                  (0, _.jsx)("span", {
                                                    className:
                                                      "queue-status " +
                                                      ("active" === e.status
                                                        ? "published"
                                                        : "blocked"),
                                                    children:
                                                      "active" === e.status
                                                        ? "Ativa"
                                                        : "Revogada",
                                                  }),
                                                  (0, _.jsx)("b", {
                                                    children:
                                                      "Dono da própria conta",
                                                  }),
                                                  "owner" ===
                                                  ha.currentUser.role
                                                    ? (0, _.jsxs)("span", {
                                                        className:
                                                          "member-actions",
                                                        children: [
                                                          (0, _.jsx)("button", {
                                                            className:
                                                              "text-button",
                                                            onClick: () =>
                                                              ol(e, !0),
                                                            children: "Senha",
                                                          }),
                                                          (0, _.jsx)("button", {
                                                            className:
                                                              "text-button danger-action",
                                                            onClick: () => {
                                                              dl(e);
                                                            },
                                                            children:
                                                              "Desativar login",
                                                          }),
                                                        ],
                                                      })
                                                    : (0, _.jsx)("span", {}),
                                                ],
                                              },
                                              e.id,
                                            ),
                                          ),
                                      ],
                                    }),
                                  (0, _.jsxs)("form", {
                                    className:
                                      "panel security-panel password-panel",
                                    onSubmit: async (e) => {
                                      if (
                                        (e.preventDefault(),
                                        yn("saving"),
                                        Sn(""),
                                        _s !== gs)
                                      )
                                        return (
                                          yn("error"),
                                          void Sn(
                                            "A confirmação da senha não confere.",
                                          )
                                        );
                                      try {
                                        let e = await w("/api/team", {
                                            method: "PATCH",
                                            headers: {
                                              "content-type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({
                                              action: "change_own_password",
                                              password: _s,
                                            }),
                                          }),
                                          a = await e.json();
                                        if (!e.ok)
                                          throw Error(
                                            a.error ||
                                              "Não foi possível trocar sua senha.",
                                          );
                                        (js(""),
                                          vs(""),
                                          (window.location.href =
                                            "/__nexoflow/logout"));
                                      } catch (e) {
                                        (yn("error"),
                                          Sn(
                                            e instanceof Error
                                              ? e.message
                                              : "Não foi possível trocar sua senha.",
                                          ));
                                      }
                                    },
                                    children: [
                                      (0, _.jsxs)("div", {
                                        children: [
                                          (0, _.jsx)("span", {
                                            className: "alert-icon",
                                            children: (0, _.jsx)(y, {
                                              name: "shield",
                                            }),
                                          }),
                                          (0, _.jsxs)("span", {
                                            children: [
                                              (0, _.jsx)("h3", {
                                                children: ha?.currentUser
                                                  .mustChangePassword
                                                  ? "Troque sua senha temporária"
                                                  : "Alterar minha senha",
                                              }),
                                              (0, _.jsx)("p", {
                                                children:
                                                  "A troca encerra sua sessão atual e invalida qualquer outra sessão aberta com este login.",
                                              }),
                                            ],
                                          }),
                                        ],
                                      }),
                                      (0, _.jsxs)("div", {
                                        className: "password-fields",
                                        children: [
                                          (0, _.jsx)("input", {
                                            "aria-label": "Nova senha",
                                            type: "password",
                                            required: !0,
                                            minLength: 10,
                                            autoComplete: "new-password",
                                            value: _s,
                                            onChange: (e) => js(e.target.value),
                                            placeholder: "Nova senha",
                                          }),
                                          (0, _.jsx)("input", {
                                            "aria-label":
                                              "Confirmar nova senha",
                                            type: "password",
                                            required: !0,
                                            minLength: 10,
                                            autoComplete: "new-password",
                                            value: gs,
                                            onChange: (e) => vs(e.target.value),
                                            placeholder: "Confirmar senha",
                                          }),
                                          (0, _.jsx)("button", {
                                            className: "outline-button",
                                            disabled: "saving" === fn,
                                            children: "Trocar senha",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("section", {
                                    className: "panel security-panel",
                                    children: [
                                      (0, _.jsxs)("div", {
                                        children: [
                                          (0, _.jsx)("span", {
                                            className: "alert-icon",
                                            children: (0, _.jsx)(y, {
                                              name: "shield",
                                            }),
                                          }),
                                          (0, _.jsxs)("span", {
                                            children: [
                                              (0, _.jsx)("h3", {
                                                children:
                                                  "Dois tipos de acesso",
                                              }),
                                              (0, _.jsx)("p", {
                                                children:
                                                  "Na sua operação, a pessoa vê os mesmos perfis. Na conta independente, o painel nasce vazio e os Instagrams que ele conectar ficam só com ele.",
                                              }),
                                            ],
                                          }),
                                        ],
                                      }),
                                      (0, _.jsxs)("div", {
                                        className: "security-tags",
                                        children: [
                                          (0, _.jsxs)("span", {
                                            children: [
                                              (0, _.jsx)(y, { name: "check" }),
                                              "Login individual",
                                            ],
                                          }),
                                          (0, _.jsxs)("span", {
                                            children: [
                                              (0, _.jsx)(y, { name: "check" }),
                                              "Dados isolados",
                                            ],
                                          }),
                                          (0, _.jsxs)("span", {
                                            children: [
                                              (0, _.jsx)(y, { name: "check" }),
                                              "Revogação imediata",
                                            ],
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              })
                            : "otp" === e
                              ? (0, _.jsx)(OtpMultiApi, {
                                  canOperate: Bs,
                                })
                              : (0, _.jsxs)("div", {
                                  className: "content integrations-page",
                                  children: [
                                    (0, _.jsx)("div", {
                                      className: "page-heading",
                                      children: (0, _.jsxs)("div", {
                                        children: [
                                          (0, _.jsxs)("span", {
                                            className: "eyebrow",
                                            children: [
                                              (0, _.jsx)(y, {
                                                name: "plug",
                                                size: 14,
                                              }),
                                              " Conexões seguras",
                                            ],
                                          }),
                                          (0, _.jsx)("h1", {
                                            children: "Integrações",
                                          }),
                                          (0, _.jsx)("p", {
                                            children:
                                              "Conecte as fontes que alimentam a operação, mantendo chaves e tokens fora das telas.",
                                          }),
                                        ],
                                      }),
                                    }),
                                    Cn &&
                                      (0, _.jsx)("div", {
                                        className: `operation-banner ${fn}`,
                                        children: Cn,
                                      }),
                                    (0, _.jsxs)("section", {
                                      className: "integration-hero panel",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          children: [
                                            (0, _.jsx)("span", {
                                              className:
                                                "integration-logo meta-logo",
                                              children: "∞",
                                            }),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("small", {
                                                  children: "Canal Instagram",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Meta · conectar contas",
                                                }),
                                                (0, _.jsx)("p", {
                                                  children:
                                                    "Todas as contas ficam no mesmo painel. Na hora de conectar, você escolhe se a autorização vai pelo MK 1, MK 2 ou MK 3.",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsx)("span", {
                                          className:
                                            "connection-pill " +
                                            (ta.connections.length
                                              ? "connected"
                                              : ""),
                                          children: ta.connections.length
                                            ? `${ta.connections.length} autorizada(s)`
                                            : "Nenhuma conta ainda",
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "integration-steps",
                                          children: [
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("b", {
                                                  children: "1",
                                                }),
                                                (0, _.jsx)("em", {
                                                  children:
                                                    "Status das conexões",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("i", {}),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("b", {
                                                  children: "2",
                                                }),
                                                (0, _.jsx)("em", {
                                                  children: "Sincronizar",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("i", {}),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("b", {
                                                  children: "3",
                                                }),
                                                (0, _.jsx)("em", {
                                                  children: "Diagnóstico",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "integration-actions",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "shield",
                                                }),
                                                (0, _.jsxs)("span", {
                                                  children: [
                                                    (0, _.jsx)("strong", {
                                                      children:
                                                        ra.publishingEnabled
                                                          ? "Canal oficial pronto"
                                                          : ra.connectionEnabled
                                                            ? "Autorização disponível com publicação bloqueada"
                                                            : "Conexões bloqueadas por segurança",
                                                    }),
                                                    (0, _.jsx)("small", {
                                                      children: ta.configured
                                                        ? "Todas as contas conectadas aparecem juntas. Use o filtro se quiser ver só um app."
                                                        : "Cadastre o App ID e o App Secret nas variáveis da Cloudflare.",
                                                    }),
                                                  ],
                                                }),
                                              ],
                                            }),
                                            Bs &&
                                            ra.connectionEnabled &&
                                            ta.facebookConfigured
                                              ? (0, _.jsx)("button", {
                                                  type: "button",
                                                  className: "primary-button",
                                                  onClick: () =>
                                                    window.location.replace(
                                                      "/api/meta/facebook/connect",
                                                    ),
                                                  children:
                                                    "Conectar via Facebook",
                                                })
                                              : (0, _.jsx)("button", {
                                                  className: "primary-button",
                                                  disabled: !0,
                                                  children: Bs
                                                    ? "Instagram direto abaixo"
                                                    : "Somente leitura",
                                                }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "connection-sequence",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("strong", {
                                                  children:
                                                    "Publicação com legendas controladas",
                                                }),
                                                (0, _.jsx)("small", {
                                                  children:
                                                    "A legenda é opcional. Você escolhe as variações que entram na fila. A resolv. não envia comentários automáticos e não interrompe a publicação quando a Meta omite o texto.",
                                                }),
                                                (0, _.jsx)("span", {
                                                  children: (0, _.jsx)("i", {
                                                    style: {
                                                      width:
                                                        (wi.length ? 100 : 0) +
                                                        "%",
                                                    },
                                                  }),
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("b", {
                                              children: [
                                                wi.length,
                                                " conta(s) disponíveis",
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    ta.connections.length > 0 &&
                                      (0, _.jsxs)("section", {
                                        className: "panel connection-directory",
                                        children: [
                                          (0, _.jsxs)("div", {
                                            className: "panel-heading",
                                            children: [
                                              (0, _.jsxs)("div", {
                                                children: [
                                                  (0, _.jsx)("span", {
                                                    className: "panel-kicker",
                                                    children:
                                                      "Contas autorizadas",
                                                  }),
                                                  (0, _.jsx)("h2", {
                                                    children:
                                                      "Histórico de conexões",
                                                  }),
                                                ],
                                              }),
                                              (0, _.jsxs)("span", {
                                                className: "directory-toolbar",
                                                style: { padding: 0, gap: 8 },
                                                children: [
                                                  (0, _.jsx)(oe, {
                                                    includeAll: !0,
                                                    value: Ea,
                                                    onChange: (e) => Aa(e),
                                                    ariaLabel:
                                                      "Filtrar conexões por app",
                                                  }),
                                                  Bs
                                                    ? (0, _.jsx)("button", {
                                                        className:
                                                          "text-button",
                                                        onClick: () => {
                                                          il();
                                                        },
                                                        children:
                                                          "Sincronizar agora",
                                                      })
                                                    : (0, _.jsx)("button", {
                                                        className:
                                                          "text-button",
                                                        disabled: !0,
                                                        children:
                                                          "Somente leitura",
                                                      }),
                                                ],
                                              }),
                                            ],
                                          }),
                                          ta.connections
                                            .filter(
                                              (e) =>
                                                "all" === Ea ||
                                                (e.metaAppKey || "default") ===
                                                  Ea,
                                            )
                                            .map((e) =>
                                              (0, _.jsxs)(
                                                "article",
                                                {
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      className: "avatar coral",
                                                      children: e.username
                                                        .slice(0, 2)
                                                        .toUpperCase(),
                                                    }),
                                                    (0, _.jsxs)("div", {
                                                      children: [
                                                        (0, _.jsxs)("strong", {
                                                          children: [
                                                            "@",
                                                            e.username,
                                                          ],
                                                        }),
                                                        (0, _.jsxs)("small", {
                                                          children: [
                                                            e.accountType ||
                                                              "Conta profissional",
                                                            " · ",
                                                            "facebook" ===
                                                            e.apiMode
                                                              ? "Página do Facebook"
                                                              : "Instagram direto",
                                                            " · ",
                                                            ae(e.metaAppKey),
                                                            e.metaAppId
                                                              ? ` · ${e.metaAppId}`
                                                              : "",
                                                          ],
                                                        }),
                                                        (0, _.jsxs)("small", {
                                                          children: [
                                                            "Última sincronização ",
                                                            e.lastSyncAt
                                                              ? new Date(
                                                                  e.lastSyncAt,
                                                                ).toLocaleString(
                                                                  "pt-BR",
                                                                )
                                                              : "pendente",
                                                          ],
                                                        }),
                                                        e.lastError &&
                                                          (0, _.jsx)("small", {
                                                            className:
                                                              "connection-warning",
                                                            children:
                                                              e.lastError,
                                                          }),
                                                      ],
                                                    }),
                                                    (0, _.jsxs)("span", {
                                                      className: "usage-meter",
                                                      children: [
                                                        (0, _.jsx)("i", {
                                                          style: {
                                                            width:
                                                              "connected" ===
                                                              e.status
                                                                ? "100%"
                                                                : "0%",
                                                          },
                                                        }),
                                                        (0, _.jsx)("small", {
                                                          children:
                                                            "connected" ===
                                                            e.status
                                                              ? "autorização ativa"
                                                              : "reconexão necessária",
                                                        }),
                                                      ],
                                                    }),
                                                    (0, _.jsx)("span", {
                                                      className:
                                                        "queue-status " +
                                                        ("connected" ===
                                                        e.status
                                                          ? "published"
                                                          : "blocked"),
                                                      children:
                                                        "connected" === e.status
                                                          ? "Conectada"
                                                          : "Pausada",
                                                    }),
                                                  ],
                                                },
                                                e.id,
                                              ),
                                            ),
                                        ],
                                      }),
                                    (0, _.jsxs)("section", {
                                      className: "panel system-diagnostics",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "panel-heading",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "panel-kicker",
                                                  children:
                                                    "Diagnóstico em tempo real",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Saúde da infraestrutura",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("button", {
                                              className: "text-button",
                                              onClick: () => {
                                                Ur();
                                              },
                                              children: [
                                                "Atualizar diagnóstico ",
                                                (0, _.jsx)(y, {
                                                  name: "arrow",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        oa
                                          ? (0, _.jsxs)("div", {
                                              className: "diagnostic-grid",
                                              children: [
                                                (0, _.jsxs)("article", {
                                                  className:
                                                    oa.scheduler.stale ||
                                                    "error" ===
                                                      oa.scheduler.status
                                                      ? "needs-attention"
                                                      : "healthy",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Agendador",
                                                    }),
                                                    (0, _.jsx)("strong", {
                                                      children:
                                                        "paused" ===
                                                        oa.scheduler.status
                                                          ? "Pausado"
                                                          : oa.scheduler.stale
                                                            ? "Sem resposta"
                                                            : "error" ===
                                                                oa.scheduler
                                                                  .status
                                                              ? "Com falha"
                                                              : "Operacional",
                                                    }),
                                                    (0, _.jsx)("small", {
                                                      children: oa.scheduler
                                                        .lastCompletedAt
                                                        ? `Última execução ${new Date(oa.scheduler.lastCompletedAt).toLocaleString("pt-BR")}`
                                                        : "Aguardando a primeira execução",
                                                    }),
                                                    oa.scheduler.lastError &&
                                                      (0, _.jsx)("em", {
                                                        children:
                                                          oa.scheduler
                                                            .lastError,
                                                      }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("article", {
                                                  className: oa.database
                                                    .available
                                                    ? "healthy"
                                                    : "needs-attention",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children: "Banco D1",
                                                    }),
                                                    (0, _.jsx)("strong", {
                                                      children: oa.database
                                                        .available
                                                        ? "Operacional"
                                                        : "Indisponível",
                                                    }),
                                                    (0, _.jsx)("small", {
                                                      children:
                                                        "Dados da operação acessíveis",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("article", {
                                                  className: oa.storage
                                                    .available
                                                    ? "healthy"
                                                    : "needs-attention",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Armazenamento R2",
                                                    }),
                                                    (0, _.jsx)("strong", {
                                                      children: he(
                                                        oa.storage.bytes,
                                                      ),
                                                    }),
                                                    (0, _.jsxs)("small", {
                                                      children: [
                                                        oa.storage.objects,
                                                        " arquivo(s) catalogado(s)",
                                                      ],
                                                    }),
                                                    oa.storage.error &&
                                                      (0, _.jsx)("em", {
                                                        children:
                                                          oa.storage.error,
                                                      }),
                                                  ],
                                                }),
                                                (0, _.jsxs)("article", {
                                                  className: oa.queue.failures
                                                    ? "needs-attention"
                                                    : "healthy",
                                                  children: [
                                                    (0, _.jsx)("span", {
                                                      children:
                                                        "Fila e conexões",
                                                    }),
                                                    (0, _.jsxs)("strong", {
                                                      children: [
                                                        oa.queue.pending,
                                                        " pendente(s)",
                                                      ],
                                                    }),
                                                    (0, _.jsxs)("small", {
                                                      children: [
                                                        oa.queue.failures,
                                                        " falha(s) · ",
                                                        oa.connections
                                                          .connected,
                                                        " conta(s) conectada(s)",
                                                      ],
                                                    }),
                                                  ],
                                                }),
                                              ],
                                            })
                                          : (0, _.jsx)("div", {
                                              className:
                                                "automation-empty compact",
                                              children:
                                                "Executando diagnóstico…",
                                            }),
                                      ],
                                    }),
                                    (0, _.jsxs)("section", {
                                      className: "panel maintenance-panel",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "panel-heading",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "panel-kicker",
                                                  children:
                                                    "Dados e manutenção",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Backup e armazenamento",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("button", {
                                              className: "text-button",
                                              onClick: () => {
                                                Br();
                                              },
                                              children: "Reanalisar arquivos",
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "maintenance-grid",
                                          children: [
                                            (0, _.jsxs)("article", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "maintenance-icon",
                                                  children: (0, _.jsx)(y, {
                                                    name: "shield",
                                                  }),
                                                }),
                                                (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsx)("strong", {
                                                      children:
                                                        "Backup operacional seguro",
                                                    }),
                                                    (0, _.jsx)("p", {
                                                      children:
                                                        "Exporta contas, campanhas, fila, equipe e auditoria. Tokens, chaves e senhas são excluídos.",
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsx)("button", {
                                                  className: "outline-button",
                                                  disabled:
                                                    "owner" !==
                                                      ha?.currentUser.role ||
                                                    "saving" === fn,
                                                  onClick: () => {
                                                    (async () => {
                                                      (yn("saving"), Sn(""));
                                                      try {
                                                        let e = await w(
                                                          "/api/system/backup",
                                                          { cache: "no-store" },
                                                        );
                                                        if (!e.ok) {
                                                          let a =
                                                            await e.json();
                                                          throw Error(
                                                            a.error ||
                                                              "Não foi possível gerar o backup.",
                                                          );
                                                        }
                                                        let a = await e.blob(),
                                                          s =
                                                            URL.createObjectURL(
                                                              a,
                                                            ),
                                                          n =
                                                            document.createElement(
                                                              "a",
                                                            ),
                                                          t =
                                                            e.headers.get(
                                                              "content-disposition",
                                                            ) || "";
                                                        ((n.href = s),
                                                          (n.download =
                                                            t.match(
                                                              /filename="([^"]+)"/,
                                                            )?.[1] ||
                                                            `nexoflow-backup-${ye()}.json`),
                                                          n.click(),
                                                          URL.revokeObjectURL(
                                                            s,
                                                          ),
                                                          yn("success"),
                                                          Sn(
                                                            "Backup operacional baixado sem tokens, chaves secretas ou senhas.",
                                                          ),
                                                          await Vr());
                                                      } catch (e) {
                                                        (yn("error"),
                                                          Sn(
                                                            e instanceof Error
                                                              ? e.message
                                                              : "Não foi possível gerar o backup.",
                                                          ));
                                                      }
                                                    })();
                                                  },
                                                  children:
                                                    "owner" ===
                                                    ha?.currentUser.role
                                                      ? "Baixar backup JSON"
                                                      : "Somente administrador",
                                                }),
                                                (0, _.jsx)("button", {
                                                  className: "outline-button",
                                                  disabled:
                                                    "owner" !==
                                                      ha?.currentUser.role ||
                                                    "saving" === fn,
                                                  onClick: () => {
                                                    (async () => {
                                                      (yn("saving"), Sn(""));
                                                      try {
                                                        let e = await w(
                                                          "/api/system/source",
                                                          { cache: "no-store" },
                                                        );
                                                        if (!e.ok) {
                                                          let a =
                                                            await e.json();
                                                          throw Error(
                                                            a.error ||
                                                              "Não foi possível baixar o código.",
                                                          );
                                                        }
                                                        let a = await e.blob(),
                                                          s =
                                                            URL.createObjectURL(
                                                              a,
                                                            ),
                                                          n =
                                                            document.createElement(
                                                              "a",
                                                            );
                                                        ((n.href = s),
                                                          (n.download =
                                                            "resolvflow-fonte.zip"),
                                                          n.click(),
                                                          URL.revokeObjectURL(
                                                            s,
                                                          ),
                                                          yn("success"),
                                                          Sn(
                                                            "Código-fonte atual baixado. Descompacte essa pasta para continuar em outro editor.",
                                                          ));
                                                      } catch (e) {
                                                        (yn("error"),
                                                          Sn(
                                                            e instanceof Error
                                                              ? e.message
                                                              : "Não foi possível baixar o código.",
                                                          ));
                                                      }
                                                    })();
                                                  },
                                                  children:
                                                    "owner" ===
                                                    ha?.currentUser.role
                                                      ? "Baixar código-fonte"
                                                      : "Somente administrador",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("article", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "maintenance-icon",
                                                  children: (0, _.jsx)(y, {
                                                    name: "upload",
                                                  }),
                                                }),
                                                (0, _.jsxs)("div", {
                                                  children: [
                                                    (0, _.jsx)("strong", {
                                                      children: "Higiene do R2",
                                                    }),
                                                    (0, _.jsxs)("p", {
                                                      children: [
                                                        da
                                                          ? `${da.referenced} arquivo(s) em uso · ${da.orphaned} órfão(s) após retenção de ${da.retainedHours}h · ${he(da.totalBytes)} analisados.`
                                                          : "Analisando arquivos enviados e referências de campanhas…",
                                                        da?.truncated
                                                          ? " A análise atingiu o limite; revise antes de limpar."
                                                          : "",
                                                      ],
                                                    }),
                                                  ],
                                                }),
                                                (0, _.jsx)("button", {
                                                  className:
                                                    "outline-button danger-outline",
                                                  disabled:
                                                    !da?.canCleanup ||
                                                    !da.orphaned ||
                                                    da.truncated ||
                                                    "saving" === fn,
                                                  onClick: () => {
                                                    (async () => {
                                                      if (
                                                        da?.orphaned &&
                                                        window.confirm(
                                                          `Remover ${da.orphaned} arquivo(s) órfão(s), com mais de ${da.retainedHours} horas, que não pertencem a nenhuma campanha?`,
                                                        )
                                                      ) {
                                                        (yn("saving"), Sn(""));
                                                        try {
                                                          let e = await w(
                                                              "/api/system/storage",
                                                              {
                                                                method:
                                                                  "DELETE",
                                                                headers: {
                                                                  "content-type":
                                                                    "application/json",
                                                                },
                                                                body: JSON.stringify(
                                                                  {
                                                                    confirmation:
                                                                      "REMOVER_ORFAOS",
                                                                  },
                                                                ),
                                                              },
                                                            ),
                                                            a = await e.json();
                                                          if (!e.ok)
                                                            throw Error(
                                                              a.error ||
                                                                "Não foi possível limpar o armazenamento.",
                                                            );
                                                          (yn("success"),
                                                            Sn(
                                                              `${a.removed ?? 0} arquivo(s) órfão(s) removido(s), liberando ${he(a.removedBytes ?? 0)}.`,
                                                            ),
                                                            await Promise.all([
                                                              Br(),
                                                              Ur(),
                                                              Vr(),
                                                            ]));
                                                        } catch (e) {
                                                          (yn("error"),
                                                            Sn(
                                                              e instanceof Error
                                                                ? e.message
                                                                : "Não foi possível limpar o armazenamento.",
                                                            ));
                                                        }
                                                      }
                                                    })();
                                                  },
                                                  children: da?.orphaned
                                                    ? `Liberar ${he(da.orphanedBytes)}`
                                                    : "Nenhum órfão antigo",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "integration-grid",
                                      children: [
                                        (0, _.jsxs)("section", {
                                          className: "panel integration-card",
                                          children: [
                                            (0, _.jsx)("span", {
                                              className:
                                                "integration-logo csv-logo",
                                              children: "CSV",
                                            }),
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("h3", {
                                                  children:
                                                    "Murphy / HeavyFlow",
                                                }),
                                                (0, _.jsx)("p", {
                                                  children:
                                                    "Importe a lista atual e organize as contas antes da autorização OAuth.",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("span", {
                                              className: "ready-pill",
                                              children: [
                                                (0, _.jsx)("i", {}),
                                                "Disponível",
                                              ],
                                            }),
                                            (0, _.jsxs)("button", {
                                              className: "outline-button",
                                              disabled: !Bs,
                                              onClick: () => Bs && N(!0),
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "upload",
                                                }),
                                                Bs
                                                  ? "Importar arquivo"
                                                  : "Somente leitura",
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("section", {
                                          className: "panel integration-card",
                                          children: [
                                            (0, _.jsx)("span", {
                                              className:
                                                "integration-logo api-logo",
                                              children: "AUTO",
                                            }),
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("h3", {
                                                  children: "Motor resolv.",
                                                }),
                                                (0, _.jsx)("p", {
                                                  children:
                                                    "Fila em duas etapas, retentativas e proteção contra publicação duplicada.",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("span", {
                                              className: "ready-pill",
                                              children: [
                                                (0, _.jsx)("i", {}),
                                                "Implementado",
                                              ],
                                            }),
                                            (0, _.jsx)("button", {
                                              className: "outline-button",
                                              onClick: () => s("queue"),
                                              children: "Abrir fila",
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("section", {
                                      className: "panel audit-directory",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "panel-heading",
                                          children: [
                                            (0, _.jsxs)("div", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  className: "panel-kicker",
                                                  children: "Rastreabilidade",
                                                }),
                                                (0, _.jsx)("h2", {
                                                  children:
                                                    "Histórico operacional",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("button", {
                                              className: "text-button",
                                              onClick: () => {
                                                Vr();
                                              },
                                              children: "Atualizar",
                                            }),
                                          ],
                                        }),
                                        ua.length
                                          ? (0, _.jsx)("div", {
                                              className: "audit-list",
                                              children: ua
                                                .slice(0, 12)
                                                .map((e) =>
                                                  (0, _.jsxs)(
                                                    "article",
                                                    {
                                                      children: [
                                                        (0, _.jsx)("span", {
                                                          className:
                                                            "audit-dot",
                                                        }),
                                                        (0, _.jsxs)("span", {
                                                          children: [
                                                            (0, _.jsx)(
                                                              "strong",
                                                              {
                                                                children:
                                                                  e.summary,
                                                              },
                                                            ),
                                                            (0, _.jsxs)(
                                                              "small",
                                                              {
                                                                children: [
                                                                  e.actorEmail,
                                                                  " · ",
                                                                  e.action,
                                                                ],
                                                              },
                                                            ),
                                                          ],
                                                        }),
                                                        (0, _.jsx)("time", {
                                                          children: new Date(
                                                            e.createdAt,
                                                          ).toLocaleString(
                                                            "pt-BR",
                                                          ),
                                                        }),
                                                      ],
                                                    },
                                                    e.id,
                                                  ),
                                                ),
                                            })
                                          : (0, _.jsxs)("div", {
                                              className:
                                                "automation-empty compact",
                                              children: [
                                                (0, _.jsx)("h3", {
                                                  children:
                                                    "Nenhuma ação registrada ainda",
                                                }),
                                                (0, _.jsx)("p", {
                                                  children:
                                                    "Importações, organização de contas, campanhas e mudanças de equipe aparecerão aqui.",
                                                }),
                                              ],
                                            }),
                                      ],
                                    }),
                                    (0, _.jsxs)("section", {
                                      className: "panel security-panel",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          children: [
                                            (0, _.jsx)("span", {
                                              className: "alert-icon",
                                              children: (0, _.jsx)(y, {
                                                name: "shield",
                                              }),
                                            }),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("h3", {
                                                  children:
                                                    "Princípios de segurança",
                                                }),
                                                (0, _.jsx)("p", {
                                                  children:
                                                    "Permissões mínimas, tokens criptografados, isolamento por usuário e ações auditáveis.",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "security-tags",
                                          children: [
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "check",
                                                }),
                                                "OAuth oficial",
                                              ],
                                            }),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "check",
                                                }),
                                                "Sem senhas",
                                              ],
                                            }),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)(y, {
                                                  name: "check",
                                                }),
                                                "Confirmação antes de agendar",
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
          ],
        }),
        bs &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => !qs && fs(!1)),
            children: (0, _.jsxs)("form", {
              className: "import-modal campaign-modal profile-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "profile-title",
              onSubmit: async (e) => {
                e.preventDefault();
                let a = ys.trim().slice(0, 120);
                if (!a) return (Is(!0), void Rs("Informe o nome de usuário."));
                if ((Ms || Ts) && Ms !== Ts)
                  return (
                    Is(!0),
                    void Rs("A confirmação da senha não confere.")
                  );
                (Ls(!0), Rs(""), Is(!1));
                try {
                  let e = await w("/api/team", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        action: "update_own_profile",
                        displayName: a,
                        notifyPublish: ws,
                        notifyErrors: Ss,
                        notifyConnections: Es,
                      }),
                    }),
                    s = await e.json();
                  if (!e.ok)
                    throw Error(s.error || "Não foi possível salvar o perfil.");
                  if (Ms) {
                    let e = await w("/api/team", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          action: "change_own_password",
                          password: Ms,
                        }),
                      }),
                      a = await e.json();
                    if (!e.ok)
                      throw Error(
                        a.error ||
                          "O perfil foi salvo, mas a senha não pôde ser alterada.",
                      );
                    return void (window.location.href = "/__nexoflow/logout");
                  }
                  (await Gr(),
                    Ls(!1),
                    fs(!1),
                    yn("success"),
                    Sn("Perfil atualizado."));
                } catch (e) {
                  (Ls(!1),
                    Is(!0),
                    Rs(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível salvar o perfil.",
                    ));
                }
              },
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => fs(!1),
                  "aria-label": "Fechar",
                  disabled: qs,
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "users", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "profile-title",
                  children: "Meu perfil",
                }),
                (0, _.jsx)("p", {
                  children:
                    "O nome aparece para a equipe. O e-mail de login permanece o mesmo. A troca de senha encerra as sessões abertas.",
                }),
                (0, _.jsxs)("div", {
                  className: "profile-identity",
                  children: [
                    (0, _.jsx)(He, {
                      name: ys || ha?.currentUser.displayName || "RF",
                      url: ha?.currentUser.avatarUrl,
                      className: "profile-avatar",
                    }),
                    (0, _.jsxs)("div", {
                      children: [
                        (0, _.jsx)("strong", {
                          children: ha?.currentUser.email,
                        }),
                        (0, _.jsx)("small", {
                          children:
                            "owner" === ha?.currentUser.role
                              ? "Administrador"
                              : "editor" === ha?.currentUser.role
                                ? "Editor"
                                : "Somente leitura",
                        }),
                        (0, _.jsxs)("div", {
                          className: "profile-photo-actions",
                          children: [
                            (0, _.jsx)("button", {
                              type: "button",
                              className: "outline-button compact-button",
                              disabled: qs,
                              onClick: () => zs.current?.click(),
                              children: ha?.currentUser.avatarUrl
                                ? "Trocar foto"
                                : "Adicionar foto",
                            }),
                            ha?.currentUser.avatarUrl
                              ? (0, _.jsx)("button", {
                                  type: "button",
                                  className: "text-button",
                                  disabled: qs,
                                  onClick: () => {
                                    (async () => {
                                      (Ls(!0), Rs(""), Is(!1));
                                      try {
                                        let e = await w("/api/profile/avatar", {
                                            method: "DELETE",
                                          }),
                                          a = await e.json();
                                        if (!e.ok)
                                          throw Error(
                                            a.error ||
                                              "Não foi possível remover a foto.",
                                          );
                                        (await Gr(),
                                          Ls(!1),
                                          Rs("Foto de perfil removida."));
                                      } catch (e) {
                                        (Ls(!1),
                                          Is(!0),
                                          Rs(
                                            e instanceof Error
                                              ? e.message
                                              : "Não foi possível remover a foto.",
                                          ));
                                      }
                                    })();
                                  },
                                  children: "Remover",
                                })
                              : null,
                          ],
                        }),
                        (0, _.jsx)("input", {
                          ref: zs,
                          type: "file",
                          accept: "image/jpeg,image/png,image/webp",
                          hidden: !0,
                          onChange: (e) => {
                            let a = e.target.files?.[0];
                            ((e.target.value = ""),
                              a &&
                                (async (e) => {
                                  if (
                                    ![
                                      "image/jpeg",
                                      "image/png",
                                      "image/webp",
                                    ].includes(e.type)
                                  )
                                    return (
                                      Is(!0),
                                      void Rs(
                                        "Use uma imagem JPG, PNG ou WEBP.",
                                      )
                                    );
                                  if (e.size > 5242880)
                                    return (
                                      Is(!0),
                                      void Rs(
                                        "A foto de perfil precisa ter até 5 MB.",
                                      )
                                    );
                                  (Ls(!0), Rs(""), Is(!1));
                                  try {
                                    let a = await w(
                                        `/api/profile/avatar?name=${encodeURIComponent(e.name)}`,
                                        {
                                          method: "POST",
                                          headers: {
                                            "content-type": e.type,
                                            "x-file-size": String(e.size),
                                          },
                                          body: e,
                                        },
                                      ),
                                      s = await a.json();
                                    if (!a.ok)
                                      throw Error(
                                        s.error ||
                                          "Não foi possível enviar a foto.",
                                      );
                                    (await Gr(),
                                      Ls(!1),
                                      Rs("Foto de perfil atualizada."));
                                  } catch (e) {
                                    (Ls(!1),
                                      Is(!0),
                                      Rs(
                                        e instanceof Error
                                          ? e.message
                                          : "Não foi possível enviar a foto.",
                                      ));
                                  }
                                })(a));
                          },
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "form-grid",
                  children: [
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsx)("span", { children: "Nome de usuário" }),
                        (0, _.jsx)("input", {
                          required: !0,
                          maxLength: 120,
                          value: ys,
                          onChange: (e) => Ns(e.target.value),
                          placeholder: "Como você quer aparecer",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", {
                          children: "Nova senha · opcional",
                        }),
                        (0, _.jsx)("input", {
                          type: "password",
                          minLength: 10,
                          autoComplete: "new-password",
                          value: Ms,
                          onChange: (e) => $s(e.target.value),
                          placeholder: "Deixe vazio para manter",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Confirmar senha" }),
                        (0, _.jsx)("input", {
                          type: "password",
                          minLength: 10,
                          autoComplete: "new-password",
                          value: Ts,
                          onChange: (e) => Ps(e.target.value),
                          placeholder: "Repita a nova senha",
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "profile-notify",
                  children: [
                    (0, _.jsx)("strong", { children: "Notificações" }),
                    (0, _.jsxs)("label", {
                      className: "switch-control",
                      children: [
                        (0, _.jsx)("input", {
                          type: "checkbox",
                          checked: ws,
                          onChange: (e) => Cs(e.target.checked),
                        }),
                        (0, _.jsx)("i", {}),
                        (0, _.jsx)("b", { children: "Publicações" }),
                      ],
                    }),
                    (0, _.jsx)("small", {
                      children: "Falhas, bloqueios e legendas da fila",
                    }),
                    (0, _.jsxs)("label", {
                      className: "switch-control",
                      children: [
                        (0, _.jsx)("input", {
                          type: "checkbox",
                          checked: Ss,
                          onChange: (e) => ks(e.target.checked),
                        }),
                        (0, _.jsx)("i", {}),
                        (0, _.jsx)("b", { children: "Erros e restrições" }),
                      ],
                    }),
                    (0, _.jsx)("small", {
                      children:
                        "Restrições da Meta, limite de vídeos e alertas da conta",
                    }),
                    (0, _.jsxs)("label", {
                      className: "switch-control",
                      children: [
                        (0, _.jsx)("input", {
                          type: "checkbox",
                          checked: Es,
                          onChange: (e) => As(e.target.checked),
                        }),
                        (0, _.jsx)("i", {}),
                        (0, _.jsx)("b", { children: "Conexões" }),
                      ],
                    }),
                    (0, _.jsx)("small", {
                      children: "Reconexão, token vencendo e sincronização",
                    }),
                  ],
                }),
                Os &&
                  (0, _.jsx)("div", {
                    className: "import-result " + (Fs ? "error" : "success"),
                    children: Os,
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-actions",
                  children: [
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "outline-button",
                      onClick: () => fs(!1),
                      disabled: qs,
                      children: "Cancelar",
                    }),
                    (0, _.jsx)("button", {
                      className: "primary-button",
                      disabled: qs,
                      children: qs ? "Salvando..." : "Salvar perfil",
                    }),
                  ],
                }),
              ],
            }),
          }),
        d &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => u(!1)),
            children: (0, _.jsxs)("section", {
              className: "import-modal dash-customize-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "dash-customize-title",
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => u(!1),
                  "aria-label": "Fechar",
                  children: "×",
                }),
                (0, _.jsx)("h2", {
                  id: "dash-customize-title",
                  children: "Personalizar visão geral",
                }),
                (0, _.jsx)("p", {
                  children:
                    "Escolha o que aparece, a ordem dos blocos e os números de cada faixa. A escolha fica só neste navegador.",
                }),
                (0, _.jsxs)("div", {
                  className: "dash-customize-section",
                  children: [
                    (0, _.jsx)("strong", { children: "Blocos" }),
                    (0, _.jsx)("ul", {
                      className: "dash-widget-list",
                      children: Wi.map((e, a, s) => {
                        let n = o.hidden.includes(e),
                          t = se.find((a) => a.id === e)?.label || e;
                        return (0, _.jsxs)(
                          "li",
                          {
                            className: n ? "is-hidden" : "",
                            children: [
                              (0, _.jsx)("button", {
                                type: "button",
                                className:
                                  "dash-widget-toggle " + (n ? "" : "is-on"),
                                "aria-pressed": !n,
                                onClick: () =>
                                  ((e) =>
                                    c((a) => ({
                                      ...a,
                                      hidden: a.hidden.includes(e)
                                        ? a.hidden.filter((a) => a !== e)
                                        : [...a.hidden, e],
                                      widgets: a.widgets.includes(e)
                                        ? a.widgets
                                        : [...a.widgets, e],
                                    })))(e),
                                children: n ? "Oculto" : "Visível",
                              }),
                              (0, _.jsx)("span", { children: t }),
                              (0, _.jsxs)("span", {
                                className: "dash-widget-move",
                                children: [
                                  (0, _.jsx)("button", {
                                    type: "button",
                                    disabled: 0 === a,
                                    "aria-label": `Subir ${t}`,
                                    onClick: () =>
                                      c((e) => ({
                                        ...e,
                                        widgets: fe(Hi(e.widgets), a, -1),
                                      })),
                                    children: "↑",
                                  }),
                                  (0, _.jsx)("button", {
                                    type: "button",
                                    disabled: a === s.length - 1,
                                    "aria-label": `Descer ${t}`,
                                    onClick: () =>
                                      c((e) => ({
                                        ...e,
                                        widgets: fe(Hi(e.widgets), a, 1),
                                      })),
                                    children: "↓",
                                  }),
                                ],
                              }),
                            ],
                          },
                          e,
                        );
                      }),
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "dash-customize-section",
                  children: [
                    (0, _.jsx)("strong", {
                      children: "Indicadores principais",
                    }),
                    (0, _.jsx)("div", {
                      className: "dash-metric-picks",
                      children: o.cards.map((e, a) =>
                        (0, _.jsxs)(
                          "label",
                          {
                            children: [
                              (0, _.jsxs)("span", {
                                children: ["Card ", a + 1],
                              }),
                              (0, _.jsx)("select", {
                                value: e,
                                onChange: (e) =>
                                  ((e, a) =>
                                    c((s) => ({
                                      ...s,
                                      cards: s.cards.map((s, n) =>
                                        n === e ? a : s,
                                      ),
                                    })))(a, e.target.value),
                                children: ce.map((e) =>
                                  (0, _.jsx)(
                                    "option",
                                    { value: e.id, children: e.label },
                                    e.id,
                                  ),
                                ),
                              }),
                            ],
                          },
                          `card-${a}`,
                        ),
                      ),
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "dash-customize-section",
                  children: [
                    (0, _.jsx)("strong", { children: "Faixa de números" }),
                    (0, _.jsx)("div", {
                      className: "dash-metric-picks",
                      children: o.strip.map((e, a) =>
                        (0, _.jsxs)(
                          "label",
                          {
                            children: [
                              (0, _.jsxs)("span", {
                                children: ["Coluna ", a + 1],
                              }),
                              (0, _.jsx)("select", {
                                value: e,
                                onChange: (e) =>
                                  ((e, a) =>
                                    c((s) => ({
                                      ...s,
                                      strip: s.strip.map((s, n) =>
                                        n === e ? a : s,
                                      ),
                                    })))(a, e.target.value),
                                children: ce.map((e) =>
                                  (0, _.jsx)(
                                    "option",
                                    { value: e.id, children: e.label },
                                    e.id,
                                  ),
                                ),
                              }),
                            ],
                          },
                          `strip-${a}`,
                        ),
                      ),
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "modal-actions",
                  children: [
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "text-button",
                      onClick: () => c(le),
                      children: "Restaurar padrão",
                    }),
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "primary-button",
                      onClick: () => u(!1),
                      children: "Concluir",
                    }),
                  ],
                }),
              ],
            }),
          }),
        f &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => "saving" !== fn && N(!1)),
            children: (0, _.jsxs)("section", {
              className: "import-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "import-title",
              children: [
                (0, _.jsx)("button", {
                  className: "modal-close",
                  onClick: () => N(!1),
                  "aria-label": "Fechar",
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "upload", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "import-title",
                  children: "Importar contas do Murphy",
                }),
                (0, _.jsx)("p", {
                  children:
                    "Use o CSV exportado da área Contas. O arquivo alimenta somente sua base resolv. e não dispara nenhuma ação na Meta.",
                }),
                (0, _.jsxs)("label", {
                  className: "drop-zone " + (S ? "file-ready" : ""),
                  children: [
                    (0, _.jsx)("input", {
                      type: "file",
                      accept: ".csv,text/csv",
                      onChange: (e) => {
                        let a = e.target.files?.[0];
                        if (!a) return;
                        ($("idle"), q(""));
                        let s = new FileReader();
                        ((s.onload = () => {
                          let e = String(s.result),
                            n = e.split(/\r?\n/).filter(Boolean).length - 1;
                          (A(e), k({ name: a.name, rows: Math.max(0, n) }));
                        }),
                          s.readAsText(a));
                      },
                    }),
                    S
                      ? (0, _.jsxs)(_.Fragment, {
                          children: [
                            (0, _.jsx)("span", {
                              className: "success-check",
                              children: (0, _.jsx)(y, { name: "check" }),
                            }),
                            (0, _.jsx)("strong", { children: S.name }),
                            (0, _.jsxs)("small", {
                              children: [
                                S.rows,
                                " linhas encontradas · clique para trocar",
                              ],
                            }),
                          ],
                        })
                      : (0, _.jsxs)(_.Fragment, {
                          children: [
                            (0, _.jsx)(y, { name: "upload", size: 26 }),
                            (0, _.jsx)("strong", {
                              children: "Selecione ou arraste o arquivo CSV",
                            }),
                            (0, _.jsx)("small", {
                              children: "Máximo de 10 MB",
                            }),
                          ],
                        }),
                  ],
                }),
                P &&
                  (0, _.jsx)("div", {
                    className: `import-result ${M}`,
                    children: P,
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-note",
                  children: [
                    (0, _.jsx)(y, { name: "shield" }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", { children: "Importação segura" }),
                        (0, _.jsx)("small", {
                          children:
                            "Nenhuma senha, token ou chave secreta é necessária.",
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "modal-actions",
                  children: [
                    (0, _.jsx)("button", {
                      className: "outline-button",
                      onClick: () => {
                        (N(!1), "success" === M && s("accounts"));
                      },
                      children:
                        "success" === M ? "Ver contas importadas" : "Cancelar",
                    }),
                    (0, _.jsx)("button", {
                      className: "primary-button",
                      disabled: !S || "saving" === M || "success" === M,
                      onClick: async () => {
                        if (S && E) {
                          ($("saving"), q(""));
                          try {
                            let e = await w("/api/imports", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  fileName: S.name,
                                  csvText: E,
                                }),
                              }),
                              a = await e.json();
                            if (!e.ok)
                              throw Error(a.error || "Falha na importação");
                            ($("success"),
                              q(
                                `${a.imported ?? 0} conta(s) nova(s), ${a.updated ?? 0} atualizada(s) e ${a.skipped ?? 0} linha(s) ignorada(s).`,
                              ),
                              Rr());
                          } catch (e) {
                            ($("error"),
                              q(
                                e instanceof Error
                                  ? e.message
                                  : "Não foi possível importar o arquivo.",
                              ));
                          }
                        }
                      },
                      children:
                        "saving" === M
                          ? "Importando..."
                          : "success" === M
                            ? "Importação concluída"
                            : S
                              ? `Importar ${S.rows} contas`
                              : "Aguardando arquivo",
                    }),
                  ],
                }),
              ],
            }),
          }),
        Ye &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => "saving" !== fn && Ze(!1)),
            children: (0, _.jsxs)("form", {
              className: "import-modal campaign-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "bulk-title",
              onSubmit: async (e) => {
                if ((e.preventDefault(), !Y.length)) return;
                (yn("saving"), Sn(""));
                let a = [
                    "loginEmail",
                    "recoveryEmail",
                    "phoneNumber",
                    "twoFactorMethod",
                    "emailTwoFactor",
                    "vaultReference",
                    "loginPassword",
                    "emailPassword",
                  ],
                  s = Object.fromEntries(
                    Object.entries(
                      "single" === ea
                        ? sa
                        : Object.fromEntries(
                            Object.entries(sa).filter(([, e]) => "" !== e),
                          ),
                    ).filter(
                      ([e, s]) =>
                        !(
                          (!G && a.includes(e)) ||
                          !(
                            ("loginPassword" !== e && "emailPassword" !== e) ||
                            String(s || "").trim()
                          ) ||
                          ("single" !== ea && "" === s)
                        ),
                    ),
                  );
                try {
                  let e = await w("/api/accounts", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ ids: Y, ...s }),
                    }),
                    a = await e.json();
                  if (!e.ok)
                    throw Error(
                      a.error || "Não foi possível atualizar as contas.",
                    );
                  (yn("success"),
                    Sn(`${a.updated ?? 0} conta(s) organizadas com sucesso.`),
                    Ze(!1),
                    na(Ie),
                    Ya((e) => {
                      let a = { ...e };
                      for (let e of Y) delete a[e];
                      return a;
                    }),
                    Z([]),
                    await Rr());
                } catch (e) {
                  (yn("error"),
                    Sn(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível organizar as contas.",
                    ));
                }
              },
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => Ze(!1),
                  "aria-label": "Fechar",
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "users", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "bulk-title",
                  children:
                    "single" === ea
                      ? `Editar @${B.find((e) => Y.includes(e.id))?.username || "conta"}`
                      : `Organizar ${Y.length} conta(s)`,
                }),
                (0, _.jsx)("p", {
                  children:
                    "single" === ea
                      ? "Acesso, senhas e organização desta conta. Campos vazios de senha não apagam o que já está guardado."
                      : "Preencha somente os campos que deseja alterar em todas as contas selecionadas.",
                }),
                "single" === ea &&
                  (() => {
                    let e = B.find((e) => Y.includes(e.id));
                    return e
                      ? (0, _.jsxs)("div", {
                          className: "profile-metrics",
                          children: [
                            (0, _.jsxs)("article", {
                              children: [
                                (0, _.jsx)("span", { children: "Saúde" }),
                                (0, _.jsx)("strong", {
                                  children: (0, _.jsx)(Le, { status: Ce(e) }),
                                }),
                              ],
                            }),
                            (0, _.jsxs)("article", {
                              children: [
                                (0, _.jsx)("span", { children: "Seguidores" }),
                                (0, _.jsx)("strong", {
                                  children: C(e.followersCount),
                                }),
                                (0, _.jsxs)("small", {
                                  children: [
                                    C(e.followsCount || 0),
                                    " seguindo",
                                  ],
                                }),
                              ],
                            }),
                            (0, _.jsxs)("article", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Acessos ao perfil · 30d",
                                }),
                                (0, _.jsx)("strong", {
                                  children: C(e.profileViews30d || 0),
                                }),
                                (0, _.jsxs)("small", {
                                  children: [
                                    C(e.newFollowers30d || 0),
                                    " novos seguidores",
                                  ],
                                }),
                              ],
                            }),
                            (0, _.jsxs)("article", {
                              children: [
                                (0, _.jsx)("span", { children: "Views · 30d" }),
                                (0, _.jsx)("strong", {
                                  children: C(e.views30d),
                                }),
                                (0, _.jsxs)("small", {
                                  children: [C(e.reach30d), " de alcance"],
                                }),
                              ],
                            }),
                            (0, _.jsxs)("article", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Limite da Meta",
                                }),
                                (0, _.jsx)("strong", {
                                  className:
                                    (e.quotaUsed ?? 0) >= (e.quotaTotal ?? 100)
                                      ? "quota-full"
                                      : "",
                                  children: Re(e),
                                }),
                                (0, _.jsxs)("small", {
                                  children: [
                                    e.published30d ?? 0,
                                    " publicadas · ",
                                    e.successRate ?? 0,
                                    "% sucesso",
                                  ],
                                }),
                              ],
                            }),
                            (0, _.jsxs)("article", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Conteúdo no perfil",
                                }),
                                (0, _.jsx)("strong", {
                                  children: C(e.mediaCount || 0),
                                }),
                                (0, _.jsxs)("small", {
                                  children: [e.queueCount, " na fila"],
                                }),
                              ],
                            }),
                          ],
                        })
                      : null;
                  })(),
                (0, _.jsxs)("div", {
                  className: "form-grid",
                  children: [
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Modelo" }),
                        (0, _.jsx)("input", {
                          value: sa.model,
                          onChange: (e) => na({ ...sa, model: e.target.value }),
                          placeholder: "Ex.: Modelo 50/dia",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", {
                          children: "Player / responsável",
                        }),
                        (0, _.jsx)("input", {
                          value: sa.player,
                          onChange: (e) =>
                            na({ ...sa, player: e.target.value }),
                          placeholder: "Ex.: Lucas",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Grupo" }),
                        (0, _.jsx)("input", {
                          value: sa.groupName,
                          onChange: (e) =>
                            na({ ...sa, groupName: e.target.value }),
                          placeholder: "Ex.: Operação 01",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Nicho" }),
                        (0, _.jsx)("input", {
                          value: sa.niche,
                          onChange: (e) => na({ ...sa, niche: e.target.value }),
                          placeholder: "Ex.: Fitness",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Prioridade" }),
                        (0, _.jsxs)("select", {
                          value:
                            sa.priority || ("single" === ea ? "Normal" : ""),
                          onChange: (e) =>
                            na({ ...sa, priority: e.target.value }),
                          children: [
                            "single" !== ea &&
                              (0, _.jsx)("option", {
                                value: "",
                                children: "Não alterar",
                              }),
                            (0, _.jsx)("option", { children: "Alta" }),
                            (0, _.jsx)("option", { children: "Média" }),
                            (0, _.jsx)("option", { children: "Normal" }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Situação" }),
                        (0, _.jsxs)("select", {
                          value:
                            sa.lifecycle || ("single" === ea ? "ativa" : ""),
                          onChange: (e) =>
                            na({ ...sa, lifecycle: e.target.value }),
                          children: [
                            "single" !== ea &&
                              (0, _.jsx)("option", {
                                value: "",
                                children: "Não alterar",
                              }),
                            (0, _.jsx)("option", {
                              value: "ativa",
                              children: "Ativa · operação",
                            }),
                            (0, _.jsx)("option", {
                              value: "aquecendo",
                              children: "Aquecendo",
                            }),
                            (0, _.jsx)("option", {
                              value: "caida",
                              children: "Caída · arquivo",
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsx)("span", { children: "Observações" }),
                        (0, _.jsx)("textarea", {
                          rows: 3,
                          value: sa.notes,
                          onChange: (e) => na({ ...sa, notes: e.target.value }),
                          placeholder:
                            "PIN, navegador, o que for útil na hora de logar",
                        }),
                      ],
                    }),
                  ],
                }),
                "single" === ea &&
                  G &&
                  (() => {
                    let e = B.find((e) => Y.includes(e.id));
                    return (0, _.jsxs)(_.Fragment, {
                      children: [
                        (0, _.jsxs)("div", {
                          className: "profile-access-heading",
                          children: [
                            (0, _.jsx)(y, { name: "shield", size: 18 }),
                            (0, _.jsxs)("span", {
                              children: [
                                (0, _.jsx)("strong", {
                                  children:
                                    "Acesso e recuperação · somente administrador",
                                }),
                                (0, _.jsx)("small", {
                                  children:
                                    "Senhas ficam cifradas. Campo vazio não apaga o que já está guardado.",
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsxs)("div", {
                          className: "form-grid",
                          children: [
                            (0, _.jsxs)("label", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "E-mail de login",
                                }),
                                (0, _.jsx)("input", {
                                  type: "email",
                                  maxLength: 254,
                                  value: sa.loginEmail,
                                  onChange: (e) =>
                                    na({ ...sa, loginEmail: e.target.value }),
                                  placeholder: "conta@exemplo.com",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "E-mail de recuperação",
                                }),
                                (0, _.jsx)("input", {
                                  type: "email",
                                  maxLength: 254,
                                  value: sa.recoveryEmail,
                                  onChange: (e) =>
                                    na({
                                      ...sa,
                                      recoveryEmail: e.target.value,
                                    }),
                                  placeholder: "recuperacao@exemplo.com",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Senha do Instagram",
                                }),
                                (0, _.jsx)("input", {
                                  type: "password",
                                  autoComplete: "new-password",
                                  maxLength: 200,
                                  value: sa.loginPassword,
                                  onChange: (e) =>
                                    na({
                                      ...sa,
                                      loginPassword: e.target.value,
                                    }),
                                  placeholder: e?.hasLoginPassword
                                    ? "Já guardada · cole outra só se for trocar"
                                    : "Cole a senha do Instagram",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Senha do e-mail",
                                }),
                                (0, _.jsx)("input", {
                                  type: "password",
                                  autoComplete: "new-password",
                                  maxLength: 200,
                                  value: sa.emailPassword,
                                  onChange: (e) =>
                                    na({
                                      ...sa,
                                      emailPassword: e.target.value,
                                    }),
                                  placeholder: e?.hasEmailPassword
                                    ? "Já guardada · cole outra só se for trocar"
                                    : "Cole a senha do e-mail",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Telefone vinculado",
                                }),
                                (0, _.jsx)("input", {
                                  maxLength: 50,
                                  value: sa.phoneNumber,
                                  onChange: (e) =>
                                    na({ ...sa, phoneNumber: e.target.value }),
                                  placeholder: "+55 11 99999-9999",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              children: [
                                (0, _.jsx)("span", {
                                  children: "2FA do Instagram",
                                }),
                                (0, _.jsxs)("select", {
                                  value: sa.twoFactorMethod,
                                  onChange: (e) =>
                                    na({
                                      ...sa,
                                      twoFactorMethod: e.target.value,
                                    }),
                                  children: [
                                    (0, _.jsx)("option", {
                                      value: "",
                                      children: "Não informado",
                                    }),
                                    (0, _.jsx)("option", {
                                      children: "Aplicativo autenticador",
                                    }),
                                    (0, _.jsx)("option", { children: "SMS" }),
                                    (0, _.jsx)("option", {
                                      children: "E-mail",
                                    }),
                                    (0, _.jsx)("option", {
                                      children: "Chave física",
                                    }),
                                    (0, _.jsx)("option", {
                                      children: "Não configurado",
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              className: "full-field",
                              children: [
                                (0, _.jsx)("span", {
                                  children: "2FA do e-mail",
                                }),
                                (0, _.jsx)("input", {
                                  maxLength: 500,
                                  value: sa.emailTwoFactor,
                                  onChange: (e) =>
                                    na({
                                      ...sa,
                                      emailTwoFactor: e.target.value,
                                    }),
                                  placeholder:
                                    "Authy, SMS no número, códigos de backup…",
                                }),
                              ],
                            }),
                            (0, _.jsxs)("label", {
                              className: "full-field",
                              children: [
                                (0, _.jsx)("span", {
                                  children: "Referência no cofre externo",
                                }),
                                (0, _.jsx)("input", {
                                  maxLength: 500,
                                  value: sa.vaultReference,
                                  onChange: (e) =>
                                    na({
                                      ...sa,
                                      vaultReference: e.target.value,
                                    }),
                                  placeholder:
                                    "Ex.: 1Password › Instagram › @perfil",
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsxs)("div", {
                          className: "modal-note",
                          children: [
                            (0, _.jsx)(y, { name: "shield" }),
                            (0, _.jsxs)("span", {
                              children: [
                                (0, _.jsx)("strong", {
                                  children: "Cofre operacional",
                                }),
                                (0, _.jsx)("small", {
                                  children:
                                    "Senhas do Instagram e do e-mail ficam cifradas. Observações são texto livre. Não cole código 2FA lá se puder evitar.",
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    });
                  })(),
                Cn &&
                  (0, _.jsx)("div", {
                    className: `import-result ${fn}`,
                    children: Cn,
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-actions",
                  children: [
                    "owner" === ha?.currentUser.role &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "text-button danger-action",
                        disabled: "saving" === fn,
                        onClick: () => {
                          sl(Y);
                        },
                        children: "Excluir perfil",
                      }),
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "outline-button",
                      onClick: () => Ze(!1),
                      children: "Fechar",
                    }),
                    Bs &&
                      (0, _.jsx)("button", {
                        className: "primary-button",
                        disabled: "saving" === fn,
                        children:
                          "saving" === fn
                            ? "Salvando..."
                            : "Salvar organização",
                      }),
                  ],
                }),
              ],
            }),
          }),
        Ma &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) =>
              ge(e, () => "saving" !== fn && ($a(null), Ia(!1))),
            children: (0, _.jsxs)("form", {
              className: "import-modal campaign-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "team-member-title",
              onSubmit: Fa
                ? (e) => {
                    (e.preventDefault(), cl());
                  }
                : async (e) => {
                    if ((e.preventDefault(), Ma)) {
                      (yn("saving"), Sn(""));
                      try {
                        let e = await w("/api/team", {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              action: "update_member",
                              memberId: Ma,
                              displayName: Ta,
                              role: qa,
                            }),
                          }),
                          a = await e.json();
                        if (!e.ok)
                          throw Error(
                            a.error || "Não foi possível atualizar o acesso.",
                          );
                        if (Oa.trim()) {
                          let e = await w("/api/team", {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({
                                action: "reset_password",
                                memberId: Ma,
                                password: Oa,
                              }),
                            }),
                            a = await e.json();
                          if (!e.ok)
                            throw Error(
                              a.error ||
                                "O acesso foi salvo, mas a senha não pôde ser redefinida.",
                            );
                          (Ra(""),
                            Sn(
                              "Nome, permissão e senha temporária atualizados. As sessões anteriores foram encerradas.",
                            ));
                        } else Sn("Nome e permissão atualizados.");
                        ($a(null), Ia(!1), yn("success"), await Gr());
                      } catch (e) {
                        (yn("error"),
                          Sn(
                            e instanceof Error
                              ? e.message
                              : "Não foi possível atualizar o acesso.",
                          ));
                      }
                    }
                  },
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => {
                    ($a(null), Ia(!1));
                  },
                  "aria-label": "Fechar",
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "users", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "team-member-title",
                  children: Fa ? "Conta independente" : "Gerenciar acesso",
                }),
                (0, _.jsx)("p", {
                  children: Fa
                    ? "Você só controla o login. Os dados, perfis e campanhas dele continuam invisíveis para esta operação."
                    : "Altere o nome, a permissão ou gere uma nova senha temporária.",
                }),
                (0, _.jsxs)("div", {
                  className: "form-grid",
                  children: [
                    !Fa &&
                      (0, _.jsxs)("label", {
                        children: [
                          (0, _.jsx)("span", { children: "Nome" }),
                          (0, _.jsx)("input", {
                            required: !0,
                            maxLength: 120,
                            value: Ta,
                            onChange: (e) => Pa(e.target.value),
                          }),
                        ],
                      }),
                    !Fa &&
                      (0, _.jsxs)("label", {
                        children: [
                          (0, _.jsx)("span", { children: "Nível de acesso" }),
                          (0, _.jsxs)("select", {
                            value: qa,
                            onChange: (e) => La(e.target.value),
                            children: [
                              (0, _.jsx)("option", {
                                value: "editor",
                                children: "Editor · organiza e opera",
                              }),
                              (0, _.jsx)("option", {
                                value: "viewer",
                                children: "Somente leitura",
                              }),
                            ],
                          }),
                        ],
                      }),
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsxs)("span", {
                          children: [
                            "Nova senha temporária",
                            Fa ? "" : " · opcional",
                          ],
                        }),
                        (0, _.jsx)("input", {
                          type: "password",
                          minLength: 10,
                          autoComplete: "new-password",
                          value: Oa,
                          onChange: (e) => Ra(e.target.value),
                          placeholder: "10+ caracteres, letras e números",
                          required: Fa,
                        }),
                        (0, _.jsx)("small", {
                          className: "field-help",
                          children:
                            "Ao redefinir, todas as sessões atuais dessa pessoa serão encerradas e ela deverá trocar a senha.",
                        }),
                      ],
                    }),
                  ],
                }),
                Cn &&
                  (0, _.jsx)("div", {
                    className: `import-result ${fn}`,
                    children: Cn,
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-actions",
                  children: [
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "outline-button",
                      onClick: () => {
                        ($a(null), Ia(!1));
                      },
                      children: "Cancelar",
                    }),
                    !Fa &&
                      Oa &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "outline-button",
                        disabled: "saving" === fn,
                        onClick: () => {
                          cl();
                        },
                        children: "Redefinir senha",
                      }),
                    Fa
                      ? (0, _.jsx)("button", {
                          className: "primary-button",
                          disabled: "saving" === fn || !Oa,
                          children: "Redefinir senha",
                        })
                      : (0, _.jsx)("button", {
                          className: "primary-button",
                          disabled: "saving" === fn,
                          children: "Salvar acesso",
                        }),
                  ],
                }),
              ],
            }),
          }),
        Lr &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => "saving" !== fn && xi(null)),
            children: (0, _.jsxs)("section", {
              className: "import-modal campaign-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "queue-manage-title",
              children: [
                (0, _.jsx)("button", {
                  className: "modal-close",
                  onClick: () => xi(null),
                  "aria-label": "Fechar",
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "queue", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "queue-manage-title",
                  children:
                    "published" === Lr.status
                      ? Lr.captionOverride
                        ? "Recuperar legenda"
                        : "Publicação concluída"
                      : "Editar publicação",
                }),
                (0, _.jsxs)("p", {
                  children: [Lr.campaignName, " · @", Lr.username],
                }),
                (0, _.jsxs)("div", {
                  className: "campaign-manage-summary",
                  children: [
                    (0, _.jsx)("span", {
                      className: `queue-status ${Lr.status}`,
                      children: T(Lr.status),
                    }),
                    (0, _.jsx)("strong", {
                      children: Lr.lastError || "Sem falhas registradas",
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "form-grid",
                  children: [
                    !["published", "cancelled"].includes(Lr.status) &&
                      (0, _.jsxs)("label", {
                        className: "full-field",
                        children: [
                          (0, _.jsx)("span", { children: "Novo horário" }),
                          (0, _.jsx)("input", {
                            type: "datetime-local",
                            min: pe(1),
                            value: _i,
                            onChange: (e) => ji(e.target.value),
                          }),
                        ],
                      }),
                    Lr.captionOverride &&
                      (0, _.jsxs)("label", {
                        className: "full-field",
                        children: [
                          (0, _.jsx)("span", { children: "Legenda preparada" }),
                          (0, _.jsx)("textarea", {
                            rows: 4,
                            value: Lr.captionOverride,
                            readOnly: !0,
                          }),
                        ],
                      }),
                  ],
                }),
                "published" === Lr.status &&
                  Lr.captionOverride &&
                  (0, _.jsxs)("div", {
                    className: "modal-note warning-note",
                    children: [
                      (0, _.jsx)(y, { name: "shield" }),
                      (0, _.jsxs)("span", {
                        children: [
                          (0, _.jsx)("strong", {
                            children: "Correção manual em um clique",
                          }),
                          (0, _.jsx)("small", {
                            children:
                              "A resolv. copia a legenda e abre o post publicado. No Instagram, cole o texto na edição da publicação.",
                          }),
                        ],
                      }),
                    ],
                  }),
                Cn &&
                  (0, _.jsx)("div", {
                    className: `import-result ${fn}`,
                    children: Cn,
                  }),
                (0, _.jsxs)("div", {
                  className: "campaign-control-actions",
                  children: [
                    ["blocked", "failed"].includes(Lr.status) &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "outline-button",
                        onClick: () => {
                          rl("retry");
                        },
                        children: "Tentar novamente",
                      }),
                    !["published", "cancelled"].includes(Lr.status) &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "text-button danger-action",
                        onClick: () => {
                          rl("cancel");
                        },
                        children: "Cancelar publicação",
                      }),
                    (0, _.jsx)("span", {}),
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "outline-button",
                      onClick: () => xi(null),
                      children: "Fechar",
                    }),
                    "published" === Lr.status &&
                    (Lr.captionOverride || Lr.publishedPermalink)
                      ? (0, _.jsx)("button", {
                          type: "button",
                          className: "primary-button",
                          onClick: () => {
                            ll(Lr);
                          },
                          children: Lr.captionOverride
                            ? "Copiar legenda e abrir post"
                            : "Abrir post",
                        })
                      : ["published", "cancelled"].includes(Lr.status)
                        ? null
                        : (0, _.jsx)("button", {
                            type: "button",
                            className: "primary-button",
                            onClick: () => {
                              rl("reschedule");
                            },
                            children: "Reagendar",
                          }),
                  ],
                }),
              ],
            }),
          }),
        Vs &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => "saving" !== fn && Gs(!1)),
            children: (0, _.jsxs)("form", {
              className: "import-modal campaign-modal campaign-composer",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "campaign-title",
              onSubmit: async (e) => {
                e.preventDefault();
                let a = "draft" !== e.nativeEvent.submitter?.value && !I;
                if (!Rn.length)
                  return (
                    yn("error"),
                    void Sn("Selecione pelo menos um arquivo para continuar.")
                  );
                if (Bn && "REELS" === kn.mediaType && !Nr)
                  return (
                    yn("error"),
                    void Sn(
                      "Preencha a copy de todos os vídeos antes de gerar a campanha.",
                    )
                  );
                if (it && "REELS" === kn.mediaType && !lt)
                  return (
                    yn("error"),
                    void Sn(
                      "Selecione uma música MP3, M4A ou WAV antes de continuar.",
                    )
                  );
                if (a && !hr.length)
                  return (
                    yn("error"),
                    void Sn(
                      "Selecione pelo menos uma conta pronta para este tipo de publicação.",
                    )
                  );
                (yn("saving"), Sn(""), Un({ completed: 0, total: 0 }));
                let s = Rn,
                  n = [],
                  t = [],
                  i = null;
                try {
                  if (
                    !I &&
                    "REELS" === kn.mediaType &&
                    (wr > 0 || Bn || (it && lt))
                  ) {
                    let e = new AbortController();
                    Nt.current = e;
                    let a = [];
                    for (let s = 0; s < Rn.length; s += 1) {
                      let n = Rn[s];
                      yt({
                        current: s + 1,
                        total: Rn.length,
                        progress: 0,
                        fileName: n.name,
                      });
                      let t = n.type.startsWith("image/"),
                        i = it && !!lt,
                        r = Number(t) + Number(Bn) + Number(i),
                        l = 0,
                        o = (e) =>
                          yt({
                            current: s + 1,
                            total: Rn.length,
                            progress: (l + e) / Math.max(1, r),
                            fileName: n.name,
                          }),
                        c = n;
                      (t &&
                        ((c = await m(
                          n,
                          { durationSeconds: Gn, motion: Hn },
                          o,
                          e.signal,
                        )),
                        (l += 1)),
                        Bn &&
                          ((c = await te(
                            c,
                            { copy: at[g(n)] || Yn, cta: Qn, template: Wn },
                            o,
                            e.signal,
                          )),
                          (l += 1)),
                        i &&
                          lt &&
                          ((c = await h(
                            c,
                            {
                              musicFile: lt,
                              musicVolume: ct,
                              originalVolume: mt,
                              startSeconds: pt,
                              fadeSeconds: xt,
                              loop: jt,
                            },
                            o,
                            e.signal,
                          )),
                          (l += 1)),
                        a.push(c));
                    }
                    ((Nt.current = null), (s = a));
                  }
                  ((n = Array(s.length)),
                    Un({ completed: 0, total: s.length }));
                  let e = 0,
                    r = 0;
                  if (
                    (I ||
                      (await Promise.all(
                        Array.from(
                          { length: Math.min(3, s.length) },
                          async () => {
                            for (; e < s.length; ) {
                              let a = e,
                                t = s[a];
                              e += 1;
                              let l = await uploadCampaignMedia(t);
                              ((n[a] = l.id),
                                (r += 1),
                                Un({ completed: r, total: s.length }));
                            }
                          },
                        ),
                      )),
                    !I && "REELS" === kn.mediaType && In.length)
                  )
                    for (let e of In.slice(0, 24)) {
                      let s = await uploadCampaignMedia(e);
                      t.push(s.id);
                    }
                  let l = await w("/api/campaigns", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        ...kn,
                        templateId: I || void 0,
                        captionVariations: An,
                        mediaCaptions: Object.fromEntries(
                          Rn.map((e, a) => [
                            n[a] || e.templateMediaId,
                            Pn[g(e)] ?? e.templateCaption ?? "",
                          ]).filter(([e]) => e),
                        ),
                        mediaIds: n,
                        coverMediaIds: t,
                        coverMediaId: t[0] || null,
                        mediaOrder: xn,
                        distributionMode: pn,
                        repeatCount: mn,
                        intervalMinutes: tn,
                        respectDailyLimit: jn,
                      }),
                    }),
                    o = await l.json();
                  if (!l.ok || !o.campaign)
                    throw Error(o.error || "Falha ao criar a campanha.");
                  if (((i = o.campaign), a)) {
                    let e = await w(
                        `/api/campaigns/${o.campaign.id}/schedule`,
                        {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            accountIds: hr.map((e) => e.id),
                            startAt: new Date(en).toISOString(),
                            stopAt: sn ? new Date(sn).toISOString() : null,
                            intervalMinutes: tn,
                            intervalMode: ln,
                            accountIntervals: cn,
                            repeatCount: mn,
                            distributionMode: pn,
                            mediaOrder: xn,
                            respectDailyLimit: jn,
                          }),
                        },
                      ),
                      a = await e.json();
                    if (!e.ok)
                      throw Error(
                        a.error ||
                          "A campanha foi salva, mas não foi possível agendar.",
                      );
                    (yn("success"),
                      Sn(
                        `Campanha criada e agendada: ${a.queued ?? 0} publicações na fila; ${a.blocked ?? 0} bloqueadas.${a.windowLimited ? " A janela final limitou o volume." : ""}`,
                      ));
                  } else
                    (yn("success"),
                      Sn(
                        `Campanha salva como rascunho com ${o.campaign.mediaCount} arquivo(s). Você pode agendá-la quando quiser.`,
                      ));
                  (Gs(!1),
                    En({
                      name: "",
                      mediaType: "IMAGE",
                      metaApiVersion: "",
                      caption: "",
                      hashtags: "",
                      shareToFeed: !1,
                    }),
                    Fn([]),
                    zn([]),
                    Vn(!1),
                    Jn(7),
                    Kn("static"),
                    Zn(""),
                    st({}),
                    Yr(),
                    Mn([]),
                    qn({}),
                    yt({ current: 0, total: 0, progress: 0, fileName: "" }),
                    Un({ completed: 0, total: 0 }),
                    await Promise.all([Fr(), Ir(), Rr()]));
                } catch (e) {
                  ((Nt.current = null),
                    i
                      ? (Gs(!1),
                        Qs(i.id),
                        En({
                          name: "",
                          mediaType: "IMAGE",
                          metaApiVersion: "",
                          caption: "",
                          hashtags: "",
                          shareToFeed: !1,
                        }),
                        Fn([]),
                        zn([]),
                        Vn(!1),
                        Zn(""),
                        st({}),
                        Yr(),
                        Mn([]),
                        qn({}),
                        yt({ current: 0, total: 0, progress: 0, fileName: "" }),
                        Un({ completed: 0, total: 0 }),
                        await Fr())
                      : await Promise.allSettled(
                          [...n.filter(Boolean), ...t].map((e) =>
                            w(`/api/media/${e}`, { method: "DELETE" }),
                          ),
                        ),
                    yn(
                      e instanceof DOMException && "AbortError" === e.name
                        ? "idle"
                        : "error",
                    ),
                    Sn(
                      e instanceof DOMException && "AbortError" === e.name
                        ? "Geração interrompida. Nenhuma campanha foi criada."
                        : e instanceof Error
                          ? e.message
                          : "Não foi possível criar a campanha.",
                    ));
                }
              },
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => Gs(!1),
                  "aria-label": "Fechar",
                  disabled: "saving" === fn,
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "campaign", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "campaign-title",
                  children: "Nova campanha completa",
                }),
                (0, _.jsx)("p", {
                  children:
                    "Configure o conteúdo, escolha as contas e defina os horários. Você também pode salvar apenas como rascunho.",
                }),
                (0, _.jsxs)("section", {
                  className: "composer-section",
                  children: [
                    (0, _.jsxs)("div", {
                      className: "composer-heading",
                      children: [
                        (0, _.jsx)("b", { children: "01" }),
                        (0, _.jsxs)("span", {
                          children: [
                            (0, _.jsx)("strong", {
                              children: "Conteúdo da campanha",
                            }),
                            (0, _.jsx)("small", {
                              children:
                                "Envie até 50 arquivos. A legenda é opcional nesta versão.",
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("div", {
                      className: "form-grid",
                      children: [
                        (0, _.jsxs)("label", {
                          className: "full-field",
                          children: [
                            (0, _.jsx)("span", { children: "Template" }),
                            (0, _.jsxs)("select", {
                              value: I,
                              onChange: (e) => {
                                (async (e) => {
                                  if ((z(e), e)) {
                                    (yn("saving"), Sn(""));
                                    try {
                                      let a = await w(`/api/campaigns/${e}`),
                                        s = await a.json();
                                      if (!a.ok || !s.campaign)
                                        throw Error(
                                          s.error ||
                                            "Não foi possível abrir o template.",
                                        );
                                      let n = s.campaign,
                                        t = (s.media || [])
                                          .filter(
                                            (e) => "content" === e.purpose,
                                          )
                                          .map((e) => ({
                                            name: e.fileName,
                                            type: e.contentType,
                                            size: e.sizeBytes,
                                            lastModified: 0,
                                            templateMediaId: e.id,
                                            templateUrl: e.publicUrl,
                                            templateCaption: e.caption || "",
                                          }));
                                      (En({
                                        name: `${n.name} · nova`.slice(0, 120),
                                        mediaType: n.mediaType,
                                        metaApiVersion: n.metaApiVersion || "",
                                        caption: n.caption || "",
                                        hashtags: n.hashtags || "",
                                        shareToFeed: !!n.shareToFeed,
                                      }),
                                        Fn(t),
                                        zn([]),
                                        Mn(Be(n.captionVariations)),
                                        qn(
                                          Object.fromEntries(
                                            t.map((e) => [
                                              g(e),
                                              e.templateCaption,
                                            ]),
                                          ),
                                        ),
                                        rn(n.intervalMinutes || 60),
                                        un(n.repeatCount || 1),
                                        hn(
                                          n.distributionMode || "all_accounts",
                                        ),
                                        _n(n.mediaOrder || "sequential"),
                                        gn(!1 !== n.respectDailyLimit),
                                        on("per_account_shared"),
                                        bn([]),
                                        an(pe()),
                                        nn(""),
                                        Vn(!1),
                                        Zn(""),
                                        st({}),
                                        Yr(),
                                        yn("idle"));
                                    } catch (e) {
                                      (z(""),
                                        yn("error"),
                                        Sn(
                                          e instanceof Error
                                            ? e.message
                                            : "Não foi possível aplicar o template.",
                                        ));
                                    }
                                  } else Zr();
                                })(e.target.value);
                              },
                              children: [
                                (0, _.jsx)("option", {
                                  value: "",
                                  children: "Sem template",
                                }),
                                R.map((e) =>
                                  (0, _.jsx)(
                                    "option",
                                    { value: e.id, children: e.name },
                                    e.id,
                                  ),
                                ),
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", {
                              children: "Nome da campanha",
                            }),
                            (0, _.jsx)("input", {
                              required: !0,
                              maxLength: 120,
                              value: kn.name,
                              onChange: (e) =>
                                En({ ...kn, name: e.target.value }),
                              placeholder: "Ex.: Campanha manhã · fitness",
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", {
                              children: "Tipo de postagem",
                            }),
                            (0, _.jsxs)("select", {
                              value: kn.mediaType,
                              disabled: !!I,
                              onChange: (e) => {
                                (En({
                                  ...kn,
                                  mediaType: e.target.value,
                                  metaApiVersion: "",
                                  shareToFeed: !1,
                                }),
                                  Fn([]),
                                  zn([]),
                                  Vn(!1),
                                  Jn(7),
                                  Kn("static"),
                                  Zn(""),
                                  st({}),
                                  Yr(),
                                  Sn(""));
                              },
                              children: [
                                (0, _.jsx)("option", {
                                  value: "IMAGE",
                                  children: "Post normal · imagem",
                                }),
                                (0, _.jsx)("option", {
                                  value: "REELS",
                                  children: "Reel",
                                }),
                                (0, _.jsx)("option", {
                                  value: "STORIES",
                                  children: "Story",
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          className:
                            "media-upload-zone full-field " +
                            (Rn.length ? "has-files" : ""),
                          onDragOver: (e) => e.preventDefault(),
                          onDrop: (e) => {
                            (e.preventDefault(),
                              Xr(Array.from(e.dataTransfer.files)));
                          },
                          children: [
                            (0, _.jsx)("input", {
                              type: "file",
                              multiple: !0,
                              accept:
                                "IMAGE" === kn.mediaType
                                  ? "image/jpeg,image/png"
                                  : "image/jpeg,image/png,video/mp4,video/quicktime",
                              onChange: (e) =>
                                Xr(Array.from(e.target.files || [])),
                            }),
                            (0, _.jsx)(y, {
                              name: Rn.length ? "check" : "upload",
                              size: 26,
                            }),
                            (0, _.jsx)("strong", {
                              children: Rn.length
                                ? `${Rn.length} arquivo(s) selecionado(s)`
                                : "Solte ou selecione os arquivos",
                            }),
                            (0, _.jsx)("small", {
                              children: Rn.length
                                ? `${Rn.slice(0, 3)
                                    .map((e) => e.name)
                                    .join(
                                      " · ",
                                    )}${Rn.length > 3 ? " · +" + (Rn.length - 3) : ""}`
                                : "REELS" === kn.mediaType
                                  ? "MP4, MOV, JPG ou PNG · imagens viram Reels automaticamente"
                                  : "JPG, PNG, MP4 ou MOV · máximo 100 MB por arquivo",
                            }),
                          ],
                        }),
                        "REELS" === kn.mediaType &&
                          wr > 0 &&
                          (0, _.jsxs)("section", {
                            className: "image-reel-converter full-field",
                            children: [
                              (0, _.jsxs)("div", {
                                className: "image-reel-head",
                                children: [
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)(y, {
                                        name: "spark",
                                        size: 18,
                                      }),
                                      (0, _.jsxs)("span", {
                                        children: [
                                          (0, _.jsx)("strong", {
                                            children: "Imagem → Reel",
                                          }),
                                          (0, _.jsxs)("small", {
                                            children: [
                                              wr,
                                              " imagem(ns) serão transformadas em MP4 vertical com movimento suave.",
                                            ],
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsx)("b", { children: "Automático" }),
                                ],
                              }),
                              (0, _.jsxs)("div", {
                                className: "image-reel-controls",
                                children: [
                                  (0, _.jsxs)("label", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        children: "Duração de cada imagem",
                                      }),
                                      (0, _.jsxs)("select", {
                                        value: Gn,
                                        onChange: (e) =>
                                          Jn(Number(e.target.value)),
                                        children: [
                                          (0, _.jsx)("option", {
                                            value: 5,
                                            children: "5 segundos",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: 7,
                                            children: "7 segundos",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: 10,
                                            children: "10 segundos",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: 15,
                                            children: "15 segundos",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("label", {
                                    children: [
                                      (0, _.jsx)("span", {
                                        children: "Movimento",
                                      }),
                                      (0, _.jsxs)("select", {
                                        value: Hn,
                                        onChange: (e) => Kn(e.target.value),
                                        children: [
                                          (0, _.jsx)("option", {
                                            value: "static",
                                            children:
                                              "Estática · imagem inteira",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "zoom_in",
                                            children: "Aproximação suave",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "zoom_out",
                                            children: "Afastamento suave",
                                          }),
                                          (0, _.jsx)("option", {
                                            value: "drift",
                                            children: "Deslize lateral",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsx)("div", {
                                    className: `image-reel-preview ${Hn}`,
                                    children:
                                      nt &&
                                      Cr &&
                                      (0, _.jsx)("img", {
                                        src: nt,
                                        alt: "Prévia da imagem transformada em Reel",
                                      }),
                                  }),
                                ],
                              }),
                              (0, _.jsxs)("div", {
                                className: "video-generator-note",
                                children: [
                                  (0, _.jsx)(y, { name: "shield", size: 16 }),
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)("strong", {
                                        children:
                                          "Geração local e sem alterar a arte",
                                      }),
                                      (0, _.jsx)("small", {
                                        children:
                                          "A resolv. cria uma cópia em vídeo 9:16. A imagem original continua intacta.",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        "REELS" === kn.mediaType &&
                          Rn.length > 0 &&
                          (0, _.jsxs)("section", {
                            className:
                              "video-generator full-field " +
                              (Bn ? "enabled" : ""),
                            children: [
                              (0, _.jsxs)("div", {
                                className: "video-generator-head",
                                children: [
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)(y, {
                                        name: "spark",
                                        size: 18,
                                      }),
                                      (0, _.jsxs)("span", {
                                        children: [
                                          (0, _.jsx)("strong", {
                                            children:
                                              "Copy incorporada ao vídeo",
                                          }),
                                          (0, _.jsx)("small", {
                                            children:
                                              "A mensagem é renderizada dentro do MP4 e não depende da legenda da Meta.",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("label", {
                                    className: "switch-control",
                                    children: [
                                      (0, _.jsx)("input", {
                                        type: "checkbox",
                                        checked: Bn,
                                        onChange: (e) => Vn(e.target.checked),
                                      }),
                                      (0, _.jsx)("i", {}),
                                      (0, _.jsx)("b", {
                                        children: Bn ? "Ativado" : "Desativado",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              Bn &&
                                (0, _.jsxs)(_.Fragment, {
                                  children: [
                                    (0, _.jsxs)("div", {
                                      className: "video-template-picker",
                                      children: [
                                        (0, _.jsxs)("button", {
                                          type: "button",
                                          className:
                                            "headline" === Wn ? "active" : "",
                                          onClick: () => Xn("headline"),
                                          children: [
                                            (0, _.jsx)("b", {
                                              children: "Manchete",
                                            }),
                                            (0, _.jsx)("small", {
                                              children: "Caixa escura no topo",
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("button", {
                                          type: "button",
                                          className:
                                            "news" === Wn ? "active" : "",
                                          onClick: () => Xn("news"),
                                          children: [
                                            (0, _.jsx)("b", {
                                              children: "Notícia",
                                            }),
                                            (0, _.jsx)("small", {
                                              children: "Card branco na base",
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("button", {
                                          type: "button",
                                          className:
                                            "clean" === Wn ? "active" : "",
                                          onClick: () => Xn("clean"),
                                          children: [
                                            (0, _.jsx)("b", {
                                              children: "Clean",
                                            }),
                                            (0, _.jsx)("small", {
                                              children:
                                                "Texto central com sombra",
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "video-generator-grid",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "video-copy-fields",
                                          children: [
                                            (0, _.jsxs)("label", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  children:
                                                    "Copy padrão dos vídeos",
                                                }),
                                                (0, _.jsx)("textarea", {
                                                  rows: 4,
                                                  maxLength: 220,
                                                  value: Yn,
                                                  onChange: (e) =>
                                                    Zn(e.target.value),
                                                  placeholder:
                                                    "Ex.: Ela não esperava que isso fosse acontecer…",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("div", {
                                              className: "video-copy-actions",
                                              children: [
                                                (0, _.jsxs)("button", {
                                                  type: "button",
                                                  className:
                                                    "outline-button compact-button",
                                                  disabled: !Yn.trim(),
                                                  onClick: () =>
                                                    st(
                                                      Object.fromEntries(
                                                        Rn.map((e) => [
                                                          g(e),
                                                          Yn,
                                                        ]),
                                                      ),
                                                    ),
                                                  children: [
                                                    "Aplicar aos ",
                                                    Rn.length,
                                                    " vídeos",
                                                  ],
                                                }),
                                                (0, _.jsx)("button", {
                                                  type: "button",
                                                  className: "text-button",
                                                  disabled: !Yn.trim(),
                                                  onClick: () =>
                                                    En({ ...kn, caption: Yn }),
                                                  children:
                                                    "Usar também como legenda",
                                                }),
                                              ],
                                            }),
                                            (0, _.jsxs)("label", {
                                              children: [
                                                (0, _.jsx)("span", {
                                                  children:
                                                    "Chamada inferior · opcional",
                                                }),
                                                (0, _.jsx)("input", {
                                                  maxLength: 70,
                                                  value: Qn,
                                                  onChange: (e) =>
                                                    et(e.target.value),
                                                  placeholder:
                                                    "Veja mais no perfil",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: `video-template-preview ${Wn}`,
                                          children: [
                                            nt &&
                                              (Cr
                                                ? (0, _.jsx)("img", {
                                                    src: nt,
                                                    alt: "Prévia do Reel",
                                                  })
                                                : (0, _.jsx)("video", {
                                                    src: nt,
                                                    muted: !0,
                                                    playsInline: !0,
                                                    preload: "metadata",
                                                  })),
                                            (0, _.jsxs)("span", {
                                              className: "preview-copy",
                                              children: [
                                                (0, _.jsx)("i", {
                                                  children:
                                                    "news" === Wn
                                                      ? "AGORA"
                                                      : "DESTAQUE",
                                                }),
                                                (0, _.jsx)("b", {
                                                  children:
                                                    yr ||
                                                    "Sua copy aparecerá aqui",
                                                }),
                                              ],
                                            }),
                                            Qn &&
                                              (0, _.jsx)("em", {
                                                children: Qn,
                                              }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("details", {
                                      className: "video-copy-list",
                                      children: [
                                        (0, _.jsxs)("summary", {
                                          children: [
                                            "Editar uma copy diferente para cada vídeo ",
                                            (0, _.jsxs)("b", {
                                              children: [
                                                Rn.filter((e) =>
                                                  (at[g(e)] || Yn).trim(),
                                                ).length,
                                                "/",
                                                Rn.length,
                                                " prontas",
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsx)("div", {
                                          children: Rn.map((e, a) =>
                                            (0, _.jsxs)(
                                              "div",
                                              {
                                                className: "video-copy-row",
                                                children: [
                                                  (0, _.jsxs)("span", {
                                                    children: [
                                                      (0, _.jsx)("b", {
                                                        children: String(
                                                          a + 1,
                                                        ).padStart(2, "0"),
                                                      }),
                                                      (0, _.jsx)("small", {
                                                        children: e.name,
                                                      }),
                                                    ],
                                                  }),
                                                  (0, _.jsx)("textarea", {
                                                    "aria-label": `Copy do vídeo ${e.name}`,
                                                    rows: 2,
                                                    maxLength: 220,
                                                    value: at[g(e)] || Yn,
                                                    onChange: (a) =>
                                                      st({
                                                        ...at,
                                                        [g(e)]: a.target.value,
                                                      }),
                                                    placeholder:
                                                      "Copy deste vídeo",
                                                  }),
                                                ],
                                              },
                                              g(e),
                                            ),
                                          ),
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "video-generator-note",
                                      children: [
                                        (0, _.jsx)(y, {
                                          name: "shield",
                                          size: 16,
                                        }),
                                        (0, _.jsxs)("span", {
                                          children: [
                                            (0, _.jsx)("strong", {
                                              children:
                                                "Processamento local e seguro",
                                            }),
                                            (0, _.jsx)("small", {
                                              children:
                                                "Os vídeos são gerados um de cada vez no seu navegador. Mantenha esta aba aberta; o áudio original será preservado.",
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                            ],
                          }),
                        "REELS" === kn.mediaType &&
                          Rn.length > 0 &&
                          (0, _.jsxs)("section", {
                            className:
                              "video-generator music-generator full-field " +
                              (it ? "enabled" : ""),
                            children: [
                              (0, _.jsxs)("div", {
                                className: "video-generator-head",
                                children: [
                                  (0, _.jsxs)("span", {
                                    children: [
                                      (0, _.jsx)(y, {
                                        name: "spark",
                                        size: 18,
                                      }),
                                      (0, _.jsxs)("span", {
                                        children: [
                                          (0, _.jsx)("strong", {
                                            children:
                                              "Trilha sonora incorporada",
                                          }),
                                          (0, _.jsx)("small", {
                                            children:
                                              "A música entra no MP4 e funciona também com Instagram direto.",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsxs)("label", {
                                    className: "switch-control",
                                    children: [
                                      (0, _.jsx)("input", {
                                        type: "checkbox",
                                        checked: it,
                                        onChange: (e) => rt(e.target.checked),
                                      }),
                                      (0, _.jsx)("i", {}),
                                      (0, _.jsx)("b", {
                                        children: it ? "Ativada" : "Desativada",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              it &&
                                (0, _.jsxs)(_.Fragment, {
                                  children: [
                                    (0, _.jsxs)("div", {
                                      className: "music-upload-row",
                                      children: [
                                        (0, _.jsxs)("label", {
                                          className:
                                            "music-file-picker " +
                                            (lt ? "has-file" : ""),
                                          children: [
                                            (0, _.jsx)("input", {
                                              type: "file",
                                              accept:
                                                ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav",
                                              onChange: (e) => {
                                                let a =
                                                  e.target.files?.[0] ?? null;
                                                if (a && a.size > 31457280)
                                                  return (
                                                    yn("error"),
                                                    Sn(
                                                      "A música precisa ter no máximo 30 MB.",
                                                    ),
                                                    void (e.target.value = "")
                                                  );
                                                (ot(a), Sn(""));
                                              },
                                            }),
                                            (0, _.jsx)(y, {
                                              name: lt ? "check" : "upload",
                                              size: 18,
                                            }),
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("strong", {
                                                  children: lt
                                                    ? lt.name
                                                    : "Escolher música",
                                                }),
                                                (0, _.jsx)("small", {
                                                  children:
                                                    "MP3, M4A ou WAV · até 30 MB",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        vt &&
                                          (0, _.jsx)("audio", {
                                            className: "music-preview",
                                            src: vt,
                                            controls: !0,
                                            preload: "metadata",
                                            children: (0, _.jsx)("track", {
                                              kind: "captions",
                                              src: "data:text/vtt,WEBVTT",
                                              srcLang: "pt-BR",
                                              label: "Música sem fala",
                                              default: !0,
                                            }),
                                          }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "music-controls-grid",
                                      children: [
                                        (0, _.jsxs)("div", {
                                          className: "music-range",
                                          children: [
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("b", {
                                                  children: "Volume da música",
                                                }),
                                                (0, _.jsxs)("em", {
                                                  children: [ct, "%"],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("input", {
                                              "aria-label": "Volume da música",
                                              type: "range",
                                              min: 0,
                                              max: 100,
                                              step: 5,
                                              value: ct,
                                              onChange: (e) =>
                                                dt(Number(e.target.value)),
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("div", {
                                          className: "music-range",
                                          children: [
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("b", {
                                                  children: "Áudio original",
                                                }),
                                                (0, _.jsxs)("em", {
                                                  children: [mt, "%"],
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("input", {
                                              "aria-label":
                                                "Volume do áudio original",
                                              type: "range",
                                              min: 0,
                                              max: 100,
                                              step: 5,
                                              value: mt,
                                              onChange: (e) =>
                                                ut(Number(e.target.value)),
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("label", {
                                          children: [
                                            (0, _.jsx)("span", {
                                              children: "Começar a música em",
                                            }),
                                            (0, _.jsxs)("div", {
                                              className: "number-suffix",
                                              children: [
                                                (0, _.jsx)("input", {
                                                  type: "number",
                                                  min: 0,
                                                  max: 3600,
                                                  step: 1,
                                                  value: pt,
                                                  onChange: (e) =>
                                                    ht(
                                                      Math.max(
                                                        0,
                                                        Number(
                                                          e.target.value,
                                                        ) || 0,
                                                      ),
                                                    ),
                                                }),
                                                (0, _.jsx)("em", {
                                                  children: "seg",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                        (0, _.jsxs)("label", {
                                          children: [
                                            (0, _.jsx)("span", {
                                              children:
                                                "Fade de entrada e saída",
                                            }),
                                            (0, _.jsxs)("select", {
                                              value: xt,
                                              onChange: (e) =>
                                                _t(Number(e.target.value)),
                                              children: [
                                                (0, _.jsx)("option", {
                                                  value: 0,
                                                  children: "Sem fade",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: 1,
                                                  children: "1 segundo",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: 2,
                                                  children: "2 segundos",
                                                }),
                                                (0, _.jsx)("option", {
                                                  value: 3,
                                                  children: "3 segundos",
                                                }),
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "music-options-row",
                                      children: [
                                        (0, _.jsxs)("label", {
                                          children: [
                                            (0, _.jsx)("input", {
                                              type: "checkbox",
                                              checked: jt,
                                              onChange: (e) =>
                                                gt(e.target.checked),
                                            }),
                                            (0, _.jsx)("span", {
                                              children:
                                                "Repetir a música se o vídeo for mais longo",
                                            }),
                                          ],
                                        }),
                                        (0, _.jsx)("small", {
                                          children:
                                            "Para vídeos com fala, teste música entre 20–35%. Em imagens, 60–80% costuma funcionar melhor.",
                                        }),
                                      ],
                                    }),
                                    (0, _.jsxs)("div", {
                                      className: "video-generator-note",
                                      children: [
                                        (0, _.jsx)(y, {
                                          name: "shield",
                                          size: 16,
                                        }),
                                        (0, _.jsxs)("span", {
                                          children: [
                                            (0, _.jsx)("strong", {
                                              children:
                                                "Use somente músicas licenciadas",
                                            }),
                                            (0, _.jsx)("small", {
                                              children:
                                                "A faixa será publicada como áudio original do Reel; ela não ficará vinculada a uma música em alta do catálogo do Instagram.",
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                            ],
                          }),
                        "REELS" === kn.mediaType &&
                          (0, _.jsxs)(_.Fragment, {
                            children: [
                              (0, _.jsxs)("label", {
                                className:
                                  "cover-upload " +
                                  (In.length ? "has-files" : ""),
                                children: [
                                  (0, _.jsx)("span", {
                                    children: "Capas dos Reels · várias opções",
                                  }),
                                  (0, _.jsx)("input", {
                                    type: "file",
                                    accept: "image/jpeg,image/png",
                                    multiple: !0,
                                    onChange: (e) => {
                                      let a = [...(e.target.files || [])];
                                      if (
                                        ((e.target.value = ""),
                                        a.some((e) => e.size > 10485760))
                                      )
                                        return (
                                          yn("error"),
                                          void Sn(
                                            "Cada capa precisa ter no máximo 10 MB.",
                                          )
                                        );
                                      zn((e) => [...e, ...a].slice(0, 24));
                                    },
                                  }),
                                  (0, _.jsx)("small", {
                                    children: In.length
                                      ? `${In.length} capa(s) · cada vídeo usa uma capa diferente da lista`
                                      : "JPG ou PNG · adicione várias imagens; elas vão rotacionar entre os vídeos",
                                  }),
                                ],
                              }),
                              In.length > 0 &&
                                (0, _.jsx)("div", {
                                  className: "cover-variation-list",
                                  children: In.map((e, a) =>
                                    (0, _.jsxs)(
                                      "article",
                                      {
                                        children: [
                                          (0, _.jsx)("img", {
                                            src: URL.createObjectURL(e),
                                            alt: "",
                                          }),
                                          (0, _.jsx)("b", {
                                            children: String(a + 1).padStart(
                                              2,
                                              "0",
                                            ),
                                          }),
                                          (0, _.jsx)("span", {
                                            children: e.name,
                                          }),
                                          (0, _.jsx)("button", {
                                            type: "button",
                                            className:
                                              "text-button danger-action",
                                            onClick: () =>
                                              zn(In.filter((e, s) => s !== a)),
                                            children: "Remover",
                                          }),
                                        ],
                                      },
                                      `${e.name}-${e.lastModified}-${a}`,
                                    ),
                                  ),
                                }),
                              (0, _.jsxs)("label", {
                                children: [
                                  (0, _.jsx)("span", {
                                    children: "Grade principal",
                                  }),
                                  (0, _.jsxs)("select", {
                                    value: kn.shareToFeed ? "feed" : "reels",
                                    onChange: (e) =>
                                      En({
                                        ...kn,
                                        shareToFeed: "feed" === e.target.value,
                                      }),
                                    children: [
                                      (0, _.jsx)("option", {
                                        value: "reels",
                                        children: "Só aba Reels",
                                      }),
                                      (0, _.jsx)("option", {
                                        value: "feed",
                                        children: "Reels + grade principal",
                                      }),
                                    ],
                                  }),
                                  (0, _.jsx)("small", {
                                    className: "field-help",
                                    children:
                                      "O áudio original é preservado; a trilha opcional é incorporada antes do envio.",
                                  }),
                                ],
                              }),
                            ],
                          }),
                        (0, _.jsxs)("label", {
                          className: "full-field",
                          children: [
                            (0, _.jsx)("span", {
                              children: "Legenda · opcional",
                            }),
                            (0, _.jsx)("textarea", {
                              rows: 5,
                              maxLength: 1e4,
                              value: kn.caption,
                              onChange: (e) =>
                                En({ ...kn, caption: e.target.value }),
                            }),
                            (0, _.jsx)("small", {
                              className: "field-help",
                              children:
                                "A Meta recebe uma legenda por publicação. Use variações para não repetir o mesmo texto em todos os vídeos e contas. Nenhum comentário automático é enviado.",
                            }),
                          ],
                        }),
                        (0, _.jsxs)("div", {
                          className: "caption-studio full-field",
                          children: [
                            (0, _.jsxs)("div", {
                              className: "caption-tools",
                              children: [
                                (0, _.jsxs)("label", {
                                  className: "caption-count",
                                  children: [
                                    (0, _.jsx)("span", {
                                      children: "Quantidade",
                                    }),
                                    (0, _.jsx)("input", {
                                      type: "number",
                                      min: 2,
                                      max: 20,
                                      value: $n,
                                      onChange: (e) =>
                                        Tn(
                                          Math.min(
                                            20,
                                            Math.max(
                                              2,
                                              Number(e.target.value) || 6,
                                            ),
                                          ),
                                        ),
                                    }),
                                  ],
                                }),
                                (0, _.jsx)("button", {
                                  type: "button",
                                  className: "auto-caption-button",
                                  disabled:
                                    Ln || "saving" === fn || !kn.caption.trim(),
                                  onClick: () => {
                                    nl(kn.caption, $n, (e) => Mn(e));
                                  },
                                  children: Ln
                                    ? "Gerando..."
                                    : `Gerar ${$n} variações com IA`,
                                }),
                                (0, _.jsx)("button", {
                                  type: "button",
                                  className: "caption-tools-ghost",
                                  onClick: () =>
                                    Mn((e) =>
                                      e.length >= 20
                                        ? e
                                        : [...e, kn.caption || ""],
                                    ),
                                  children: "Adicionar manualmente",
                                }),
                                An.length > 0 &&
                                  (0, _.jsx)("button", {
                                    type: "button",
                                    className: "caption-tools-ghost",
                                    onClick: () => Mn([]),
                                    children: "Limpar lista",
                                  }),
                                Rn.length > 0 &&
                                  An.length > 0 &&
                                  (0, _.jsx)("button", {
                                    type: "button",
                                    className: "caption-tools-ghost",
                                    onClick: () =>
                                      qn(
                                        Object.fromEntries(
                                          Rn.map((e, a) => [
                                            g(e),
                                            An[a % An.length],
                                          ]),
                                        ),
                                      ),
                                    children:
                                      "Usar uma variação em cada arquivo",
                                  }),
                              ],
                            }),
                            An.length > 0 &&
                              (0, _.jsx)("div", {
                                className: "caption-variation-list",
                                children: An.map((e, a) =>
                                  (0, _.jsxs)(
                                    "article",
                                    {
                                      children: [
                                        (0, _.jsx)("b", {
                                          children: String(a + 1).padStart(
                                            2,
                                            "0",
                                          ),
                                        }),
                                        (0, _.jsx)("textarea", {
                                          rows: 3,
                                          maxLength: 2200,
                                          value: e,
                                          onChange: (e) =>
                                            Mn(
                                              An.map((s, n) =>
                                                n === a ? e.target.value : s,
                                              ),
                                            ),
                                        }),
                                        (0, _.jsx)("button", {
                                          type: "button",
                                          className:
                                            "text-button danger-action",
                                          onClick: () =>
                                            Mn(An.filter((e, s) => s !== a)),
                                          children: "Remover",
                                        }),
                                      ],
                                    },
                                    `variation-${a}`,
                                  ),
                                ),
                              }),
                            Rn.length > 1 &&
                              (0, _.jsxs)("details", {
                                className: "caption-per-file",
                                children: [
                                  (0, _.jsxs)("summary", {
                                    children: [
                                      "Legendas específicas por arquivo ",
                                      (0, _.jsxs)("b", {
                                        children: [
                                          Rn.filter((e) =>
                                            (Pn[g(e)] || "").trim(),
                                          ).length,
                                          "/",
                                          Rn.length,
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, _.jsx)("div", {
                                    children: Rn.map((e, a) =>
                                      (0, _.jsxs)(
                                        "label",
                                        {
                                          children: [
                                            (0, _.jsxs)("span", {
                                              children: [
                                                (0, _.jsx)("b", {
                                                  children: String(
                                                    a + 1,
                                                  ).padStart(2, "0"),
                                                }),
                                                (0, _.jsx)("small", {
                                                  children: e.name,
                                                }),
                                              ],
                                            }),
                                            (0, _.jsx)("textarea", {
                                              rows: 3,
                                              maxLength: 2200,
                                              value: Pn[g(e)] || "",
                                              onChange: (a) =>
                                                qn({
                                                  ...Pn,
                                                  [g(e)]: a.target.value,
                                                }),
                                              placeholder:
                                                "Vazio = usa a rotação das variações",
                                            }),
                                          ],
                                        },
                                        g(e),
                                      ),
                                    ),
                                  }),
                                ],
                              }),
                            An.length > 0 &&
                              (0, _.jsxs)("small", {
                                className: "field-help",
                                children: [
                                  An.length,
                                  " variações aprovadas serão distribuídas entre os ",
                                  fr || Rn.length,
                                  " posts. Remova qualquer texto que não quiser publicar.",
                                ],
                              }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          className: "full-field",
                          children: [
                            (0, _.jsx)("span", { children: "Hashtags" }),
                            (0, _.jsx)("input", {
                              maxLength: 1e3,
                              value: kn.hashtags,
                              onChange: (e) =>
                                En({ ...kn, hashtags: e.target.value }),
                              placeholder: "#reels #conteudo #marca",
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("section", {
                  className: "composer-section",
                  children: [
                    (0, _.jsxs)("div", {
                      className: "composer-heading",
                      children: [
                        (0, _.jsx)("b", { children: "02" }),
                        (0, _.jsxs)("span", {
                          children: [
                            (0, _.jsx)("strong", {
                              children: "Contas da campanha",
                            }),
                            (0, _.jsx)("small", {
                              children:
                                "Selecione todas as contas recuperadas e conectadas, ou só as que quiser nesta campanha.",
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("div", {
                      className: "account-picker",
                      children: [
                        (0, _.jsxs)("div", {
                          className: "account-picker-head",
                          children: [
                            (0, _.jsxs)("strong", {
                              children: [
                                hr.length,
                                " de ",
                                ur.length,
                                " selecionada(s)",
                              ],
                            }),
                            (0, _.jsx)("button", {
                              type: "button",
                              className: "inline-action",
                              onClick: () =>
                                bn(
                                  hr.length === Math.min(ze, ur.length)
                                    ? []
                                    : ur.slice(0, ze).map((e) => e.id),
                                ),
                              children: hr.length
                                ? "Limpar seleção"
                                : "Selecionar todas",
                            }),
                          ],
                        }),
                        ur.length
                          ? Array.from(new Set(ur.map((e) => e.model))).map(
                              (e) => {
                                let a = ur.filter((a) => a.model === e),
                                  s = a.every((e) => vn.includes(e.id));
                                return (0, _.jsxs)(
                                  "div",
                                  {
                                    className: "account-model-group",
                                    children: [
                                      (0, _.jsxs)("label", {
                                        children: [
                                          (0, _.jsx)("input", {
                                            type: "checkbox",
                                            checked: s,
                                            onChange: () =>
                                              bn(
                                                s
                                                  ? vn.filter(
                                                      (e) =>
                                                        !a.some(
                                                          (a) => a.id === e,
                                                        ),
                                                    )
                                                  : [
                                                      ...new Set([
                                                        ...vn,
                                                        ...a.map((e) => e.id),
                                                      ]),
                                                    ].slice(0, ze),
                                              ),
                                          }),
                                          (0, _.jsx)("strong", { children: e }),
                                          (0, _.jsxs)("small", {
                                            children: [a.length, " conta(s)"],
                                          }),
                                        ],
                                      }),
                                      (0, _.jsx)("div", {
                                        children: a.map((e) =>
                                          (0, _.jsxs)(
                                            "label",
                                            {
                                              children: [
                                                (0, _.jsx)("input", {
                                                  type: "checkbox",
                                                  checked: vn.includes(e.id),
                                                  onChange: () =>
                                                    bn(
                                                      vn.includes(e.id)
                                                        ? vn.filter(
                                                            (a) => a !== e.id,
                                                          )
                                                        : [...vn, e.id].slice(
                                                            0,
                                                            ze,
                                                          ),
                                                    ),
                                                }),
                                                (0, _.jsxs)("span", {
                                                  children: ["@", e.username],
                                                }),
                                                (0, _.jsxs)("small", {
                                                  children: [
                                                    e.queueCount,
                                                    " na fila · Meta conectada",
                                                  ],
                                                }),
                                              ],
                                            },
                                            e.id,
                                          ),
                                        ),
                                      }),
                                    ],
                                  },
                                  e,
                                );
                              },
                            )
                          : (0, _.jsx)("div", {
                              className: "composer-empty-accounts",
                              children:
                                "Conecte uma conta profissional em Integrações para criar e agendar em uma única etapa.",
                            }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("section", {
                  className: "composer-section",
                  children: [
                    (0, _.jsxs)("div", {
                      className: "composer-heading",
                      children: [
                        (0, _.jsx)("b", { children: "03" }),
                        (0, _.jsxs)("span", {
                          children: [
                            (0, _.jsx)("strong", {
                              children: "Ritmo e agendamento",
                            }),
                            (0, _.jsx)("small", {
                              children:
                                "Defina a distribuição e confira o volume final.",
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("div", {
                      className: "schedule-equation",
                      children: [
                        (0, _.jsxs)("span", {
                          children: [
                            (0, _.jsx)("strong", { children: Rn.length }),
                            (0, _.jsx)("small", { children: "arquivos" }),
                          ],
                        }),
                        (0, _.jsx)("b", { children: "×" }),
                        (0, _.jsxs)("span", {
                          children: [
                            (0, _.jsx)("strong", { children: mn }),
                            (0, _.jsx)("small", { children: "repetição" }),
                          ],
                        }),
                        (0, _.jsx)("b", { children: "×" }),
                        (0, _.jsxs)("span", {
                          children: [
                            (0, _.jsx)("strong", {
                              children:
                                "all_accounts" === pn
                                  ? hr.length
                                  : +!!hr.length,
                            }),
                            (0, _.jsx)("small", {
                              children:
                                "all_accounts" === pn
                                  ? "contas"
                                  : "distribuição",
                            }),
                          ],
                        }),
                        (0, _.jsx)("b", { children: "=" }),
                        (0, _.jsxs)("span", {
                          className: "total",
                          children: [
                            (0, _.jsx)("strong", { children: fr }),
                            (0, _.jsx)("small", { children: "publicações" }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("div", {
                      className: "form-grid schedule-options",
                      children: [
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", { children: "Postar em" }),
                            (0, _.jsxs)("select", {
                              value: pn,
                              onChange: (e) => {
                                let a = e.target.value;
                                (hn(a),
                                  "distribute" === a && on("global_queue"));
                              },
                              children: [
                                (0, _.jsx)("option", {
                                  value: "all_accounts",
                                  children: "Todas as contas selecionadas",
                                }),
                                (0, _.jsx)("option", {
                                  value: "distribute",
                                  children: "Uma conta de cada vez",
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", {
                              children: "Ordem dos vídeos",
                            }),
                            (0, _.jsxs)("select", {
                              value: xn,
                              onChange: (e) => _n(e.target.value),
                              children: [
                                (0, _.jsx)("option", {
                                  value: "random",
                                  children: "Aleatória por conta",
                                }),
                                (0, _.jsx)("option", {
                                  value: "sequential",
                                  children: "Ordem enviada",
                                }),
                              ],
                            }),
                            (0, _.jsx)("small", {
                              className: "field-help",
                              children:
                                "random" === xn
                                  ? "Cada conta recebe os mesmos vídeos, mas em ordem diferente. No mesmo horário elas não postam o mesmo arquivo."
                                  : "Todas as contas postam os arquivos na ordem em que você enviou.",
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", {
                              children: "Repetir cada mídia",
                            }),
                            (0, _.jsx)("input", {
                              type: "number",
                              min: 1,
                              max: 10,
                              value: mn,
                              onChange: (e) =>
                                un(
                                  Math.min(
                                    10,
                                    Math.max(1, Number(e.target.value) || 1),
                                  ),
                                ),
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          className: "full-field",
                          children: [
                            (0, _.jsx)("span", {
                              children: "Como aplicar o intervalo",
                            }),
                            (0, _.jsxs)("select", {
                              value: ln,
                              disabled: "distribute" === pn,
                              onChange: (e) => on(e.target.value),
                              children: [
                                (0, _.jsx)("option", {
                                  value: "per_account_shared",
                                  children:
                                    "Mesmo intervalo para todas as contas",
                                }),
                                (0, _.jsx)("option", {
                                  value: "per_account_custom",
                                  children: "Intervalo diferente por conta",
                                }),
                                (0, _.jsx)("option", {
                                  value: "global_queue",
                                  children:
                                    "Uma publicação por vez na fila geral",
                                }),
                              ],
                            }),
                            (0, _.jsx)("small", {
                              className: "field-help",
                              children:
                                "distribute" === pn || "global_queue" === ln
                                  ? `Uma única publicação será liberada a cada ${tn} minutos.`
                                  : "per_account_custom" === ln
                                    ? "Cada conta seguirá o intervalo definido abaixo."
                                    : `A cada ${tn} minutos, todas as contas selecionadas recebem a próxima mídia.`,
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", { children: "Começar em" }),
                            (0, _.jsx)("input", {
                              type: "datetime-local",
                              value: en,
                              min: pe(1),
                              onChange: (e) => an(e.target.value),
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", {
                              children: "Parar em · opcional",
                            }),
                            (0, _.jsx)("input", {
                              type: "datetime-local",
                              value: sn,
                              min: en,
                              onChange: (e) => nn(e.target.value),
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", {
                              children:
                                "per_account_custom" === ln
                                  ? "Intervalo padrão"
                                  : "Intervalo de postagem",
                            }),
                            (0, _.jsxs)("div", {
                              className: "number-suffix",
                              children: [
                                (0, _.jsx)("input", {
                                  type: "number",
                                  min: 5,
                                  max: 1440,
                                  value: tn,
                                  onChange: (e) =>
                                    rn(
                                      Math.min(
                                        1440,
                                        Math.max(
                                          5,
                                          Number(e.target.value) || 60,
                                        ),
                                      ),
                                    ),
                                }),
                                (0, _.jsx)("em", { children: "min" }),
                              ],
                            }),
                            (0, _.jsx)("small", {
                              className: "field-help",
                              children: "Mínimo: 5 minutos.",
                            }),
                          ],
                        }),
                        (0, _.jsxs)("label", {
                          children: [
                            (0, _.jsx)("span", { children: "Limite diário" }),
                            (0, _.jsxs)("select", {
                              value: jn ? "respect" : "force",
                              onChange: (e) => gn("respect" === e.target.value),
                              children: [
                                (0, _.jsx)("option", {
                                  value: "respect",
                                  children: "Respeitar limite da Meta",
                                }),
                                (0, _.jsx)("option", {
                                  value: "force",
                                  children: "Forçar fila mesmo assim",
                                }),
                              ],
                            }),
                            (0, _.jsx)("small", {
                              className: "field-help",
                              children:
                                "Forçar pode aumentar o risco de restrições.",
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("button", {
                      type: "button",
                      className: "daily-preset",
                      onClick: () => {
                        (rn(1440),
                          "per_account_custom" === ln &&
                            dn(
                              Object.fromEntries(hr.map((e) => [e.id, 1440])),
                            ));
                      },
                      children: [
                        (0, _.jsx)(y, { name: "check", size: 14 }),
                        " Aplicar ritmo de 1 publicação por dia em cada conta",
                      ],
                    }),
                    "all_accounts" === pn &&
                      "per_account_custom" === ln &&
                      (0, _.jsxs)("div", {
                        className: "account-interval-grid",
                        children: [
                          (0, _.jsx)("strong", {
                            children: "Intervalo individual por conta",
                          }),
                          (0, _.jsx)("div", {
                            children: hr.map((e) =>
                              (0, _.jsxs)(
                                "label",
                                {
                                  children: [
                                    (0, _.jsxs)("span", {
                                      children: ["@", e.username],
                                    }),
                                    (0, _.jsxs)("span", {
                                      className: "number-suffix",
                                      children: [
                                        (0, _.jsx)("input", {
                                          type: "number",
                                          min: 5,
                                          max: 1440,
                                          value: cn[e.id] || tn,
                                          onChange: (a) =>
                                            dn({
                                              ...cn,
                                              [e.id]: Math.min(
                                                1440,
                                                Math.max(
                                                  5,
                                                  Number(a.target.value) || 60,
                                                ),
                                              ),
                                            }),
                                        }),
                                        (0, _.jsx)("em", { children: "min" }),
                                      ],
                                    }),
                                  ],
                                },
                                e.id,
                              ),
                            ),
                          }),
                        ],
                      }),
                  ],
                }),
                "saving" === fn &&
                  ft.total > 0 &&
                  0 === Dn.total &&
                  (0, _.jsxs)("div", {
                    className: "upload-progress video-render-progress",
                    children: [
                      (0, _.jsx)("span", {
                        children: (0, _.jsx)("i", {
                          style: {
                            width:
                              ((ft.current - 1 + ft.progress) / ft.total) *
                                100 +
                              "%",
                          },
                        }),
                      }),
                      (0, _.jsxs)("small", {
                        children: [
                          "Gerando vídeo ",
                          ft.current,
                          " de ",
                          ft.total,
                          " · ",
                          Math.round(100 * ft.progress),
                          "% · ",
                          ft.fileName,
                        ],
                      }),
                    ],
                  }),
                "saving" === fn &&
                  Dn.total > 0 &&
                  (0, _.jsxs)("div", {
                    className: "upload-progress",
                    children: [
                      (0, _.jsx)("span", {
                        children: (0, _.jsx)("i", {
                          style: {
                            width: (Dn.completed / Dn.total) * 100 + "%",
                          },
                        }),
                      }),
                      (0, _.jsxs)("small", {
                        children: [
                          "Enviando ",
                          Dn.completed,
                          " de ",
                          Dn.total,
                          " arquivos",
                        ],
                      }),
                    ],
                  }),
                Cn &&
                  (0, _.jsx)("div", {
                    className: `import-result ${fn}`,
                    children: Cn,
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-note warning-note",
                  children: [
                    (0, _.jsx)(y, { name: "shield" }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", {
                          children: "Confirmação antes da publicação",
                        }),
                        (0, _.jsx)("small", {
                          children:
                            "Ao criar e agendar, os itens entram na fila e só serão publicados nos horários escolhidos.",
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "modal-actions composer-actions",
                  children: [
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "text-button",
                      onClick: () =>
                        "saving" === fn && Nt.current
                          ? Nt.current.abort()
                          : Gs(!1),
                      disabled: "saving" === fn && !Nt.current,
                      children:
                        "saving" === fn && Nt.current
                          ? "Parar geração"
                          : "Cancelar",
                    }),
                    (0, _.jsx)("button", {
                      type: "submit",
                      name: "intent",
                      value: "draft",
                      className: "outline-button",
                      disabled: "saving" === fn,
                      children: "Salvar rascunho",
                    }),
                    (0, _.jsx)("button", {
                      type: "submit",
                      name: "intent",
                      value: "schedule",
                      className: "primary-button",
                      disabled:
                        "saving" === fn ||
                        (!I && (!ra.publishingEnabled || !hr.length)),
                      children: I
                        ? "Criar rascunho do template"
                        : ra.publishingEnabled
                          ? `Criar e agendar ${fr} publicações`
                          : "Publicação desligada",
                    }),
                  ],
                }),
              ],
            }),
          }),
        mr &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => "saving" !== fn && Hs(null)),
            children: (0, _.jsxs)("form", {
              className: "import-modal campaign-modal manage-campaign-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "manage-campaign-title",
              onSubmit: async (e) => {
                if ((e.preventDefault(), Js)) {
                  (yn("saving"), Sn(""));
                  try {
                    let e = await w(`/api/campaigns/${Js}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "update", ...Ks }),
                      }),
                      a = await e.json();
                    if (!e.ok)
                      throw Error(
                        a.error || "Não foi possível salvar a campanha.",
                      );
                    (yn("success"),
                      Sn(
                        `Campanha atualizada. A nova legenda foi aplicada a ${a.futurePosts ?? 0} posts futuros.`,
                      ),
                      Hs(null),
                      await Promise.all([Fr(), Ir()]));
                  } catch (e) {
                    (yn("error"),
                      Sn(
                        e instanceof Error
                          ? e.message
                          : "Não foi possível salvar a campanha.",
                      ));
                  }
                }
              },
              children: [
                (0, _.jsx)("button", {
                  type: "button",
                  className: "modal-close",
                  onClick: () => Hs(null),
                  "aria-label": "Fechar",
                  disabled: "saving" === fn,
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "campaign", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "manage-campaign-title",
                  children: "Gerenciar campanha",
                }),
                (0, _.jsx)("p", {
                  children:
                    "Edite o nome e a legenda dos próximos posts. Publicações que já saíram não podem ser alteradas pela resolv.",
                }),
                (0, _.jsxs)("div", {
                  className: "campaign-manage-summary",
                  children: [
                    (0, _.jsx)("span", {
                      className: `campaign-status ${phaseOf(mr).k}`,
                      children: phaseOf(mr).n,
                    }),
                    (0, _.jsxs)("strong", {
                      children: [
                        mr.publishedCount,
                        " de ",
                        mr.totalAccounts,
                        " publicadas",
                      ],
                    }),
                    (0, _.jsx)("small", {
                      children:
                        "distribute" === mr.distributionMode
                          ? `Uma conta a cada ${mr.intervalMinutes || 60} min`
                          : `Todas as contas juntas a cada ${mr.intervalMinutes || 60} min`,
                    }),
                  ],
                }),
                (0, _.jsx)(CampaignAccounts, { campaign: mr }),
                (0, _.jsxs)("div", {
                  className: "campaign-media-preview",
                  children: [
                    (0, _.jsx)("strong", { children: "Prévia dos arquivos" }),
                    Xs.length
                      ? (0, _.jsx)("div", {
                          children: Xs.filter(
                            (e) => "content" === e.purpose,
                          ).map((e) =>
                            (0, _.jsxs)(
                              "figure",
                              {
                                children: [
                                  e.contentType.startsWith("video/")
                                    ? (0, _.jsx)("video", {
                                        src: e.publicUrl,
                                        preload: "metadata",
                                        muted: !0,
                                      })
                                    : (0, _.jsx)("span", {
                                        className: "preview-image",
                                        role: "img",
                                        "aria-label": e.fileName,
                                        style: {
                                          backgroundImage: `url(${e.publicUrl})`,
                                        },
                                      }),
                                  (0, _.jsx)("figcaption", {
                                    children: e.fileName,
                                  }),
                                ],
                              },
                              e.id,
                            ),
                          ),
                        })
                      : (0, _.jsx)("small", {
                          children: "Carregando arquivos...",
                        }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "form-grid",
                  children: [
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsx)("span", { children: "Nome da campanha" }),
                        (0, _.jsx)("input", {
                          required: !0,
                          readOnly: !Bs,
                          maxLength: 120,
                          value: Ks.name,
                          onChange: (e) => Ws({ ...Ks, name: e.target.value }),
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsx)("span", {
                          children: "Legenda dos próximos posts · opcional",
                        }),
                        (0, _.jsx)("textarea", {
                          rows: 7,
                          readOnly: !Bs,
                          maxLength: 1e4,
                          value: Ks.caption,
                          onChange: (e) =>
                            Ws({ ...Ks, caption: e.target.value }),
                          placeholder:
                            "Deixe em branco para publicar sem legenda.",
                        }),
                        (0, _.jsx)("small", {
                          className: "field-help",
                          children:
                            "As variações aprovadas abaixo são distribuídas nos posts futuros. Nenhum comentário automático é enviado.",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("div", {
                      className: "caption-studio full-field",
                      children: [
                        (0, _.jsxs)("div", {
                          className: "caption-tools",
                          children: [
                            (0, _.jsx)("button", {
                              type: "button",
                              className: "auto-caption-button",
                              disabled: !Bs || Ln || !Ks.caption.trim(),
                              onClick: () => {
                                nl(Ks.caption, $n, (e) =>
                                  Ws({ ...Ks, captionVariations: e }),
                                );
                              },
                              children: Ln
                                ? "Gerando..."
                                : "Gerar variações com IA",
                            }),
                            Bs &&
                              (0, _.jsx)("button", {
                                type: "button",
                                className: "caption-tools-ghost",
                                onClick: () =>
                                  Ws({
                                    ...Ks,
                                    captionVariations: [
                                      ...Ks.captionVariations,
                                      Ks.caption || "",
                                    ],
                                  }),
                                children: "Adicionar manualmente",
                              }),
                          ],
                        }),
                        Ks.captionVariations.length > 0 &&
                          (0, _.jsx)("div", {
                            className: "caption-variation-list",
                            children: Ks.captionVariations.map((e, a) =>
                              (0, _.jsxs)(
                                "article",
                                {
                                  children: [
                                    (0, _.jsx)("b", {
                                      children: String(a + 1).padStart(2, "0"),
                                    }),
                                    (0, _.jsx)("textarea", {
                                      rows: 3,
                                      readOnly: !Bs,
                                      maxLength: 2200,
                                      value: e,
                                      onChange: (e) =>
                                        Ws({
                                          ...Ks,
                                          captionVariations:
                                            Ks.captionVariations.map((s, n) =>
                                              n === a ? e.target.value : s,
                                            ),
                                        }),
                                    }),
                                    (0, _.jsx)("button", {
                                      type: "button",
                                      className: "text-button danger-action",
                                      disabled: !Bs,
                                      onClick: () =>
                                        Ws({
                                          ...Ks,
                                          captionVariations:
                                            Ks.captionVariations.filter(
                                              (e, s) => s !== a,
                                            ),
                                        }),
                                      children: "Remover",
                                    }),
                                  ],
                                },
                                `manage-variation-${a}`,
                              ),
                            ),
                          }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsx)("span", { children: "Hashtags" }),
                        (0, _.jsx)("input", {
                          readOnly: !Bs,
                          maxLength: 1e3,
                          value: Ks.hashtags,
                          onChange: (e) =>
                            Ws({ ...Ks, hashtags: e.target.value }),
                          placeholder: "#reels #conteudo #marca",
                        }),
                      ],
                    }),
                    "REELS" === mr.mediaType &&
                      (0, _.jsxs)("label", {
                        className: "full-field",
                        children: [
                          (0, _.jsx)("span", { children: "Grade principal" }),
                          (0, _.jsxs)("select", {
                            disabled: !Bs,
                            value: Ks.shareToFeed ? "feed" : "reels",
                            onChange: (e) =>
                              Ws({
                                ...Ks,
                                shareToFeed: "feed" === e.target.value,
                              }),
                            children: [
                              (0, _.jsx)("option", {
                                value: "reels",
                                children: "Só aba Reels",
                              }),
                              (0, _.jsx)("option", {
                                value: "feed",
                                children: "Reels + grade principal",
                              }),
                            ],
                          }),
                        ],
                      }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "modal-note",
                  children: [
                    (0, _.jsx)(y, { name: "shield" }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", {
                          children: "Controle dos próximos posts",
                        }),
                        (0, _.jsx)("small", {
                          children:
                            "Pausar interrompe a fila. Retomar preserva os intervalos. Encerrar cancela definitivamente o restante.",
                        }),
                      ],
                    }),
                  ],
                }),
                Cn &&
                  (0, _.jsx)("div", {
                    className: `import-result ${fn}`,
                    children: Cn,
                  }),
                (0, _.jsxs)("div", {
                  className: "campaign-control-actions",
                  children: [
                    Bs &&
                      "scheduled" === mr.status &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "outline-button",
                        onClick: () => {
                          tl("pause");
                        },
                        children: "Pausar campanha",
                      }),
                    Bs &&
                      "paused" === mr.status &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "outline-button",
                        disabled: !ra.publishingEnabled,
                        onClick: () => {
                          tl("resume");
                        },
                        children: ra.publishingEnabled
                          ? "Retomar campanha"
                          : "Retomada desligada",
                      }),
                    Bs &&
                      ["scheduled", "paused"].includes(mr.status) &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "text-button danger-action",
                        onClick: () => {
                          tl("cancel");
                        },
                        children: "Encerrar próximos posts",
                      }),
                    Bs &&
                      (0, _.jsx)("button", {
                        type: "button",
                        className: "outline-button",
                        onClick: () => {
                          (async () => {
                            if (Js) {
                              (yn("saving"), Sn(""));
                              try {
                                let e = await w(`/api/campaigns/${Js}`, {
                                    method: "PATCH",
                                    headers: {
                                      "content-type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      action: "duplicate",
                                    }),
                                  }),
                                  a = await e.json();
                                if (!e.ok || !a.duplicate)
                                  throw Error(
                                    a.error ||
                                      "Não foi possível duplicar a campanha.",
                                  );
                                (O((e) => [
                                  a.duplicate,
                                  ...e.filter((e) => e.id !== a.duplicate.id),
                                ]),
                                  Bt(""),
                                  Gt("draft"),
                                  Ht("Todos"),
                                  Wt("recent"),
                                  Hs(null),
                                  yn("success"),
                                  Sn(
                                    `Campanha duplicada como “${a.duplicate.name}”. Ela ficou salva em rascunho.`,
                                  ),
                                  await Fr());
                              } catch (e) {
                                (yn("error"),
                                  Sn(
                                    e instanceof Error
                                      ? e.message
                                      : "Não foi possível duplicar a campanha.",
                                  ));
                              }
                            }
                          })();
                        },
                        children: "Duplicar",
                      }),
                    (0, _.jsx)("span", {}),
                    (0, _.jsx)("button", {
                      type: "button",
                      className: "text-button",
                      onClick: () => Hs(null),
                      children: "Fechar",
                    }),
                    Bs &&
                      (0, _.jsx)("button", {
                        type: "submit",
                        className: "primary-button",
                        disabled: !Sr || "saving" === fn,
                        children:
                          "saving" === fn ? "Salvando…" : "Salvar alterações",
                      }),
                  ],
                }),
              ],
            }),
          }),
        Zs &&
          (0, _.jsx)("div", {
            className: "modal-backdrop",
            onMouseDown: (e) => ge(e, () => "saving" !== fn && Qs(null)),
            children: (0, _.jsxs)("section", {
              className: "import-modal schedule-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "schedule-title",
              children: [
                (0, _.jsx)("button", {
                  className: "modal-close",
                  onClick: () => Qs(null),
                  "aria-label": "Fechar",
                  children: "×",
                }),
                (0, _.jsx)("span", {
                  className: "modal-icon",
                  children: (0, _.jsx)(y, { name: "queue", size: 24 }),
                }),
                (0, _.jsx)("h2", {
                  id: "schedule-title",
                  children: "Ativar agendamento",
                }),
                (0, _.jsx)("p", {
                  children:
                    "Escolha as contas, o ritmo e a janela de publicação. Confira o volume antes de ativar.",
                }),
                (0, _.jsxs)("div", {
                  className: "account-picker",
                  children: [
                    (0, _.jsxs)("div", {
                      className: "account-picker-head",
                      children: [
                        (0, _.jsxs)("strong", {
                          children: [
                            "Contas da campanha · ",
                            ur.length,
                            " conectada(s)",
                          ],
                        }),
                        (0, _.jsx)("button", {
                          type: "button",
                          className: "inline-action",
                          onClick: () =>
                            bn(
                              hr.length ? [] : ur.slice(0, ze).map((e) => e.id),
                            ),
                          children: hr.length
                            ? "Limpar seleção"
                            : "Selecionar todas",
                        }),
                      ],
                    }),
                    ur.length
                      ? Array.from(new Set(ur.map((e) => e.model))).map((e) => {
                          let a = ur.filter((a) => a.model === e),
                            s = a.every((e) => vn.includes(e.id));
                          return (0, _.jsxs)(
                            "div",
                            {
                              className: "account-model-group",
                              children: [
                                (0, _.jsxs)("label", {
                                  children: [
                                    (0, _.jsx)("input", {
                                      type: "checkbox",
                                      checked: s,
                                      onChange: () =>
                                        bn(
                                          s
                                            ? vn.filter(
                                                (e) =>
                                                  !a.some((a) => a.id === e),
                                              )
                                            : [
                                                ...new Set([
                                                  ...vn,
                                                  ...a.map((e) => e.id),
                                                ]),
                                              ].slice(0, ze),
                                        ),
                                    }),
                                    (0, _.jsx)("strong", { children: e }),
                                    (0, _.jsxs)("small", {
                                      children: [a.length, " conta(s)"],
                                    }),
                                  ],
                                }),
                                (0, _.jsx)("div", {
                                  children: a.map((e) =>
                                    (0, _.jsxs)(
                                      "label",
                                      {
                                        children: [
                                          (0, _.jsx)("input", {
                                            type: "checkbox",
                                            checked: vn.includes(e.id),
                                            onChange: () =>
                                              bn(
                                                vn.includes(e.id)
                                                  ? vn.filter((a) => a !== e.id)
                                                  : [...vn, e.id].slice(0, ze),
                                              ),
                                          }),
                                          (0, _.jsxs)("span", {
                                            children: ["@", e.username],
                                          }),
                                          (0, _.jsxs)("small", {
                                            children: [
                                              e.queueCount,
                                              " na fila · Meta conectada",
                                            ],
                                          }),
                                        ],
                                      },
                                      e.id,
                                    ),
                                  ),
                                }),
                              ],
                            },
                            e,
                          );
                        })
                      : (0, _.jsx)("div", {
                          className: "composer-empty-accounts",
                          children:
                            "Conecte uma conta recuperada à Meta primeiro.",
                        }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "schedule-equation",
                  children: [
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", { children: pr }),
                        (0, _.jsx)("small", { children: "arquivos" }),
                      ],
                    }),
                    (0, _.jsx)("b", { children: "×" }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", { children: mn }),
                        (0, _.jsx)("small", { children: "repetição" }),
                      ],
                    }),
                    (0, _.jsx)("b", { children: "×" }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", {
                          children:
                            "all_accounts" === pn ? hr.length : +!!hr.length,
                        }),
                        (0, _.jsx)("small", {
                          children:
                            "all_accounts" === pn ? "contas" : "distribuição",
                        }),
                      ],
                    }),
                    (0, _.jsx)("b", { children: "=" }),
                    (0, _.jsxs)("span", {
                      className: "total",
                      children: [
                        (0, _.jsx)("strong", { children: vr }),
                        (0, _.jsx)("small", { children: "publicações" }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("div", {
                  className: "form-grid schedule-options",
                  children: [
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Postar em" }),
                        (0, _.jsxs)("select", {
                          value: pn,
                          onChange: (e) => {
                            let a = e.target.value;
                            (hn(a), "distribute" === a && on("global_queue"));
                          },
                          children: [
                            (0, _.jsx)("option", {
                              value: "all_accounts",
                              children: "Todas as contas selecionadas",
                            }),
                            (0, _.jsx)("option", {
                              value: "distribute",
                              children: "Uma conta de cada vez",
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Ordem dos vídeos" }),
                        (0, _.jsxs)("select", {
                          value: xn,
                          onChange: (e) => _n(e.target.value),
                          children: [
                            (0, _.jsx)("option", {
                              value: "random",
                              children: "Aleatória por conta",
                            }),
                            (0, _.jsx)("option", {
                              value: "sequential",
                              children: "Ordem enviada",
                            }),
                          ],
                        }),
                        (0, _.jsx)("small", {
                          className: "field-help",
                          children:
                            "random" === xn
                              ? "Cada conta recebe os mesmos vídeos, mas em ordem diferente. No mesmo horário elas não postam o mesmo arquivo."
                              : "Todas as contas postam os arquivos na ordem em que você enviou.",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Repetir cada mídia" }),
                        (0, _.jsx)("input", {
                          type: "number",
                          min: 1,
                          max: 10,
                          value: mn,
                          onChange: (e) =>
                            un(
                              Math.min(
                                10,
                                Math.max(1, Number(e.target.value) || 1),
                              ),
                            ),
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      className: "full-field",
                      children: [
                        (0, _.jsx)("span", {
                          children: "Como aplicar o intervalo",
                        }),
                        (0, _.jsxs)("select", {
                          value: ln,
                          disabled: "distribute" === pn,
                          onChange: (e) => on(e.target.value),
                          children: [
                            (0, _.jsx)("option", {
                              value: "per_account_shared",
                              children: "Mesmo intervalo para todas as contas",
                            }),
                            (0, _.jsx)("option", {
                              value: "per_account_custom",
                              children: "Intervalo diferente por conta",
                            }),
                            (0, _.jsx)("option", {
                              value: "global_queue",
                              children: "Uma publicação por vez na fila geral",
                            }),
                          ],
                        }),
                        (0, _.jsx)("small", {
                          className: "field-help",
                          children:
                            "distribute" === pn || "global_queue" === ln
                              ? `Uma única publicação será liberada a cada ${tn} minutos.`
                              : "per_account_custom" === ln
                                ? "Cada conta seguirá o intervalo definido abaixo."
                                : `A cada ${tn} minutos, todas as contas selecionadas recebem a próxima mídia.`,
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Começar em" }),
                        (0, _.jsx)("input", {
                          type: "datetime-local",
                          value: en,
                          min: pe(1),
                          onChange: (e) => an(e.target.value),
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Parar em · opcional" }),
                        (0, _.jsx)("input", {
                          type: "datetime-local",
                          value: sn,
                          min: en,
                          onChange: (e) => nn(e.target.value),
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", {
                          children:
                            "per_account_custom" === ln
                              ? "Intervalo padrão"
                              : "Intervalo de postagem",
                        }),
                        (0, _.jsxs)("div", {
                          className: "number-suffix",
                          children: [
                            (0, _.jsx)("input", {
                              type: "number",
                              min: 5,
                              max: 1440,
                              value: tn,
                              onChange: (e) =>
                                rn(
                                  Math.min(
                                    1440,
                                    Math.max(5, Number(e.target.value) || 60),
                                  ),
                                ),
                            }),
                            (0, _.jsx)("em", { children: "min" }),
                          ],
                        }),
                        (0, _.jsx)("small", {
                          className: "field-help",
                          children: "Mínimo: 5 minutos.",
                        }),
                      ],
                    }),
                    (0, _.jsxs)("label", {
                      children: [
                        (0, _.jsx)("span", { children: "Limite diário" }),
                        (0, _.jsxs)("select", {
                          value: jn ? "respect" : "force",
                          onChange: (e) => gn("respect" === e.target.value),
                          children: [
                            (0, _.jsx)("option", {
                              value: "respect",
                              children: "Respeitar limite da Meta",
                            }),
                            (0, _.jsx)("option", {
                              value: "force",
                              children: "Forçar fila mesmo assim",
                            }),
                          ],
                        }),
                        (0, _.jsx)("small", {
                          className: "field-help",
                          children:
                            "Forçar pode aumentar o risco de restrições.",
                        }),
                      ],
                    }),
                  ],
                }),
                (0, _.jsxs)("button", {
                  type: "button",
                  className: "daily-preset",
                  onClick: () => {
                    (rn(1440),
                      "per_account_custom" === ln &&
                        dn(Object.fromEntries(hr.map((e) => [e.id, 1440]))));
                  },
                  children: [
                    (0, _.jsx)(y, { name: "check", size: 14 }),
                    " Aplicar ritmo de 1 publicação por dia em cada conta",
                  ],
                }),
                "all_accounts" === pn &&
                  "per_account_custom" === ln &&
                  (0, _.jsxs)("div", {
                    className: "account-interval-grid",
                    children: [
                      (0, _.jsx)("strong", {
                        children: "Intervalo individual por conta",
                      }),
                      (0, _.jsx)("div", {
                        children: hr.map((e) =>
                          (0, _.jsxs)(
                            "label",
                            {
                              children: [
                                (0, _.jsxs)("span", {
                                  children: ["@", e.username],
                                }),
                                (0, _.jsxs)("span", {
                                  className: "number-suffix",
                                  children: [
                                    (0, _.jsx)("input", {
                                      type: "number",
                                      min: 5,
                                      max: 1440,
                                      value: cn[e.id] || tn,
                                      onChange: (a) =>
                                        dn({
                                          ...cn,
                                          [e.id]: Math.min(
                                            1440,
                                            Math.max(
                                              5,
                                              Number(a.target.value) || 60,
                                            ),
                                          ),
                                        }),
                                    }),
                                    (0, _.jsx)("em", { children: "min" }),
                                  ],
                                }),
                              ],
                            },
                            e.id,
                          ),
                        ),
                      }),
                    ],
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-note warning-note",
                  children: [
                    (0, _.jsx)(y, { name: "shield" }),
                    (0, _.jsxs)("span", {
                      children: [
                        (0, _.jsx)("strong", { children: "Ritmo da fila" }),
                        (0, _.jsx)("small", {
                          children:
                            "Legenda opcional, sem comentários automáticos. Intervalo mínimo de 5 minutos entre postagens.",
                        }),
                      ],
                    }),
                  ],
                }),
                Cn &&
                  (0, _.jsx)("div", {
                    className: `import-result ${fn}`,
                    children: Cn,
                  }),
                (0, _.jsxs)("div", {
                  className: "modal-actions",
                  children: [
                    (0, _.jsx)("button", {
                      className: "outline-button",
                      onClick: () => Qs(null),
                      children: "Voltar",
                    }),
                    (0, _.jsx)("button", {
                      className: "primary-button",
                      disabled:
                        !ra.publishingEnabled || "saving" === fn || !hr.length,
                      onClick: () => {
                        (async () => {
                          if (!Zs) return;
                          let e = hr.map((e) => e.id);
                          if (!e.length)
                            return (
                              yn("error"),
                              void Sn(
                                "Conecte pelo menos uma conta à Meta antes de ativar o agendamento.",
                              )
                            );
                          yn("saving");
                          try {
                            let a = await w(`/api/campaigns/${Zs}/schedule`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  accountIds: e,
                                  startAt: new Date(en).toISOString(),
                                  stopAt: sn
                                    ? new Date(sn).toISOString()
                                    : null,
                                  intervalMinutes: tn,
                                  intervalMode: ln,
                                  accountIntervals: cn,
                                  repeatCount: mn,
                                  distributionMode: pn,
                                  mediaOrder: xn,
                                  respectDailyLimit: jn,
                                }),
                              }),
                              s = await a.json();
                            if (!a.ok)
                              throw Error(s.error || "Falha ao agendar.");
                            (Qs(null),
                              yn("success"),
                              Sn(
                                `${s.queued ?? 0} publicações entraram na fila; ${s.blocked ?? 0} ficaram bloqueadas.${s.windowLimited ? " A janela final limitou o volume." : ""}`,
                              ),
                              await Promise.all([Fr(), Ir(), Rr()]));
                          } catch (e) {
                            (yn("error"),
                              Sn(
                                e instanceof Error
                                  ? e.message
                                  : "Não foi possível agendar a campanha.",
                              ));
                          }
                        })();
                      },
                      children: ra.publishingEnabled
                        ? `Agendar ${vr} publicações`
                        : "Publicação desligada",
                    }),
                  ],
                }),
              ],
            }),
          }),
      ],
    })
  );
}
export { Je as NexoFlowDashboard };
