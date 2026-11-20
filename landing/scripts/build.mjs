import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, 'dist');
const preview = resolve(root, 'preview');
const result = await build({ root, configFile: false, publicDir: false, base: './', plugins: [react()], logLevel: 'warn', build: { write: false, minify: true, cssCodeSplit: false, assetsInlineLimit: 0, rollupOptions: { input: resolve(root, 'src/main.tsx'), output: { format: 'iife', entryFileNames: 'assets/app-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' } } } });
const output = (Array.isArray(result) ? result[0] : result).output;
const chunks = output.filter(item => item.type === 'chunk');
const styles = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
const pictures = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.png'));
if (chunks.length !== 1 || styles.length !== 1 || pictures.length !== 2 || output.length !== 4) throw Error('Unexpected output inventory');
const publicPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const localPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'self' about:";
let js = chunks[0].code, css = String(styles[0].source);
for (const picture of pictures) {
  const uri = 'data:image/png;base64,' + Buffer.from(picture.source).toString('base64');
  // JS/CSS live in assets/: Vite may reference the sibling image by basename.
  const name = picture.fileName.slice(picture.fileName.lastIndexOf('/') + 1);
  for (const reference of ['./' + picture.fileName, '/' + picture.fileName, picture.fileName, './' + name, '/' + name, name]) {
    js = js.replaceAll(reference, uri); css = css.replaceAll(reference, uri);
  }
  if (!js.includes(uri) && !css.includes(uri)) throw Error('Preview image not embedded: ' + picture.fileName);
}
function documentFor(inline) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="${inline ? localPolicy : publicPolicy}"><title>ResolvFlow · Checkout simulado da landing 3</title>${inline ? '<style>' + css + '</style>' : '<link rel="stylesheet" href="' + styles[0].fileName + '">'}</head><body><div id="root"></div>${inline ? '<script>' + js.replace(/<\/script/gi, '<\\/script') + '</script>' : '<script defer src="' + chunks[0].fileName + '"></script>'}</body></html>`;
}
const files = new Map(output.map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]));
files.set('index.html', documentFor(false));
files.set('_headers', `/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: ${publicPolicy}\n`);
await mkdir(dist, { recursive: true }); await mkdir(preview, { recursive: true });
const prior = await readFile(resolve(root, 'evidence/build-artifacts.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return { publicAssets: [] }; });
async function list(directory) { return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? list(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))).flat(); }
for (const old of await list(dist)) {
  if (!old.startsWith(dist + sep)) throw Error('Unsafe output path');
  const relative = old.slice(dist.length + 1).replaceAll('\\', '/');
  if (files.has(relative)) continue;
  if (!prior.publicAssets.some(item => item.path === relative)) throw Error('Unknown output: ' + relative);
  await unlink(old);
}
for (const [name, data] of files) { const target = resolve(dist, name); if (!target.startsWith(dist + sep)) throw Error('Unsafe output'); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data); }
await writeFile(resolve(preview, 'index.html'), documentFor(true));
const fixture = JSON.stringify(documentFor(true)).replaceAll('<', '\\u003c');
const harness = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${localPolicy}"><title>ResolvFlow · Revisão do checkout local</title><style>*{box-sizing:border-box}body{margin:0;background:#171b20;color:#eef0ed;font:14px/1.5 Arial,sans-serif}.controls{padding:16px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.controls h1{font-size:15px;margin:0 15px 0 0}button{min-height:44px;border:1px solid #697988;border-radius:5px;background:#25313c;color:inherit;font:inherit;padding:9px 13px;cursor:pointer}button[aria-pressed=true]{background:#ff6827;color:#171b20;border-color:#ffad85}button:focus-visible{outline:3px solid #ffbc99;outline-offset:3px}.note{margin:0;padding:0 20px 15px;color:#b5c1cb;font-size:12px}.canvas{padding:18px;overflow:auto;background:#313c47}.frame-wrap{width:1440px;margin:auto}iframe{display:block;width:100%;height:900px;border:0;background:#0c0e10}output{font-size:12px;color:#ffd4b9}</style></head><body><div class="controls"><h1>Landing 3 · checkout simulado</h1><button data-width="360" aria-pressed="false">360</button><button data-width="390" aria-pressed="false">390</button><button data-width="768" aria-pressed="false">768</button><button data-width="1440" aria-pressed="true">1440</button><button id="plans">Ir às propostas</button><button id="measure">Medir viewport</button><output id="measurement" aria-live="polite"></output></div><p class="note">Componente real compilado. Clique em Comprar · simulação. Os cenários de revisão ficam no formulário. Dados fixos, sem rede, cobrança ou acesso automático.</p><div class="canvas"><div class="frame-wrap" id="frame-wrap"><iframe id="preview" title="Landing com checkout de demonstração" sandbox="allow-scripts allow-same-origin"></iframe></div></div><script>const frame=document.getElementById('preview');frame.srcdoc=${fixture};const wrap=document.getElementById('frame-wrap');document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{wrap.style.width=button.dataset.width+'px';frame.style.height=Number(button.dataset.width)<500?'780px':'900px';document.querySelectorAll('[data-width]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.getElementById('measurement').textContent='Viewport '+button.dataset.width+' px';}));document.getElementById('plans').addEventListener('click',()=>{const target=frame.contentDocument.getElementById('planos');target?.focus();target?.scrollIntoView();});document.getElementById('measure').addEventListener('click',()=>{const doc=frame.contentDocument;const modal=doc.querySelector('dialog[open]');const width=frame.contentWindow.innerWidth;const content=doc.documentElement.scrollWidth;document.getElementById('measurement').textContent='Viewport '+width+' · conteúdo '+content+(modal?' · modal '+Math.round(modal.getBoundingClientRect().width)+' · scroll interno '+modal.scrollWidth:'');});</script></body></html>`;
await writeFile(resolve(preview, 'preview.html'), harness);
async function receipt(base, name) { const data = await readFile(resolve(base, name)); return { path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }; }
await writeFile(resolve(root, 'evidence/build-artifacts.json'), JSON.stringify({ builtAt: new Date().toISOString(), publicAssets: await Promise.all([...files.keys()].sort().map(name => receipt(dist, name))), previews: await Promise.all(['index.html','preview.html'].map(name => receipt(preview, name))), publicDir: false, externalOrigins: [], liveCheckout: false, deployed: false }, null, 2) + '\n');
console.log('LANDING_CHECKOUT_PREVIEW_READY ' + resolve(preview, 'preview.html'));
