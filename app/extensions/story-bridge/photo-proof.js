// Read-only DOM evidence. No Instagram request endpoints, URL-change heuristic or fuzzy match.
// Kept self-contained because Chrome serializes this function into the owned editor tab.
export async function photoDocumentProof({ instagramUsername, imageBase64, contentType }) {
  const unavailable = () => ({ error: "photo_confirmation_unavailable" });
  try {
    if (location.origin !== "https://www.instagram.com" || !/^\/accounts\/edit\/?$/.test(location.pathname)) return unavailable();
    if (document.querySelector('[role="dialog"],iframe[src*="captcha"],input[name="password"]')) return unavailable();
    if (!/^[a-z0-9._]{1,30}$/.test(instagramUsername)) return unavailable();
    const labels = [`${instagramUsername}'s profile picture`, `Foto do perfil de ${instagramUsername}`, `Foto de perfil de ${instagramUsername}`].map(x => x.toLowerCase());
    const avatars = [...document.querySelectorAll("main img")].filter(img => img.getClientRects().length && labels.includes((img.alt || "").trim().toLowerCase()));
    if (avatars.length !== 1) return unavailable();
    const avatar = avatars[0], url = new URL(avatar.currentSrc || avatar.src);
    if (url.protocol !== "https:" || url.username || url.password || !avatar.complete || avatar.naturalWidth < 64 || avatar.naturalHeight < 64) return unavailable();
    // Only square, opaque images have an unambiguous crop in proof version 1.
    // Compression, CORS restrictions or any different crop yield uncertainty, never approximate success.
    const bytes = Uint8Array.from(atob(imageBase64), char => char.charCodeAt(0));
    const source = await createImageBitmap(new Blob([bytes], { type: contentType }));
    try {
      if (source.width !== source.height || source.width < 64 || avatar.naturalWidth !== avatar.naturalHeight) return unavailable();
      const signature = async image => {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, 64, 64);
        const pixels = context.getImageData(0, 0, 64, 64).data, selected = [];
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const i = (y * 64 + x) * 4;
          if (pixels[i + 3] !== 255) throw new Error("opaque_required");
          selected.push(pixels[i], pixels[i + 1], pixels[i + 2]);
        }
        const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(selected));
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      };
      const expectedPixels = await signature(source), avatarPixels = await signature(avatar);
      return { documentOrigin: performance.timeOrigin, expectedPixels, avatarPixels, matches: expectedPixels === avatarPixels };
    } finally { source.close(); }
  } catch { return unavailable(); }
}
