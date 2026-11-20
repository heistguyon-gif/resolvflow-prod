import highlightManagementPage from "../extensions/story-bridge/instagram-highlight-management-page.js?raw";
import highlightManagementRunner from "../extensions/story-bridge/highlight-management-runner.js?raw";
import instagramHighlightPage from "../extensions/story-bridge/instagram-highlight-page.js?raw";
import manifest from "../extensions/story-bridge/manifest.json?raw";
import background from "../extensions/story-bridge/background.js?raw";
import core from "../extensions/story-bridge/bridge-core.js?raw";
import publisher from "../extensions/story-bridge/publisher.js?raw";
import renderHtml from "../extensions/story-bridge/render.html?raw";
import render from "../extensions/story-bridge/render.js?raw";
import metrics from "../extensions/story-bridge/sticker-metrics.js?raw";
import profileRunner from "../extensions/story-bridge/profile-runner.js?raw";
import photoProof from "../extensions/story-bridge/photo-proof.js?raw";
import profileUI from "../extensions/story-bridge/profile-ui.js?raw";
import instagramIdentity from "../extensions/story-bridge/instagram-identity.js?raw";

import instagramWebContext from "../extensions/story-bridge/instagram-web-context.js?raw";

export const STORY_EXTENSION_VERSION: string = JSON.parse(manifest).version;

// ZIP STORE (uncompressed): no Node APIs, runtime dependency, external service or file containing a credential.
const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size: number) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
export function createStoryExtensionZip(origin: string, token: string, updateOnly = false): Uint8Array<ArrayBuffer> {
  const parsed = new URL(origin);
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.protocol === "http:";
  const hosted = ["resolvflow.online", "top.resolvflow.online"].includes(parsed.hostname) && parsed.protocol === "https:" && !parsed.port;
  if ((!local && !hosted) || parsed.origin !== origin || !/^[0-9a-f]{64}$/.test(token)) throw new Error("Não foi possível preparar a extensão.");
  const files: Record<string, string> = {
    "instagram-highlight-management-page.js": highlightManagementPage, "highlight-management-runner.js": highlightManagementRunner,
    "manifest.json": manifest, "background.js": background, "bridge-core.js": core, "publisher.js": publisher,
    "render.html": renderHtml, "render.js": render, "sticker-metrics.js": metrics,
    "profile-runner.js": profileRunner, "profile-ui.js": profileUI, "photo-proof.js": photoProof,
    "instagram-identity.js": instagramIdentity, "instagram-web-context.js": instagramWebContext, "instagram-highlight-page.js": instagramHighlightPage,
    ...(updateOnly ? {} : { "bridge-config.json": JSON.stringify({ bridgeOrigin: origin, credential: token }) }),
    "INSTALAR.txt": updateOnly ? "ATUALIZAÇÃO SEM ROTAÇÃO. Sobreponha estes arquivos no MESMO diretório da extensão já instalada. Preserve bridge-config.json e a instalação/storage. Recarregue a mesma extensão e confira a identidade dos navegadores antes de selecionar. Não remover/reinstalar nem gerar nova credencial para atualizar. Perfil é piloto bio/foto; Story e destaque mantêm seu fluxo. DOM de perfil ainda requer validação real.\r\n" : "Instale este ZIP nas Extensões do time do AdsPower e marque nos perfis. Não há popup. Use um perfil Instagram de teste antes de uso geral. Este pacote é privado do workspace; não compartilhe nem coloque no Git. Baixar novamente na ferramenta invalida o pacote anterior.\r\n",
  };
  const localParts: Uint8Array[] = [], centralParts: Uint8Array[] = [];
  let offset = 0, centralSize = 0;
  for (const [filename, content] of Object.entries(files)) {
    const name = encoder.encode(filename), data = encoder.encode(content), crc = crc32(data);
    const localHeader = header(30), h = localHeader.view;
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    const centralHeader = header(46), c = centralHeader.view;
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    localParts.push(localHeader.bytes, name, data); centralParts.push(centralHeader.bytes, name);
    offset += 30 + name.length + data.length; centralSize += 46 + name.length;
  }
  const end = header(22), e = end.view, count = Object.keys(files).length;
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, count, true); e.setUint16(10, count, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + 22); let position = 0;
  for (const part of [...localParts, ...centralParts, end.bytes]) { output.set(part, position); position += part.length; }
  return output;
}
export function createStoryExtensionUpdateZip(origin: string) {
  // Only the ZIP's code is emitted; the placeholder is never put into an update file.
  return createStoryExtensionZip(origin, "0".repeat(64), true);
}
