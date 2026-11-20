(() => {
  const PALETTES = Object.freeze({
    blue: Object.freeze({ background: "#ffffff", foreground: "#386FA0", gradient: null }),
    dark: Object.freeze({ background: "#151515", foreground: "#ffffff", gradient: null }),
    orange: Object.freeze({ background: "#FF5A00", foreground: "#211006", gradient: null }),
    mint: Object.freeze({ background: "#34F5AA", foreground: "#10251B", gradient: null }),
    violet: Object.freeze({ background: "#7C3AED", foreground: "#FFFFFF", gradient: null }),
    gradient: Object.freeze({
      background: null,
      foreground: "#ffffff",
      gradient: Object.freeze(["#FEDA75", "#FA7E1E", "#D62976", "#962FBF", "#4F5BD5"])
    })
  });

  function getStickerPalette(style, background, foreground) {
    if (style === "custom" && /^#[0-9a-f]{6}$/i.test(background) && /^#[0-9a-f]{6}$/i.test(foreground)) return { background: background.toUpperCase(), foreground: foreground.toUpperCase(), gradient: null };
    return Object.hasOwn(PALETTES, style) ? PALETTES[style] : PALETTES.blue;
  }

  function sliderPercentToScale(percent) {
    const number = Number(percent);
    if (!Number.isFinite(number)) return 1;
    return Math.min(3.2, Math.max(0.7, number / 100));
  }

  function createPreviewScaleProperties(percent) {
    return { "--sl-sticker-scale": String(sliderPercentToScale(percent)) };
  }

  function getLinkedChainPaths(size) {
    const scale = Math.max(1, Number(size) || 48) / 48;
    return [
      {
        commands: [
          { op: "moveTo", values: [-17 * scale, -3.2 * scale] },
          { op: "bezierCurveTo", values: [-23 * scale, 1.8 * scale, -23.2 * scale, 11 * scale, -18 * scale, 17 * scale] },
          { op: "bezierCurveTo", values: [-12 * scale, 23 * scale, -2.2 * scale, 23 * scale, 3.4 * scale, 16 * scale] }
        ]
      },
      {
        commands: [
          { op: "moveTo", values: [-7 * scale, 7.5 * scale] },
          { op: "lineTo", values: [7 * scale, -6.8 * scale] }
        ]
      },
      {
        commands: [
          { op: "moveTo", values: [-3.2 * scale, -16.8 * scale] },
          { op: "bezierCurveTo", values: [1.8 * scale, -22.8 * scale, 11.8 * scale, -22.8 * scale, 17 * scale, -17.8 * scale] },
          { op: "bezierCurveTo", values: [23 * scale, -11.8 * scale, 23 * scale, -1.8 * scale, 17 * scale, 4.2 * scale] }
        ]
      }
    ];
  }

  function calculateStickerMetrics({ textWidth, scale, maxWidth = 842 }) {
    const requestedScale = Math.min(3.2, Math.max(0.7, Number(scale) || 1));
    const safeTextWidth = Math.max(0, Number(textWidth) || 0);
    const safeMaxWidth = Math.max(1, Number(maxWidth) || 842);
    const fixedWidth = 124;
    const effectiveScale = Math.min(requestedScale, safeMaxWidth / Math.max(160, safeTextWidth + fixedWidth));

    return {
      effectiveScale,
      width: Math.min(safeMaxWidth, Math.max(160 * effectiveScale, (safeTextWidth + fixedWidth) * effectiveScale)),
      height: 76 * effectiveScale,
      fontSize: 34 * effectiveScale,
      iconSize: 48 * effectiveScale,
      iconGap: 15 * effectiveScale,
      paddingX: 30 * effectiveScale,
      radius: 20 * effectiveScale
    };
  }

  const api = { getStickerPalette, sliderPercentToScale, createPreviewScaleProperties, getLinkedChainPaths, calculateStickerMetrics };
  if (typeof module === "object" && module.exports) module.exports = api;
  else globalThis.StoryLinkSticker = api;
})();
