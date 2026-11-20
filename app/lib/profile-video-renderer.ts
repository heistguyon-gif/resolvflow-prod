import { profileVideoCommand, type ProfileRenderer } from "./profile-video-template";

type Engine = Pick<import("@ffmpeg/ffmpeg").FFmpeg, "on" | "off" | "writeFile" | "exec" | "readFile" | "deleteFile" | "terminate">;
type EngineFactory = (signal: AbortSignal) => Promise<Engine>;

async function loadEngine(signal: AbortSignal): Promise<Engine> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  signal.throwIfAborted();
  const engine = new FFmpeg();
  const urls: string[] = [];
  const stop = () => engine.terminate();
  signal.addEventListener("abort", stop, { once: true });
  try {
    const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    for (const [file, type] of [["ffmpeg-core.js", "text/javascript"], ["ffmpeg-core.wasm", "application/wasm"]]) {
      const response = await fetch(`${base}/${file}`, { signal, credentials: "omit" });
      if (!response.ok) throw new Error("Não foi possível carregar o motor de vídeo.");
      const bytes = await response.arrayBuffer();
      signal.throwIfAborted();
      urls.push(URL.createObjectURL(new Blob([bytes], { type })));
    }
    await engine.load({ coreURL: urls[0], wasmURL: urls[1] }, { signal });
    signal.throwIfAborted();
    return engine;
  } catch (error) { engine.terminate(); throw error; }
  finally { signal.removeEventListener("abort", stop); urls.forEach(url => URL.revokeObjectURL(url)); }
}

/** A batch owns its engine; cancellation cannot terminate the legacy generator. */
export function createProfileVideoRenderer(factory: EngineFactory = loadEngine, timeoutMs = 180_000) {
  let engine: Engine | null = null;
  let busy = false;
  const dispose = () => { engine?.terminate(); engine = null; };
  const render: ProfileRenderer = async (file, header, onProgress, signal) => {
    signal.throwIfAborted();
    if (busy) throw new Error("Aguarde o vídeo atual antes de iniciar outro.");
    if (!file.type.startsWith("video/") || !file.size || file.size > 100 * 1024 * 1024) throw new Error("Selecione um vídeo válido de até 100 MB.");
    if (header.type !== "image/png" || !header.size) throw new Error("Prepare a prévia do template antes de gerar.");
    busy = true;
    const controller = new AbortController();
    const cancel = () => controller.abort(new DOMException("Geração interrompida.", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("Este vídeo excedeu 3 minutos. Tente um arquivo menor.")), timeoutMs);
    let rejectAbort: (error: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const stop = () => { dispose(); rejectAbort(controller.signal.reason); };
    controller.signal.addEventListener("abort", stop, { once: true });
    const token = crypto.randomUUID();
    const input = `profile-${token}.input`;
    const graphic = `profile-${token}.png`;
    const output = `profile-${token}.mp4`;
    const progress = ({ progress: value }: { progress: number }) => onProgress(0.1 + Math.max(0, Math.min(1, value)) * 0.88);
    const work = async () => {
      onProgress(0.02);
      if (!engine) {
        const loaded = await factory(controller.signal);
        if (controller.signal.aborted) { loaded.terminate(); controller.signal.throwIfAborted(); }
        engine = loaded;
      }
      const current = engine;
      current.on("progress", progress);
      try {
        const inputBytes = new Uint8Array(await file.arrayBuffer());
        controller.signal.throwIfAborted();
        await current.writeFile(input, inputBytes, { signal: controller.signal });
        await current.writeFile(graphic, new Uint8Array(await header.arrayBuffer()), { signal: controller.signal });
        controller.signal.throwIfAborted();
        const code = await current.exec(profileVideoCommand(input, graphic, output), -1, { signal: controller.signal });
        if (code !== 0) throw new Error("O motor não conseguiu renderizar este vídeo.");
        const bytes = await current.readFile(output, "binary", { signal: controller.signal });
        controller.signal.throwIfAborted();
        if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("O vídeo gerado está vazio ou inválido.");
        if (bytes.length > 100 * 1024 * 1024) throw new Error("O vídeo gerado excede 100 MB.");
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 70) || "video";
        onProgress(1);
        return new File([bytes.slice().buffer], `perfil-${name}.mp4`, { type: "video/mp4" });
      } finally {
        current.off("progress", progress);
        if (!controller.signal.aborted) await Promise.allSettled([input, graphic, output].map(path => current.deleteFile(path)));
      }
    };
    try { return await Promise.race([work(), aborted]); }
    catch (error) { dispose(); throw error; }
    finally {
      clearTimeout(timer); signal.removeEventListener("abort", cancel); controller.signal.removeEventListener("abort", stop); busy = false;
    }
  };
  return { render, dispose };
}
