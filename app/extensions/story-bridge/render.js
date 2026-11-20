// Canvas preparation/sticker drawing adapted from the existing HeavyStorys content.js.
/* global chrome */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "RESOLV_STORY_RENDER" || message.target !== "offscreen") return false;
  prepareStoryImage(message.imageBase64, message.contentType, message.linkTitle, message)
    .then(result => sendResponse({ ok: true, result }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

async function prepareStoryImage(imageBase64, contentType, linkTitle, sticker = {}) {
  const hasLink = sticker.hasLink !== false;
  const rotation = hasLink && sticker.rotation !== undefined ? sticker.rotation : 0;
  if (!Number.isInteger(rotation) || rotation < -180 || rotation > 180) throw new Error("Inclinação inválida.");
  if (!["image/jpeg", "image/png"].includes(contentType) || typeof imageBase64 !== "string" || imageBase64.length > 14 * 1024 * 1024 || (hasLink && (typeof linkTitle !== "string" || !linkTitle.trim()))) throw new Error("Imagem inválida.");
  const binary = atob(imageBase64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: contentType }));
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error("Imagem grande demais."); }
  const axis = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(.95, Math.max(.05, number)) : fallback;
  };
  const scale = Number(sticker.scale);
  const state = { x: axis(sticker.x, .5), y: axis(sticker.y, .75), width: .5, height: .04 };
  const style = ["blue", "dark", "gradient", "orange", "mint", "violet", "custom"].includes(sticker.style) ? sticker.style : "blue";
  const drawnScale = Number.isFinite(scale) ? Math.min(3.2, Math.max(.7, scale)) : 1;
  const output = document.createElement("canvas"); output.width = 1080; output.height = 1920;
  const ctx = output.getContext("2d", { alpha: false });
  if (!ctx) { bitmap.close(); throw new Error("Canvas indisponível."); }
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1080, 1920);
  const cover = Math.max(1080 / bitmap.width, 1920 / bitmap.height), w = bitmap.width * cover, h = bitmap.height * cover;
  ctx.drawImage(bitmap, (1080 - w) / 2, (1920 - h) / 2, w, h); bitmap.close();
  if (hasLink) drawSticker(ctx, { text: String(linkTitle).trim(), style, scale: drawnScale });
  return { imageBase64: output.toDataURL("image/jpeg", .9).split(",")[1], ...(hasLink ? { x: state.x, y: state.y, width: state.width, height: state.height, rotation } : {}) };
  function drawSticker(ctx, options) {
    const centerX = state.x * 1080, centerY = state.y * 1920;
    const text = String(options.text || "SEU LINK").toUpperCase();
    const stickerTools = globalThis.StoryLinkSticker;
    const palette = stickerTools.getStickerPalette(options.style, sticker.background, sticker.foreground);
    ctx.font = "400 34px 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
    const metrics = stickerTools.calculateStickerMetrics({ textWidth: ctx.measureText(text).width, scale: options.scale, maxWidth: 842 });
    const width = metrics.width, height = metrics.height;
    const left = centerX - width / 2, top = centerY - height / 2;
    state.width = width / 1080;
    state.height = height / 1920;

    ctx.save();
    // Geometry stays centered with unrotated width/height. Canvas alone takes
    // radians; wire rotation remains signed degrees, as in rotateDeg().
    if (rotation !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.translate(-centerX, -centerY);
    }
    ctx.beginPath(); ctx.roundRect(left, top, width, height, metrics.radius);
    if (palette.gradient) {
      const gradient = ctx.createLinearGradient(left, top, left + width, top);
      palette.gradient.forEach((color, index) => gradient.addColorStop(index / (palette.gradient.length - 1), color));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = palette.background;
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = palette.foreground;
    ctx.strokeStyle = palette.foreground;
    drawLinkedChainIcon(ctx, left + metrics.paddingX + metrics.iconSize / 2, centerY, metrics.iconSize);
    ctx.font = `400 ${metrics.fontSize}px 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, left + metrics.paddingX + metrics.iconSize + metrics.iconGap, centerY + 1);
    ctx.restore();
  }
  function drawLinkedChainIcon(ctx, centerX, centerY, size) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.lineWidth = Math.max(2, size * .105);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    globalThis.StoryLinkSticker.getLinkedChainPaths(size).forEach((path) => {
      ctx.beginPath();
      path.commands.forEach((command) => ctx[command.op](...command.values));
      ctx.stroke();
    });
    ctx.restore();
  }

}
