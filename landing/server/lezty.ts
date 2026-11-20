export type ProviderOptions = { key: string; fetcher?: typeof fetch };
export async function lezty(options: ProviderOptions, path: string, body?: unknown, requestId?: string): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher('https://api.leztypay.com/v1/transactions' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + options.key, Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': 'landing3.' + requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(12_000)
      : undefined,
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw Error(`provider_unavailable:${response.status}:redirect`);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await boundedText(response, 2_000)).slice(0, 240); } catch { await response.body?.cancel().catch(() => {}); }
    throw Error(`provider_unavailable:${response.status}:${detail.replace(/[\r\n]+/g, ' ')}`);
  }
  return JSON.parse(await boundedText(response, 384_000));
}
export async function boundedText(input: Request | Response, max: number) {
  const reader = input.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > max) throw Error('body_limit');
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
export async function signedEvent(secret: string, payload: string, header: string, now = Date.now()) {
  const fields = header.split(',').map(v => v.trim());
  const times = fields.filter(v => /^t=\d{1,12}$/.test(v));
  const sigs = fields.filter(v => /^v1=[0-9a-f]{64}$/i.test(v));
  if (times.length !== 1 || sigs.length === 0 || sigs.length > 8 || Math.abs(now / 1000 - Number(times[0].slice(2))) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const data = new TextEncoder().encode(times[0].slice(2) + '.' + payload);
  for (const sig of sigs) {
    const bytes = Uint8Array.from(sig.slice(3).match(/../g)!, octet => parseInt(octet, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, data)) return true;
  }
  return false;
}
