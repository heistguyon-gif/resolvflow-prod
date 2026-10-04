type WebPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function isValidVapidConfig(config: VapidConfig) {
  try {
    const publicKey = base64UrlBytes(config.publicKey);
    const privateKey = base64UrlBytes(config.privateKey);
    const validSubject = config.subject.startsWith("mailto:") || config.subject.startsWith("https://");
    return publicKey.length === 65 && publicKey[0] === 4 && privateKey.length === 32 && validSubject;
  } catch {
    return false;
  }
}

function base64UrlBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

async function hmac(keyBytes: Uint8Array, data: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExtract(salt: Uint8Array, inputKeyMaterial: Uint8Array) {
  return hmac(salt, inputKeyMaterial);
}

async function hkdfExpand(pseudoRandomKey: Uint8Array, info: Uint8Array, length: number) {
  const output = await hmac(pseudoRandomKey, concatBytes(info, new Uint8Array([1])));
  return output.slice(0, length);
}

async function vapidAuthorization(endpoint: string, config: VapidConfig) {
  const publicKey = base64UrlBytes(config.publicKey);
  const privateKey = base64UrlBytes(config.privateKey);
  if (!isValidVapidConfig(config)) throw new Error("VAPID_CONFIG_INVALID");
  const signingKey = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicKey.slice(1, 33)),
    y: bytesToBase64Url(publicKey.slice(33, 65)),
    d: bytesToBase64Url(privateKey),
    ext: true,
    key_ops: ["sign"],
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject,
  })));
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, new TextEncoder().encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${config.publicKey}`;
}

async function encryptPayload(payload: string, subscription: WebPushSubscription) {
  const receiverPublicKey = base64UrlBytes(subscription.p256dh);
  const authenticationSecret = base64UrlBytes(subscription.auth);
  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 4 || authenticationSecret.length < 16) throw new Error("PUSH_SUBSCRIPTION_INVALID");

  const receiverKey = await crypto.subtle.importKey("raw", receiverPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const senderKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const senderPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKeys.privateKey, 256));

  const authPrk = await hkdfExtract(authenticationSecret, sharedSecret);
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), receiverPublicKey, senderPublicKey);
  const inputKeyMaterial = await hkdfExpand(authPrk, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pseudoRandomKey = await hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = await hkdfExpand(pseudoRandomKey, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(pseudoRandomKey, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentEncryptionKey, "AES-GCM", false, ["encrypt"]);
  const plaintext = concatBytes(new TextEncoder().encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concatBytes(salt, recordSize, new Uint8Array([senderPublicKey.length]), senderPublicKey, ciphertext);
}

export async function sendWebPush(subscription: WebPushSubscription, payload: unknown, config: VapidConfig, fetchImpl: typeof fetch = fetch) {
  const body = await encryptPayload(JSON.stringify(payload), subscription);
  const authorization = await vapidAuthorization(subscription.endpoint, config);
  return fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "300",
      urgency: "high",
    },
    body,
  });
}
