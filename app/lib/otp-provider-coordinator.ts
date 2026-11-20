/** Coordination lives in D1 so limits also apply across Worker instances. */
export async function otpHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("");
}

export class OtpProviderCoordinator {
  constructor(readonly db: D1Database, readonly clock: ()=>number = Date.now) {}

  async allow(keyHash: string, secondLimit: number, minuteLimit: number) {
    const now = this.clock(), second = Math.floor(now/1000), minute = Math.floor(now/60000);
    const result = await this.db.prepare(`INSERT INTO otp_provider_limits
      (provider_key_hash,second_window,minute_window,second_count,minute_count) VALUES (?,?,?,1,1)
      ON CONFLICT(provider_key_hash) DO UPDATE SET second_window = excluded.second_window,minute_window = excluded.minute_window,
        second_count = CASE WHEN second_window = excluded.second_window THEN second_count + 1 ELSE 1 END,
        minute_count = CASE WHEN minute_window = excluded.minute_window THEN minute_count + 1 ELSE 1 END
      WHERE blocked_until <= ? AND (second_window <> excluded.second_window OR second_count < ?)
        AND (minute_window <> excluded.minute_window OR minute_count < ?) RETURNING minute_count`)
      .bind(keyHash,second,minute,now,secondLimit,minuteLimit).first<{minute_count:number}>();
    if(result?.minute_count===1)await this.db.prepare("DELETE FROM otp_provider_polls WHERE request_hash IN (SELECT request_hash FROM otp_provider_polls WHERE updated_at < ? AND lock_until < ? LIMIT 200)").bind(now-86_400_000,now).run();
    return Boolean(result);
  }

  async block(keyHash: string, retryAfter: string | null) {
    const seconds = Number(retryAfter), date = retryAfter ? Date.parse(retryAfter) : NaN;
    const delay = retryAfter !== null && Number.isFinite(seconds) ? seconds*1000 : Number.isFinite(date) ? date-this.clock() : 5000;
    await this.db.prepare("UPDATE otp_provider_limits SET blocked_until = MAX(blocked_until,?) WHERE provider_key_hash = ?")
      .bind(this.clock()+Math.max(1000,Math.min(delay,3_600_000)),keyHash).run();
  }

  async fetcher(provider: "instacaster" | "otpgmail", key: string, fetchImpl: typeof fetch = fetch): Promise<typeof fetch> {
    const keyHash = await otpHash(`${provider}:${key}`);
    return async (input,init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const expectedHost = provider === "otpgmail" ? "otpgmail.net" : "instacaster.top";
      if (url.hostname !== expectedHost || url.protocol !== "https:") throw new Error("Destino de consulta inválido.");
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      const cacheable = method === "GET" && /\/orders\/[^/]+(?:\/code)?$/.test(url.pathname);
      const requestHash = cacheable ? await otpHash(`${keyHash}:${url.pathname}`) : "";
      const now = this.clock(), token = crypto.randomUUID();
      if (cacheable) {
        const cached = await this.db.prepare("SELECT response_json,response_status FROM otp_provider_polls WHERE request_hash = ? AND cache_until > ?").bind(requestHash,now).first<{response_json:string;response_status:number}>();
        if (cached?.response_json) return new Response(cached.response_json,{status:cached.response_status,headers:{"content-type":"application/json"}});
        const locked = await this.db.prepare(`INSERT INTO otp_provider_polls (request_hash,provider_key_hash,lock_token,lock_until,updated_at)
          VALUES (?,?,?,?,?) ON CONFLICT(request_hash) DO UPDATE SET lock_token = excluded.lock_token,lock_until = excluded.lock_until,updated_at = excluded.updated_at
          WHERE lock_until <= ? AND cache_until <= ? RETURNING request_hash`).bind(requestHash,keyHash,token,now+30_000,now,now,now).first();
        if (!locked) return Response.json({status:"pending"},{status:202});
      }
      try {
        // Conservative headroom below OTPGmail's documented 20/s and 900/min.
        if (!await this.allow(keyHash,provider === "otpgmail" ? 15 : 8,provider === "otpgmail" ? 750 : 300)) {
          return Response.json({error:{code:"rate_limited"}},{status:429,headers:{"retry-after":"5"}});
        }
        const response = await fetchImpl(input,{...init,signal:init?.signal || AbortSignal.timeout(25_000)});
        if (response.status === 429) await this.block(keyHash,response.headers.get("retry-after"));
        if (cacheable && response.ok && response.status === 200) {
          const raw = await response.clone().text();
          // Never cache a corrupt supplier response.
          try {
            JSON.parse(raw);
            await this.db.prepare("UPDATE otp_provider_polls SET response_json = ?,response_status = ?,cache_until = ? WHERE request_hash = ? AND lock_token = ?")
              .bind(raw,response.status,this.clock()+4000,requestHash,token).run();
          } catch { /* The original response still reaches the caller. */ }
        }
        return response;
      } finally {
        if (cacheable) await this.db.prepare("UPDATE otp_provider_polls SET lock_token = NULL,lock_until = 0 WHERE request_hash = ? AND lock_token = ?").bind(requestHash,token).run();
      }
    };
  }
}
