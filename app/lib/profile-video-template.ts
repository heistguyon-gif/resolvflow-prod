/** One manually supplied identity per batch. No account lookup or remote images. */
export type ProfileVideoIdentity = { name: string; phrase: string; cta: string };
export type ProfileVariant = { accountId: string; name: string; username?: string; outputs: File[] };
export type ProfileBatchState = { enabled: boolean; busy: boolean; sources: readonly File[]; contextKey: string; mode?: "common" | "individual"; outputs?: File[]; selectionKey?: string; variants?: ProfileVariant[] };
export const PROFILE_PHRASE = "Vc nunca mais ficará triste depois que seguir essa página 🤣";
export const PROFILE_CTA = "continuação nos stories";
export type ProfileAccount = { id: string; ownerUserId?: string; username: string; displayName?: string | null; connectionStatus?: string; lifecycle?: string; archivedAt?: string | null };
export function profileSelectionKey(accounts: readonly ProfileAccount[]) { return JSON.stringify(accounts.map(account => [account.id, account.displayName || ""])); }
export function profileAccountsForWorkspace(accounts: readonly ProfileAccount[], selectedIds: readonly string[], workspace: string) {
  return accounts.filter(account => selectedIds.includes(account.id) && account.ownerUserId === workspace && !account.archivedAt && account.lifecycle !== "caida" && account.connectionStatus === "Conectada");
}
export function profileCampaignVariants(files: File[], batch: ProfileBatchState, contextKey: string, selected: readonly ProfileAccount[]) {
  if (batch.mode === "common") throw new Error("Nome comum usa uma única campanha com todos os perfis selecionados.");
  if (batch.busy || batch.sources !== files || batch.contextKey !== contextKey || batch.selectionKey !== profileSelectionKey(selected) || !selected.length || !batch.variants || batch.variants.length !== selected.length) throw new Error("Gere e revise os vídeos de todos os perfis. Há resultados pendentes ou desatualizados.");
  return selected.map(account => {
    const matches = batch.variants!.filter(variant => variant.accountId === account.id);
    if (matches.length !== 1) throw new Error("Associação dos vídeos ao perfil inválida.");
    const variant = matches[0];
    validateProfileIdentity({ name: variant.name, phrase: PROFILE_PHRASE, cta: PROFILE_CTA });
    profileCampaignFiles(files, { ...batch, mode: undefined, variants: undefined, outputs: variant.outputs }, contextKey);
    return variant;
  });
}

export function isProfileVideoPilot(user: { email?: unknown; profileVideoTemplate?: unknown } | null | undefined) {
  return user?.profileVideoTemplate === true && typeof user.email === "string" && ["lucasbgn.affiliate@gmail.com", "wendelmarques167@gmail.com", "south.negociosdigitais@gmail.com"].includes(user.email.trim().toLowerCase());
}

export function profileCampaignFiles(files: File[], batch: ProfileBatchState | null, contextKey: string, selected?: readonly ProfileAccount[]): File[] {
  if (!batch?.enabled) return files;
  if (batch.variants) throw new Error("Vídeos por perfil exigem campanhas separadas; não podem entrar no lote geral.");
  if (batch.mode === "individual") throw new Error("Gere os vídeos individuais antes de criar os rascunhos por perfil.");
  if (batch.mode === "common" && selected && (!selected.length || batch.selectionKey !== profileSelectionKey(selected))) throw new Error("Seleção de perfis alterada. Revise e gere o lote novamente.");
  if (batch.busy || batch.sources !== files || batch.contextKey !== contextKey || !batch.outputs || batch.outputs.length !== files.length || !batch.outputs.every(file => file instanceof File && file.type === "video/mp4" && file.size > 0)) {
    throw new Error("Gere todos os vídeos do template de perfil antes de salvar a campanha. Há resultados pendentes ou desatualizados.");
  }
  return batch.outputs;
}
export const PROFILE_FRAME = { width: 720, height: 1280, header: 384 } as const;
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function validateProfileIdentity(value: ProfileVideoIdentity) {
  if (typeof value.name === "string" && /[@＠]/u.test(value.name)) throw new Error("Nome: use o nome público sem arroba. Revise este campo.");
  for (const [label, text, max] of [
    ["Nome", value.name, 60], ["Frase", value.phrase, 180], ["Chamada", value.cta, 80],
  ] as const) {
    if (typeof text !== "string" || !text.trim()) throw new Error(`${label}: preencha este campo.`);
    if (text.length > max) throw new Error(`${label}: use até ${max} caracteres.`);
    const unsafeControl = [...text].some(char => {
      const code = char.codePointAt(0)!;
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127 || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    });
    if (unsafeControl) {
      throw new Error(`${label}: remova caracteres de controle.`);
    }
  }
}

export function validateProfileImageBytes(type: string, size: number, bytes: Uint8Array) {
  if (!size || size > PROFILE_AVATAR_MAX_BYTES) throw new Error("Foto: use um arquivo de até 5 MB.");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!((type === "image/png" && png) || (type === "image/jpeg" && jpeg) || (type === "image/webp" && webp))) {
    throw new Error("Foto inválida. Escolha PNG, JPEG ou WebP; SVG e endereços externos não são aceitos.");
  }
}

export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível preparar a imagem.")), "image/png"));
}

export async function prepareProfileAvatar(file: File): Promise<Blob> {
  validateProfileImageBytes(file.type, file.size, new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Foto inválida ou corrompida."); });
  try {
    if (bitmap.width < 32 || bitmap.height < 32 || bitmap.width * bitmap.height > 12_000_000) {
      throw new Error("Foto: use ao menos 32 × 32 pixels e no máximo 12 megapixels.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    // Re-encode pixels only: no metadata, external resources or original payload.
    return await canvasPng(canvas);
  } finally { bitmap.close(); }
}

export function fitProfileText(context: Pick<CanvasRenderingContext2D, "font" | "measureText">, text: string, width: number, maxLines: number, initialSize: number, minSize: number, weight: number) {
  for (let size = initialSize; size >= minSize; size -= 2) {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    const lines: string[] = [];
    let line = "";
    for (const word of text.trim().split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every(value => context.measureText(value).width <= width)) return { lines, size };
  }
  throw new Error("O texto não cabe na faixa. Encurte o campo indicado; nenhum texto será cortado.");
}

/** Center the visible glyph block, including ascenders/descenders, around the avatar. */
export function centeredProfileName(context: Pick<CanvasRenderingContext2D, "measureText">, lines: string[], size: number, centerY = 106) {
  const metrics = lines.map(line => context.measureText(line));
  const ascent = metrics[0]?.actualBoundingBoxAscent ?? size * 0.8;
  const descent = metrics.at(-1)?.actualBoundingBoxDescent ?? size * 0.2;
  const firstBaseline = centerY + (ascent - descent - (lines.length - 1) * size * 1.2) / 2;
  return lines.map((_, index) => firstBaseline + index * size * 1.2);
}

/** This exact PNG is used both by the preview and by FFmpeg. */
export async function createProfileHeader(identity: ProfileVideoIdentity, avatar: Blob): Promise<Blob> {
  validateProfileIdentity(identity);
  if (!avatar || avatar.type !== "image/png") throw new Error("Selecione uma foto válida.");
  const bitmap = await createImageBitmap(avatar);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_FRAME.width; canvas.height = PROFILE_FRAME.header;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível desenhar o template.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.save(); context.beginPath(); context.arc(118, 106, 54, 0, Math.PI * 2); context.clip();
    context.drawImage(bitmap, 64, 52, 108, 108); context.restore();
    context.fillStyle = "#111111"; context.textBaseline = "top";
    const draw = (label: string, text: string, width: number, maxLines: number, initial: number, min: number, weight: number, x: number, y: number, align: CanvasTextAlign, centerY?: number) => {
      let fitted;
      try { fitted = fitProfileText(context, text, width, maxLines, initial, min, weight); }
      catch { throw new Error(`${label}: o texto não cabe. Encurte antes de gerar.`); }
      context.textAlign = align;
      if (centerY !== undefined) {
        context.textBaseline = "alphabetic";
        const positions = centeredProfileName(context, fitted.lines, fitted.size, centerY);
        fitted.lines.forEach((line, index) => context.fillText(line, x, positions[index]));
        context.textBaseline = "top";
      } else fitted.lines.forEach((line, index) => context.fillText(line, x, y + index * fitted.size * 1.2));
    };
    draw("Nome", identity.name, 454, 2, 32, 26, 700, 194, 0, "left", 106);
    draw("Frase", identity.phrase, 592, 3, 32, 26, 400, 64, 190, "left");
    draw("Chamada", identity.cta, 592, 1, 30, 24, 700, 656, 328, "right");
    return await canvasPng(canvas);
  } finally { bitmap.close(); }
}

export function profileVideoCommand(input: string, header: string, output: string) {
  return [
    "-i", input, "-loop", "1", "-i", header,
    "-filter_complex", "[0:v]fps=20,scale=trunc(iw*sar/2)*2:ih,setsar=1,scale=720:896:force_original_aspect_ratio=increase:force_divisible_by=2,crop=720:896:(iw-ow)/2:(ih-oh)/2,pad=720:1280:0:384:color=white[base];[base][1:v]overlay=0:0:format=auto:shortest=1[outv]",
    "-map", "[outv]", "-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "20",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output,
  ];
}

export type ProfileVideoJob = { index: number; name: string; status: "waiting" | "rendering" | "done" | "failed" | "cancelled"; progress: number; error?: string; output?: File };
export type ProfileRenderer = (file: File, header: Blob, progress: (value: number) => void, signal: AbortSignal) => Promise<File>;

/** Sequential and bounded in concurrency, not in batch count. Never uploads. */
export async function renderProfileBatch(files: readonly File[], header: Blob, render: ProfileRenderer, signal: AbortSignal, onUpdate: (jobs: ProfileVideoJob[]) => void) {
  const jobs: ProfileVideoJob[] = files.map((file, index) => ({ index, name: file.name, status: "waiting", progress: 0 }));
  const emit = () => onUpdate(jobs.map(job => ({ ...job })));
  emit();
  for (let index = 0; index < files.length; index++) {
    if (signal.aborted) break;
    const job = jobs[index];
    job.status = "rendering"; emit();
    try {
      const output = await render(files[index], header, progress => { job.progress = Math.max(0, Math.min(1, progress)); emit(); }, signal);
      if (signal.aborted) break;
      job.output = output; job.progress = 1; job.status = "done";
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        job.status = "cancelled"; break;
      }
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Falha ao gerar este vídeo.";
    }
    emit();
  }
  for (const job of jobs) if (job.status === "waiting" || job.status === "rendering") job.status = "cancelled";
  emit();
  return jobs;
}
