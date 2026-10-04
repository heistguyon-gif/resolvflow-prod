const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function bytesToBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.slice().buffer as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export function validatePassword(password: string) {
  if (password.length < 10) return "Use pelo menos 10 caracteres.";
  if (password.length > 200) return "A senha ultrapassa o limite permitido.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Combine letras e números.";
  return "";
}

export async function hashPassword(password: string) {
  const validation = validatePassword(password);
  if (validation) throw new Error(validation);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  if (encodedHash.startsWith("sha256$")) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)));
    return constantTimeEqual(digest, hexToBytes(encodedHash.slice("sha256$".length)));
  }
  const [algorithm, iterationsValue, saltValue, expectedValue] = encodedHash.split("$");
  const iterations = Number(iterationsValue);
  if (algorithm !== "pbkdf2_sha256" || !Number.isInteger(iterations) || iterations < 10_000 || iterations > 500_000 || !saltValue || !expectedValue) return false;
  try {
    const actual = await derivePassword(password, base64UrlToBytes(saltValue), iterations);
    return constantTimeEqual(actual, base64UrlToBytes(expectedValue));
  } catch {
    return false;
  }
}

export function passwordNeedsUpgrade(encodedHash: string) {
  if (encodedHash.startsWith("sha256$")) return true;
  const [algorithm, iterationsValue] = encodedHash.split("$");
  return algorithm !== "pbkdf2_sha256" || Number(iterationsValue) < PBKDF2_ITERATIONS;
}

export async function verifyLegacySha256(password: string, expectedHash: string) {
  return verifyPassword(password, `sha256$${expectedHash}`);
}
