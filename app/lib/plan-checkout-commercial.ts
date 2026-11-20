import { BodyLimitError, readLimitedBody } from './request-body';

const host = 'https://resolvflow.online';
const headers = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};
export type PlanCommercialBinding = { fetch(request: Request): Promise<Response> };
const error = (status: number, code: string) => Response.json({ error: code }, { status, headers });

export async function forwardPlanCommercial(request: Request, binding: PlanCommercialBinding | undefined) {
  const url = new URL(request.url);
  if (url.origin !== host) return error(404, 'not_found');
  if (!binding) return error(503, 'checkout_unavailable');
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') return error(405, 'method_not_allowed');
  const path = url.pathname;
  if (!path.startsWith('/api/checkout/')) return error(404, 'not_found');
  if (path.startsWith('/api/checkout/webhooks/') || path.startsWith('/api/checkout/support')) return error(404, 'not_found');
  if (method === 'POST' && (request.headers.get('origin') !== host || request.headers.get('sec-fetch-site') === 'cross-site')) {
    return error(403, 'invalid_origin');
  }
  const upstreamHeaders = new Headers();
  for (const name of ['accept', 'origin', 'sec-fetch-site', 'content-type', 'cf-connecting-ip']) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }
  const token = request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => /^__Host-rf-plan-checkout=[a-f0-9]{64}$/.test(value));
  if (token) upstreamHeaders.set('cookie', token);
  try {
    const body = method === 'POST' ? (await readLimitedBody(request, 4096)).buffer : undefined;
    const upstream = await binding.fetch(new Request(url, { method, headers: upstreamHeaders, body, redirect: 'manual' }));
    const responseHeaders = new Headers(upstream.headers);
    for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
    responseHeaders.set('vary', 'Cookie');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (err) {
    return err instanceof BodyLimitError ? error(413, 'invalid_input') : error(503, 'checkout_unavailable');
  }
}
