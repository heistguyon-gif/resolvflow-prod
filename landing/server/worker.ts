import { CATALOG_VERSION, TERMS_VERSION, FIXED_PLANS, PILOT_ACK_VERSION, PILOT_EMAIL } from '../src/checkout/catalog';
import { boundedText, lezty, signedEvent } from './lezty';

const ORIGIN = 'https://resolvflow-landing-variants-20261118.lucasbgn-affiliate.workers.dev';
const COOKIE = '__Host-rf-plan-checkout';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/;
const TX = /^[A-Za-z0-9_-]{1,128}$/;
type Plan = typeof FIXED_PLANS[number];
type State = 'creating' | 'pending' | 'uncertain' | 'paid' | 'expired' | 'failed' | 'refunded' | 'chargeback';
type Pix = { copyPaste: string; expiresAt: string };
type Order = {
  id: string; plan: Plan; fingerprint: string; merchant: string;
  buyer: { name: string; email: string; username: string };
  status: State; transactionId?: string; pix?: Pix; checkedAt?: number; checkAfter?: number;
  createdAt: number; catalogVersion: string; termsVersion: string; paidAt?: number; handledAt?: number;
};
type Stored = { etag: string; json(): Promise<unknown> };
type Bucket = {
  get(key: string): Promise<Stored | null>;
  put(key: string, value: string, options: { onlyIf: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<unknown>;
  list(options: { prefix: string; limit: number; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};
export type Bindings = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  PLAN_ORDERS?: Bucket;
  PLAN_RATE?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PLAN_CHECKOUT_ENABLED?: string;
  PLAN_PRIVATE_PILOT_ENABLED?: string;
  PLAN_LEZTY_API_KEY?: string; PLAN_LEZTY_WEBHOOK_SECRET?: string; PLAN_LEZTY_MERCHANT_VERSION?: string;
  PLAN_BRAVO_MERCHANT_VERSION?: string;
  PLAN_PIX_BRAVO?: { fetch(request: Request): Promise<Response> };
  PLAN_DATA_KEY_HEX?: string; PLAN_SUPPORT_TOKEN?: string; PLAN_PRIVACY_URL?: string; PLAN_SALES_TERMS_URL?: string;
};
const encode = (value: string) => new TextEncoder().encode(value);
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g)!, x => parseInt(x, 16));
const hash = async (s: string) => hex(await crypto.subtle.digest('SHA-256', encode(s)));
const json = (value: unknown, status = 200, extra?: Record<string,string>) => Response.json(value, { status, headers: { 'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', ...extra } });
class CheckoutError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
const reject = (code: string, status = 400): never => { throw new CheckoutError(code, status); };
function fields(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('invalid_input');
  return value as Record<string,unknown>;
}
const exact = (value: Record<string,unknown>, allowed: string[]) => {
  if (Object.keys(value).some(k => !allowed.includes(k))) reject('invalid_input');
};
function field(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || [...value].some(c => c.charCodeAt(0) < 32)) return reject('invalid_input');
  return value.trim();
}
function documentDigits(value: unknown) {
  const raw = field(value, 11, 24);
  if (!/^[0-9./-]+$/.test(raw)) return reject('invalid_document');
  const digits = raw.replace(/\D/g, '');
  if (!/^(?:\d{11}|\d{14})$/.test(digits) || /^(\d)\1+$/.test(digits)) return reject('invalid_document');
  function check(length: number, weights: readonly number[]) {
    const remainder = [...digits.slice(0, length)].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 11;
    return Number(digits[length]) === (remainder < 2 ? 0 : 11 - remainder);
  }
  const cpf = [11,10,9,8,7,6,5,4,3,2];
  const cnpj = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  if (digits.length === 11 ? !check(9, cpf.slice(1)) || !check(10, cpf) : !check(12, cnpj.slice(1)) || !check(13, cnpj)) return reject('invalid_document');
  return digits;
}
function dto(o: Order, now: number) {
  const expired = o.status === 'pending' && o.pix && Date.parse(o.pix.expiresAt) <= now;
  return { id:o.id, plan:o.plan, currency:'BRL', status:expired ? 'expired' : o.status === 'creating' && now - o.createdAt > 20_000 ? 'uncertain' : o.status,
    pix: o.status === 'pending' && !expired ? o.pix ?? null : null,
    fulfillment: o.status === 'paid' ? o.handledAt ? 'handled_manually' : 'pending_review' : 'not_started' };
}
function session(request: Request) {
  const candidates = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE+'='));
  const value = candidates[0]?.slice(COOKIE.length+1);
  return candidates.length === 1 && value && HEX.test(value) ? value : null;
}
function secureEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function httpsUrl(value: string | undefined) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export type CheckoutMode = 'public' | 'private' | 'commercial';
function configured(env: Bindings, mode: CheckoutMode) {
  const base = !!(env.PLAN_ORDERS && env.PLAN_RATE && env.PLAN_DATA_KEY_HEX && HEX.test(env.PLAN_DATA_KEY_HEX) && env.PLAN_SUPPORT_TOKEN && HEX.test(env.PLAN_SUPPORT_TOKEN));
  if (mode === 'commercial') {
    // Commercial plans use EYT through the ops service binding (EYT_* secrets on ops).
    return base && Boolean(env.PLAN_PIX_BRAVO) && Boolean(env.PLAN_BRAVO_MERCHANT_VERSION || 'landing-eyt-v1');
  }
  return base && !!env.PLAN_LEZTY_API_KEY?.startsWith('sk_live_') && !!env.PLAN_LEZTY_WEBHOOK_SECRET && !!env.PLAN_LEZTY_MERCHANT_VERSION;
}
type BravoCharge = { id: string; status: State; pix: { payload: string; expires_at: string } | null };
async function bravoCharge(binding: NonNullable<Bindings['PLAN_PIX_BRAVO']>, path: string, body?: unknown): Promise<BravoCharge> {
  const response = await binding.fetch(new Request('https://plan-pix-bravo.internal/__internal/plan-pix-bravo' + path, {
    method: body ? 'POST' : 'GET',
    // Service binding to the ops Worker's `PlanPixBravo` named entrypoint: not
    // publicly routable, so no shared header/secret travels with the request.
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }));
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw Error(`provider_unavailable:${response.status}:${JSON.stringify(payload).slice(0, 180)}`);
  const id = String(payload.id || '');
  const status = String(payload.status || '') as State;
  if (!TX.test(id) || !['pending', 'paid', 'expired', 'failed', 'refunded', 'chargeback'].includes(status)) {
    throw Error('provider_unavailable:502:unverified_transaction');
  }
  const pix = payload.pix && typeof payload.pix === 'object' ? payload.pix as { payload?: string; expires_at?: string } : null;
  return {
    id,
    status,
    pix: status === 'pending' && pix?.payload && pix.expires_at ? { payload: pix.payload, expires_at: pix.expires_at } : null,
  };
}
const terminal = new Set<State>(['paid','expired','failed','refunded','chargeback']);
function transaction(value: unknown, o: Order) {
  const tx = fields(value), meta = fields(tx.metadata);
  const id = field(tx.id, 1, 128);
  if (!TX.test(id) || tx.object !== 'transaction' || tx.mode !== 'live' || tx.payment_method !== 'pix' ||
      (tx.currency !== undefined && tx.currency !== 'BRL') || tx.amount !== o.plan.amountCents ||
      meta.purpose !== 'saas_plan' || meta.order_id !== o.id || meta.merchant_version !== o.merchant ||
      (o.transactionId && o.transactionId !== id)) return reject('unverified_transaction', 502);
  return { tx, id };
}
export function createCheckout(fetcher: typeof fetch = fetch, now = Date.now, mode: CheckoutMode | boolean = 'public') {
  const resolved: CheckoutMode = mode === true ? 'private' : mode === false ? 'public' : mode;
  const privatePilot = resolved === 'private';
  const commercial = resolved === 'commercial';
  const origin = resolved === 'public' ? ORIGIN : 'https://resolvflow.online';
  const termsVersion = privatePilot ? PILOT_ACK_VERSION : TERMS_VERSION;
  return {
    async fetch(request: Request, env: Bindings) {
      const url = new URL(request.url);
      const route = '/api/checkout';
      const path = url.pathname;
      const merchantVersion = commercial
        ? (env.PLAN_BRAVO_MERCHANT_VERSION || 'landing-eyt-v1')
        : env.PLAN_LEZTY_MERCHANT_VERSION!;
      if (path === '/_plans-private' || path.startsWith('/_plans-private/')) return json({error:'not_found'},404);
      if (!path.startsWith(route + '/')) {
        // Ads keep the workers.dev URL; only /3 lands on the live /planos funnel (Pixel PageView).
        // Hash (#demo) never reaches the server — browser requests /3/ and follows Location to /planos.
        if ((path === '/3' || path === '/3/') && (request.method === 'GET' || request.method === 'HEAD')) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: 'https://resolvflow.online/planos',
              'Cache-Control': 'private, no-store',
              'Referrer-Policy': 'no-referrer',
              'X-Content-Type-Options': 'nosniff',
              'X-Robots-Tag': 'noindex, nofollow',
            },
          });
        }
        return env.ASSETS.fetch(request);
      }
      try {
        if (url.origin !== origin) return reject('invalid_host',403);
        const webhookPath = path === route+'/webhooks/leztypay';
        const isWebhook = webhookPath && request.method === 'POST';
        const isSupport = path === route+'/support' || path.startsWith(route+'/support/');
        if (request.method === 'POST' && !isWebhook && !isSupport &&
            (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('content-type')?.split(';')[0] !== 'application/json')) return reject('invalid_origin',403);
        const publicConfigured = httpsUrl(env.PLAN_PRIVACY_URL) && httpsUrl(env.PLAN_SALES_TERMS_URL);
        const enabled = configured(env, resolved) && (privatePilot ? env.PLAN_PRIVATE_PILOT_ENABLED === 'true' : publicConfigured && env.PLAN_CHECKOUT_ENABLED === 'true');
        if (path === route+'/plans' && request.method === 'GET') return json({ version:CATALOG_VERSION, termsVersion, enabled, privatePilot, plans:FIXED_PLANS, privacyUrl:!privatePilot && enabled ? env.PLAN_PRIVACY_URL : null, salesTermsUrl:!privatePilot && enabled ? env.PLAN_SALES_TERMS_URL : null });
        if (webhookPath && request.method === 'GET') return json({ readyForSignedPing: Boolean(env.PLAN_LEZTY_WEBHOOK_SECRET) && !commercial, acceptingOrders: enabled });
        let webhookEvent: Record<string, unknown> | undefined;
        let webhookTransaction: Record<string, unknown> | undefined;
        if (isWebhook) {
          if (commercial) return reject('not_found',404);
          const secret = env.PLAN_LEZTY_WEBHOOK_SECRET;
          if (!secret) return reject('checkout_unavailable',503);
          const raw = await boundedText(request,384_000);
          if (!await signedEvent(secret,raw,request.headers.get('x-signature') ?? '',now())) return reject('invalid_signature',401);
          webhookEvent = fields(JSON.parse(raw));
          if (webhookEvent.type === 'ping') return json({ received:true });
          webhookTransaction = fields(fields(webhookEvent.data).object);
          if (webhookEvent.object !== 'event' || webhookEvent.mode !== 'live' || typeof webhookEvent.id !== 'string' || webhookTransaction.object !== 'transaction') return reject('invalid_event');
          const metadata = webhookTransaction.metadata;
          if (!metadata || typeof metadata !== 'object' || fields(metadata).purpose !== 'saas_plan') return json({ ignored:true });
        }
        // Reconciliation and support remain usable after disabling new sales.
        if (!configured(env, resolved) || (!privatePilot && !publicConfigured && !isWebhook)) return reject('checkout_unavailable',503);
        if (!isWebhook && !isSupport) {
          const ip = request.headers.get('cf-connecting-ip') ?? 'missing';
          const rate = await env.PLAN_RATE!.limit({ key: (request.method === 'POST' && path === route+'/orders' ? 'create:' : 'read:') + ip });
          if (!rate.success) return json({ error:'rate_limited' },429,{'Retry-After':'60'});
        }
        if (path === route+'/session' && request.method === 'POST') {
          if (!enabled) return reject('checkout_unavailable',503);
          const value = session(request) ?? hex(crypto.getRandomValues(new Uint8Array(32)));
          return json({ ready:true },200,{'Set-Cookie':COOKIE+'='+value+'; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Strict'});
        }

        const keyBytes = unhex(env.PLAN_DATA_KEY_HEX!);
        const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt','decrypt']);
        const bucket = env.PLAN_ORDERS!;
        const storageKey = (id: string) => 'landing3/orders/' + id;
        async function read(id: string) {
          const data = await bucket.get(storageKey(id));
          if (!data) return null;
          const payload = await data.json() as { iv: string; data: string };
          const bytes = await crypto.subtle.decrypt({ name:'AES-GCM', iv:unhex(payload.iv), additionalData:encode(id) }, key, unhex(payload.data));
          return { order: JSON.parse(new TextDecoder().decode(bytes)) as Order, etag: data.etag };
        }
        async function put(order: Order, etag?: string) {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const data = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:encode(order.id) }, key, encode(JSON.stringify(order)));
          return bucket.put(storageKey(order.id), JSON.stringify({ iv:hex(iv), data:hex(data) }), { onlyIf:etag ? { etagMatches:etag } : { etagDoesNotMatch:'*' } });
        }
        const provider = { key:env.PLAN_LEZTY_API_KEY || '', fetcher };
        const receipt = (order: Order) => json(dto(order,now()));
        async function reconcile(id: string, providerId: string) {
          const saved = await read(id);
          if (!saved || saved.order.merchant !== merchantVersion || !TX.test(providerId)) return reject('not_found',404);
          if (commercial) {
            if (!env.PLAN_PIX_BRAVO) return reject('checkout_unavailable',503);
            const charge = await bravoCharge(env.PLAN_PIX_BRAVO, '/transactions/' + encodeURIComponent(providerId));
            for (let attempt = 0; attempt < 5; attempt++) {
              const current = await read(id);
              if (!current) return reject('not_found',404);
              const o = current.order;
              if (o.transactionId && o.transactionId !== charge.id) return reject('unverified_transaction',502);
              if (o.status === 'refunded' || o.status === 'chargeback' ||
                  (o.paidAt && !['refunded','chargeback'].includes(charge.status)) ||
                  (terminal.has(o.status) && charge.status === 'pending')) return o;
              const pending = charge.status === 'pending' && charge.pix && Number.isFinite(Date.parse(charge.pix.expires_at))
                ? { copyPaste: charge.pix.payload, expiresAt: charge.pix.expires_at } : o.pix;
              const next: Order = { ...o, transactionId: charge.id, status: charge.status, checkedAt: now(), pix: charge.status === 'pending' ? pending : undefined, ...(charge.status === 'paid' ? { paidAt: now() } : {}) };
              if (await put(next, current.etag)) return next;
            }
            return reject('busy',503);
          }
          const { tx } = transaction(await lezty(provider,'/'+encodeURIComponent(providerId)), saved.order);
          const status = tx.status;
          if (typeof status !== 'string' || !['pending','paid','expired','failed','refunded','chargeback'].includes(status)) return reject('unverified_transaction',502);
          for (let attempt = 0; attempt < 5; attempt++) {
            const current = await read(id);
            if (!current) return reject('not_found',404);
            transaction(tx,current.order);
            const o = current.order;
            if (o.status === 'refunded' || o.status === 'chargeback' ||
                (o.paidAt && !['refunded','chargeback'].includes(status)) ||
                (terminal.has(o.status) && status === 'pending')) return o;
            const pix = tx.pix && typeof tx.pix === 'object' ? tx.pix as Record<string,unknown> : {};
            const pending = status === 'pending' && typeof pix.payload === 'string' && pix.payload.length > 0 && pix.payload.length <= 4096 && typeof pix.expires_at === 'string' && Number.isFinite(Date.parse(pix.expires_at))
              ? {copyPaste:pix.payload,expiresAt:pix.expires_at} : o.pix;
            const next:Order = { ...o, transactionId:providerId, status:status as State, checkedAt:now(), pix:status === 'pending' ? pending : undefined, ...(status === 'paid' ? {paidAt:now()} : {}) };
            if (await put(next,current.etag)) return next;
          }
          return reject('busy',503);
        }
        if (webhookEvent && webhookTransaction) {
          const event = webhookEvent, tx = webhookTransaction;
          const meta = fields(tx.metadata);
          const id = field(meta.order_id,64,64);
          if (!HEX.test(id)) return reject('invalid_event');
          const providerId = field(tx.id,1,128);
          const eventKey = 'landing3/events/' + await hash(JSON.stringify([merchantVersion,event.id,id,providerId]));
          if (await bucket.get(eventKey)) return json({received:true,duplicate:true});
          await reconcile(id,providerId);
          await bucket.put(eventKey,'{}',{onlyIf:{etagDoesNotMatch:'*'}});
          return json({ received:true });
        }

        if (isSupport) {
          if (!secureEquals(request.headers.get('authorization') ?? '', 'Bearer '+env.PLAN_SUPPORT_TOKEN)) return reject('forbidden',403);
          if (path === route+'/support' && request.method === 'GET') {
            const page = await bucket.list({prefix:'landing3/orders/',limit:25,cursor:url.searchParams.get('cursor') ?? undefined});
            const orders = await Promise.all(page.objects.map(obj=>read(obj.key.slice('landing3/orders/'.length))));
            return json({ orders:orders.flatMap(row=>row?.order.paidAt ? [{...dto(row.order,now()),buyer:row.order.buyer, paidAt:row.order.paidAt, handledAt:row.order.handledAt}] : []), cursor:page.truncated ? page.cursor : null });
          }
          if (request.method === 'POST' && path === route+'/support/handled') {
            const data = fields(JSON.parse(await boundedText(request,1024)));
            const id = field(data.id,64,64);
            if (!HEX.test(id)) return reject('invalid_input');
            const current = await read(id);
            if (!current || current.order.status !== 'paid') return reject('not_found',404);
            if (!current.order.handledAt && !await put({...current.order, handledAt:now()},current.etag)) return reject('busy',503);
            return json({ handled:true });
          }
          return reject('not_found',404);
        }

        const token = session(request);
        if (!token) return reject('session_required',401);
        const match = path.match(/^\/api\/checkout\/orders\/([a-f0-9-]{36})(\/check)?$/i);
        if (match && UUID.test(match[1])) {
          const id = await hash((privatePilot ? 'pilot:' : '')+token+':'+match[1].toLowerCase());
          const saved = await read(id);
          if (!saved) return reject('not_found',404);
          if (!match[2] && request.method === 'GET') return receipt(saved.order);
          if (match[2] && request.method === 'POST') {
            const o = saved.order;
            if (!o.transactionId || o.checkAfter && o.checkAfter > now() || o.merchant !== merchantVersion) return receipt(o);
            if (!await put({...o,checkAfter:now()+30_000},saved.etag)) return receipt(o);
            return receipt(await reconcile(id,o.transactionId));
          }
          return reject('not_found',404);
        }
        if (path !== route+'/orders' || request.method !== 'POST') return reject('not_found',404);
        if (!enabled) return reject('checkout_unavailable',503);
        const data = fields(JSON.parse(await boundedText(request,4096)));
        exact(data,['requestId','planId','catalogVersion','buyer','acceptedTermsVersion']);
        const requestId = field(data.requestId,36,36).toLowerCase();
        if (!UUID.test(requestId)) return reject('invalid_input');
        if (data.catalogVersion !== CATALOG_VERSION || data.acceptedTermsVersion !== termsVersion) return reject('catalog_changed',409);
        const plan = FIXED_PLANS.find(p=>p.id === data.planId);
        if (!plan) return reject('plan_unavailable',404);
        const input = fields(data.buyer); exact(input,['name','email','username','document']);
        const buyer = {name:field(input.name,2,120),email:field(input.email,3,254).toLowerCase(),username:field(input.username,1,80)};
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)) return reject('invalid_email');
        if (privatePilot && buyer.email !== PILOT_EMAIL) return reject('invalid_email');
        const document = documentDigits(input.document);
        const id = await hash((privatePilot ? 'pilot:' : '')+token+':'+requestId);
        // Bind the normalized request without persisting the payer document.
        const fingerprint = await hash(token+':'+JSON.stringify([plan.id,data.catalogVersion,data.acceptedTermsVersion,buyer,document]));
        const existing = await read(id);
        if (existing) {
          if (existing.order.fingerprint !== fingerprint) return reject('request_conflict',409);
          return receipt(existing.order);
        }
        const order:Order = {id,plan,buyer,fingerprint,catalogVersion:CATALOG_VERSION,termsVersion,merchant:merchantVersion,createdAt:now(),status:'creating'};
        if (!await put(order)) {
          const winner = await read(id);
          if (!winner || winner.order.fingerprint !== fingerprint) return reject('request_conflict',409);
          return receipt(winner.order);
        }
        // Durable creation intent wins once. No subsequent request repeats the financial POST.
        try {
          if (commercial) {
            if (!env.PLAN_PIX_BRAVO) return reject('checkout_unavailable',503);
            const charge = await bravoCharge(env.PLAN_PIX_BRAVO, '/transactions', {
              amountCents: plan.amountCents,
              orderId: id,
              description: plan.label,
              customer: { name: buyer.name, email: buyer.email, document },
              idempotencyKey: id,
            });
            if (charge.status === 'paid') return receipt(await reconcile(id, charge.id));
            const current = await read(id);
            if (!current) return reject('not_found',404);
            if (current.order.status !== 'creating') return receipt(current.order);
            const pending: Order = { ...current.order, transactionId: charge.id, status: 'uncertain' };
            if (charge.status === 'pending' && charge.pix) {
              if (!Number.isFinite(Date.parse(charge.pix.expires_at))) return reject('unverified_transaction',502);
              pending.status = 'pending';
              pending.pix = { copyPaste: charge.pix.payload, expiresAt: charge.pix.expires_at };
            }
            await put(pending, current.etag);
            return receipt((await read(id))?.order ?? pending);
          }
          const response = await lezty(provider,'',{
            amount:plan.amountCents,currency:'BRL',payment_method:'pix',
            customer:{name:buyer.name,email:buyer.email,document,document_type:document.length === 11 ? 'cpf' : 'cnpj'},
            items:[{name:plan.label,quantity:1,unit_amount:plan.amountCents}],pix:{expires_in_seconds:1800},
            metadata:{purpose:'saas_plan',order_id:id,merchant_version:order.merchant},
            description:plan.label,
          },id);
          const parsed = transaction(response,order);
          if (parsed.tx.status === 'paid') return receipt(await reconcile(id,parsed.id));
          const current = await read(id);
          if (!current) return reject('not_found',404);
          if (current.order.status !== 'creating') return receipt(current.order);
          const pending = {...current.order,transactionId:parsed.id,status:'uncertain' as State};
          if (parsed.tx.status === 'pending') {
            const pix = fields(parsed.tx.pix);
            const copyPaste = field(pix.payload,1,4096), expiresAt = field(pix.expires_at,1,60);
            if (!Number.isFinite(Date.parse(expiresAt))) return reject('unverified_transaction',502);
            pending.status='pending'; pending.pix={copyPaste,expiresAt};
          }
          await put(pending,current.etag);
          return receipt((await read(id))?.order ?? pending);
        } catch (providerError) {
          const current = await read(id);
          if (current?.order.status === 'creating') await put({...current.order,status:'uncertain'},current.etag);
          const response = receipt((await read(id))?.order ?? {...order,status:'uncertain'});
          if (providerError instanceof CheckoutError) {
            response.headers.set('x-checkout-provider', providerError.code);
          } else if (providerError instanceof Error) {
            response.headers.set('x-checkout-provider', `${providerError.name}:${providerError.message}`.slice(0, 180));
          } else {
            response.headers.set('x-checkout-provider', 'unknown');
          }
          return response;
        }
      } catch (error) {
        if (error instanceof CheckoutError) return json({error:error.code},error.status);
        if (error instanceof SyntaxError || error instanceof Error && error.message === 'body_limit') return json({error:'invalid_input'},400);
        return json({error:'checkout_unavailable'},503);
      }
    },
  };
}
export default createCheckout();
