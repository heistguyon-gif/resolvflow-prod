export type VideoOverlayTemplate = "headline" | "news" | "clean";
export type ImageReelMotion = "static" | "zoom_in" | "zoom_out" | "drift";

export type VideoOverlayOptions = {
  copy: string;
  cta?: string;
  template: VideoOverlayTemplate;
};

export type ImageReelOptions = {
  durationSeconds: number;
  motion: ImageReelMotion;
};

export type VideoMusicOptions = {
  musicFile: File;
  musicVolume: number;
  originalVolume: number;
  startSeconds: number;
  fadeSeconds: number;
  loop: boolean;
};

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function wrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) { lines.push(current); current = word; }
    else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number, initialSize: number) {
  let fontSize = initialSize;
  let lines: string[] = [];
  while (fontSize >= 42) {
    context.font = `800 ${fontSize}px Arial, sans-serif`;
    lines = wrappedLines(context, text, maxWidth);
    if (lines.length <= maxLines) break;
    fontSize -= 4;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 3 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trim()}…`;
  }
  return { fontSize, lines };
}

async function createOverlay(options: VideoOverlayOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador não conseguiu preparar o template do vídeo.");
  const copy = options.copy.trim();
  if (!copy) throw new Error("Informe a copy que deve aparecer no vídeo.");
  const maxWidth = 900;
  const isNews = options.template === "news";
  const isClean = options.template === "clean";
  const fitted = fitText(context, copy, maxWidth, isClean ? 5 : 4, isNews ? 74 : 82);
  const lineHeight = fitted.fontSize * 1.14;
  const copyHeight = fitted.lines.length * lineHeight;
  const boxHeight = copyHeight + (isNews ? 210 : 170);
  const boxY = options.template === "headline" ? 150 : options.template === "news" ? 1920 - boxHeight - (options.cta ? 300 : 170) : (1920 - boxHeight) / 2;

  context.save();
  if (isClean) {
    context.shadowColor = "rgba(0,0,0,.9)"; context.shadowBlur = 22; context.shadowOffsetY = 5;
  } else {
    context.fillStyle = isNews ? "rgba(255,255,255,.96)" : "rgba(9,12,15,.90)";
    roundedRect(context, 55, boxY, 970, boxHeight, 42);
    context.fillStyle = "#ff8738";
    roundedRect(context, 88, boxY + 42, isNews ? 180 : 230, 52, 18);
    context.fillStyle = isNews ? "#11151a" : "#ffffff";
    context.font = "800 28px Arial, sans-serif";
    context.fillText(isNews ? "AGORA" : "DESTAQUE", 115, boxY + 78);
  }

  context.font = `800 ${fitted.fontSize}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = isNews ? "#11151a" : "#ffffff";
  const textY = boxY + (isClean ? 70 : 120);
  fitted.lines.forEach((line, index) => context.fillText(line, 540, textY + index * lineHeight));
  context.restore();

  if (options.cta?.trim()) {
    context.fillStyle = "rgba(255,135,56,.96)";
    roundedRect(context, 155, 1685, 770, 88, 26);
    context.fillStyle = "#17110d"; context.font = "800 34px Arial, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(options.cta.trim().slice(0, 70), 540, 1729);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível gerar a camada de texto.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const coreBaseUrl = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((error) => { ffmpegPromise = null; throw error; });
  }
  return ffmpegPromise;
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "video";
}

function fileDataText(data: Awaited<ReturnType<FFmpegInstance["readFile"]>>) {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

async function probeDuration(ffmpeg: FFmpegInstance, inputName: string, outputName: string) {
  const exitCode = await ffmpeg.ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputName, "-o", outputName]);
  if (exitCode !== 0) throw new Error("Não foi possível identificar a duração da mídia.");
  const duration = Number.parseFloat(fileDataText(await ffmpeg.readFile(outputName)).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("A duração da mídia é inválida.");
  return duration;
}

async function probeHasAudio(ffmpeg: FFmpegInstance, inputName: string, outputName: string) {
  const exitCode = await ffmpeg.ffprobe(["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", inputName, "-o", outputName]);
  if (exitCode !== 0) return false;
  return fileDataText(await ffmpeg.readFile(outputName)).trim() === "audio";
}

function audioExtension(file: File) {
  if (file.type === "audio/mpeg" || /\.mp3$/i.test(file.name)) return "mp3";
  if (["audio/mp4", "audio/x-m4a"].includes(file.type) || /\.m4a$/i.test(file.name)) return "m4a";
  return "wav";
}

export async function renderVideoWithCopy(file: File, options: VideoOverlayOptions, onProgress?: (progress: number) => void, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
  onProgress?.(0.02);
  const [{ fetchFile }, ffmpeg, overlay] = await Promise.all([import("@ffmpeg/util"), getFFmpeg(), createOverlay(options)]);
  if (signal?.aborted) { ffmpeg.terminate(); ffmpegPromise = null; throw new DOMException("Geração interrompida.", "AbortError"); }
  onProgress?.(0.08);
  const jobId = crypto.randomUUID().slice(0, 8);
  const inputExtension = file.type === "video/quicktime" ? "mov" : "mp4";
  const inputName = `input-${jobId}.${inputExtension}`;
  const overlayName = `overlay-${jobId}.png`;
  const outputName = `output-${jobId}.mp4`;
  let interrupted = false;
  let timedOut = false;
  const stopEngine = () => { interrupted = true; ffmpeg.terminate(); ffmpegPromise = null; };
  const abortListener = () => stopEngine();
  const progressListener = ({ progress }: { progress: number }) => onProgress?.(0.12 + Math.max(0, Math.min(1, progress)) * 0.86);
  ffmpeg.on("progress", progressListener);
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.writeFile(overlayName, overlay);
    if (signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
    onProgress?.(0.12);
    const timeoutId = window.setTimeout(() => { timedOut = true; stopEngine(); }, 180_000);
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec([
        "-i", inputName,
        "-loop", "1", "-i", overlayName,
        "-filter_complex", "[0:v]fps=20,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[base];[1:v]scale=720:1280[graphic];[base][graphic]overlay=0:0:format=auto:shortest=1[outv]",
        "-map", "[outv]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-r", "20",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outputName,
      ]);
    } catch (error) {
      if (timedOut) throw new Error("Este vídeo levou mais de 3 minutos para gerar. Tente um arquivo mais curto ou menor.");
      if (interrupted || signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (exitCode !== 0) throw new Error("O motor de vídeo não conseguiu concluir a renderização.");
    const data = await ffmpeg.readFile(outputName);
    if (!(data instanceof Uint8Array)) throw new Error("O arquivo final não pôde ser lido.");
    const output = new File([data.slice().buffer], `nexoflow-${safeBaseName(file.name)}.mp4`, { type: "video/mp4", lastModified: Date.now() });
    if (output.size > 100 * 1024 * 1024) throw new Error(`${file.name} gerou um arquivo maior que 100 MB. Use um vídeo menor ou mais curto.`);
    onProgress?.(1);
    return output;
  } finally {
    signal?.removeEventListener("abort", abortListener);
    if (!interrupted) {
      ffmpeg.off("progress", progressListener);
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(overlayName), ffmpeg.deleteFile(outputName)]);
    }
  }
}

export async function renderImageAsReel(file: File, options: ImageReelOptions, onProgress?: (progress: number) => void, signal?: AbortSignal) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} não é uma imagem compatível.`);
  if (signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
  const durationSeconds = Math.min(15, Math.max(3, Math.round(options.durationSeconds || 7)));
  const frames = durationSeconds * 20;
  const videoFilter = options.motion === "static"
    ? "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,fps=20,setsar=1,format=yuv420p"
    : (() => {
        const motionFilter = options.motion === "zoom_out"
          ? `zoompan=z='if(eq(on,0),1.10,max(1.0,zoom-0.0008))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=20`
          : options.motion === "drift"
            ? `zoompan=z='1.07':x='(iw-iw/zoom)*(on/${frames})':y='(ih-ih/zoom)/2':d=${frames}:s=720x1280:fps=20`
            : `zoompan=z='min(zoom+0.0008,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=20`;
        return `scale=850:1512:force_original_aspect_ratio=increase,crop=850:1512,${motionFilter},format=yuv420p`;
      })();
  onProgress?.(0.03);
  const [{ fetchFile }, ffmpeg] = await Promise.all([import("@ffmpeg/util"), getFFmpeg()]);
  if (signal?.aborted) { ffmpeg.terminate(); ffmpegPromise = null; throw new DOMException("Geração interrompida.", "AbortError"); }
  const jobId = crypto.randomUUID().slice(0, 8);
  const inputExtension = file.type === "image/png" ? "png" : "jpg";
  const inputName = `image-${jobId}.${inputExtension}`;
  const outputName = `image-reel-${jobId}.mp4`;
  let interrupted = false;
  let timedOut = false;
  const stopEngine = () => { interrupted = true; ffmpeg.terminate(); ffmpegPromise = null; };
  const abortListener = () => stopEngine();
  const progressListener = ({ progress }: { progress: number }) => onProgress?.(0.08 + Math.max(0, Math.min(1, progress)) * 0.90);
  ffmpeg.on("progress", progressListener);
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    if (signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
    onProgress?.(0.08);
    const timeoutId = window.setTimeout(() => { timedOut = true; stopEngine(); }, 120_000);
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec([
        "-loop", "1", "-i", inputName,
        "-t", String(durationSeconds),
        "-vf", videoFilter,
        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-r", "20", "-movflags", "+faststart", outputName,
      ]);
    } catch (error) {
      if (timedOut) throw new Error("A conversão da imagem levou mais de 2 minutos. Tente uma imagem menor.");
      if (interrupted || signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (exitCode !== 0) throw new Error("Não foi possível transformar esta imagem em Reel.");
    const data = await ffmpeg.readFile(outputName);
    if (!(data instanceof Uint8Array)) throw new Error("O Reel gerado não pôde ser lido.");
    const output = new File([data.slice().buffer], `nexoflow-${safeBaseName(file.name)}-reel.mp4`, { type: "video/mp4", lastModified: Date.now() });
    if (output.size > 100 * 1024 * 1024) throw new Error(`${file.name} gerou um Reel maior que 100 MB.`);
    onProgress?.(1);
    return output;
  } finally {
    signal?.removeEventListener("abort", abortListener);
    if (!interrupted) {
      ffmpeg.off("progress", progressListener);
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    }
  }
}

export async function renderVideoWithMusic(file: File, options: VideoMusicOptions, onProgress?: (progress: number) => void, signal?: AbortSignal) {
  const supportedAudio = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/wave", "audio/x-wav"];
  if (!supportedAudio.includes(options.musicFile.type) && !/\.(mp3|m4a|wav)$/i.test(options.musicFile.name)) throw new Error(`${options.musicFile.name} não é uma trilha MP3, M4A ou WAV compatível.`);
  if (signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
  onProgress?.(0.02);
  const [{ fetchFile }, ffmpeg] = await Promise.all([import("@ffmpeg/util"), getFFmpeg()]);
  if (signal?.aborted) { ffmpeg.terminate(); ffmpegPromise = null; throw new DOMException("Geração interrompida.", "AbortError"); }
  const jobId = crypto.randomUUID().slice(0, 8);
  const inputName = `music-video-${jobId}.${file.type === "video/quicktime" || /\.mov$/i.test(file.name) ? "mov" : "mp4"}`;
  const musicName = `music-${jobId}.${audioExtension(options.musicFile)}`;
  const outputName = `music-output-${jobId}.mp4`;
  const videoDurationName = `video-duration-${jobId}.txt`;
  const musicDurationName = `music-duration-${jobId}.txt`;
  const audioProbeName = `audio-probe-${jobId}.txt`;
  const temporaryFiles = [inputName, musicName, outputName, videoDurationName, musicDurationName, audioProbeName];
  let interrupted = false;
  let timedOut = false;
  const stopEngine = () => { interrupted = true; ffmpeg.terminate(); ffmpegPromise = null; };
  const abortListener = () => stopEngine();
  const progressListener = ({ progress }: { progress: number }) => onProgress?.(0.12 + Math.max(0, Math.min(1, progress)) * 0.86);
  ffmpeg.on("progress", progressListener);
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    await Promise.all([
      ffmpeg.writeFile(inputName, await fetchFile(file)),
      ffmpeg.writeFile(musicName, await fetchFile(options.musicFile)),
    ]);
    const videoDuration = await probeDuration(ffmpeg, inputName, videoDurationName);
    const musicDuration = await probeDuration(ffmpeg, musicName, musicDurationName);
    const hasOriginalAudio = await probeHasAudio(ffmpeg, inputName, audioProbeName);
    if (signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
    const requestedStart = Math.max(0, Number(options.startSeconds) || 0);
    if (!options.loop && requestedStart >= musicDuration) throw new Error("O início escolhido está depois do fim da música.");
    const musicStart = options.loop ? requestedStart % musicDuration : requestedStart;
    const availableMusic = options.loop ? videoDuration : Math.min(videoDuration, musicDuration - musicStart);
    const fade = Math.max(0, Math.min(Number(options.fadeSeconds) || 0, availableMusic / 2));
    const musicVolume = Math.max(0, Math.min(100, Number(options.musicVolume) || 0)) / 100;
    const originalVolume = Math.max(0, Math.min(100, Number(options.originalVolume) || 0)) / 100;
    const fadeFilters = fade > 0 ? `,afade=t=in:st=0:d=${fade.toFixed(3)},afade=t=out:st=${Math.max(0, availableMusic - fade).toFixed(3)}:d=${fade.toFixed(3)}` : "";
    const musicFilter = `[1:a]volume=${musicVolume.toFixed(3)},atrim=duration=${availableMusic.toFixed(3)},asetpts=N/SR/TB,aresample=48000${fadeFilters},apad=pad_dur=${videoDuration.toFixed(3)},atrim=duration=${videoDuration.toFixed(3)}[music]`;
    const mixOriginal = hasOriginalAudio && originalVolume > 0;
    const audioFilter = mixOriginal
      ? `${musicFilter};[0:a]volume=${originalVolume.toFixed(3)},aresample=48000,apad=pad_dur=${videoDuration.toFixed(3)},atrim=duration=${videoDuration.toFixed(3)}[original];[original][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
      : `${musicFilter};[music]anull[aout]`;
    const musicInput = options.loop
      ? ["-stream_loop", "-1", "-ss", musicStart.toFixed(3), "-i", musicName]
      : ["-ss", musicStart.toFixed(3), "-i", musicName];
    onProgress?.(0.12);
    const timeoutId = window.setTimeout(() => { timedOut = true; stopEngine(); }, 180_000);
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec([
        "-i", inputName, ...musicInput,
        "-filter_complex", audioFilter,
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-t", videoDuration.toFixed(3), "-movflags", "+faststart", outputName,
      ]);
    } catch (error) {
      if (timedOut) throw new Error("A trilha levou mais de 3 minutos para ser incorporada. Tente um áudio ou vídeo menor.");
      if (interrupted || signal?.aborted) throw new DOMException("Geração interrompida.", "AbortError");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (exitCode !== 0) throw new Error("Não foi possível incorporar a trilha ao Reel.");
    const data = await ffmpeg.readFile(outputName);
    if (!(data instanceof Uint8Array)) throw new Error("O Reel com música não pôde ser lido.");
    const output = new File([data.slice().buffer], `nexoflow-${safeBaseName(file.name)}-music.mp4`, { type: "video/mp4", lastModified: Date.now() });
    if (output.size > 100 * 1024 * 1024) throw new Error(`${file.name} ficou maior que 100 MB depois da trilha.`);
    onProgress?.(1);
    return output;
  } finally {
    signal?.removeEventListener("abort", abortListener);
    if (!interrupted) {
      ffmpeg.off("progress", progressListener);
      await Promise.allSettled(temporaryFiles.map((name) => ffmpeg.deleteFile(name)));
    }
  }
}

export function videoFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
