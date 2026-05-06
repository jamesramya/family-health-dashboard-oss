const ITERATIONS = 100_000;
const KEY_LEN = 32;
const SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const derived = new Uint8Array(await deriveBits(password, salt, ITERATIONS));
  return `${ITERATIONS}:${hex(salt)}:${hex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iters, saltHex, hashHex] = stored.split(":");
  const derived = new Uint8Array(await deriveBits(password, unhex(saltHex), parseInt(iters)));
  // Constant-time comparison via random HMAC key (same technique as JWT verify)
  const a = new TextEncoder().encode(hex(derived));
  const b = new TextEncoder().encode(hashHex);
  if (a.length !== b.length) return false;
  const randKey = await crypto.subtle.importKey(
    "raw", crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const macA = new Uint8Array(await crypto.subtle.sign("HMAC", randKey, a));
  const macB = new Uint8Array(await crypto.subtle.sign("HMAC", randKey, b));
  return macA.every((v, i) => v === macB[i]);
}

export async function constantTimeEqual(hashA: string, hashB: string): Promise<boolean> {
  const a = new TextEncoder().encode(hashA);
  const b = new TextEncoder().encode(hashB);
  if (a.length !== b.length) return false;
  const randKey = await crypto.subtle.importKey(
    "raw", crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const macA = new Uint8Array(await crypto.subtle.sign("HMAC", randKey, a));
  const macB = new Uint8Array(await crypto.subtle.sign("HMAC", randKey, b));
  return macA.every((v, i) => v === macB[i]);
}

export async function sha256hex(input: string): Promise<string> {
  return hex(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  ));
}

async function deriveBits(pw: string, salt: Uint8Array, iters: number) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" }, key, KEY_LEN * 8
  );
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function unhex(h: string): Uint8Array {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) a[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return a;
}
