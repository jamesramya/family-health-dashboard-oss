const DEFAULT_EXPIRY = 900; // 15 min

export interface TokenPayload { sub: string; role: string; email: string; }
export interface DecodedToken extends TokenPayload { iat: number; exp: number; }

export async function createAccessToken(
  payload: TokenPayload, secret: string, expiry = DEFAULT_EXPIRY
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expiry }));
  const sig = await hmac(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export async function verifyAccessToken(token: string, secret: string): Promise<DecodedToken> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [header, body, sig] = parts;
  const expected = await hmac(`${header}.${body}`, secret);
  // Constant-time comparison: use a random HMAC key to compare both strings
  const sigBytes = new TextEncoder().encode(sig);
  const expBytes = new TextEncoder().encode(expected);
  if (sigBytes.length !== expBytes.length) throw new Error("Invalid signature");
  const randKey = await crypto.subtle.importKey(
    "raw", crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const checkA = new Uint8Array(await crypto.subtle.sign("HMAC", randKey, sigBytes));
  const checkB = new Uint8Array(await crypto.subtle.sign("HMAC", randKey, expBytes));
  if (!checkA.every((v, i) => v === checkB[i])) {
    throw new Error("Invalid signature");
  }

  const payload: DecodedToken = JSON.parse(
    new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)))
  );
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  ));
}

function b64url(data: string | Uint8Array): string {
  let b64: string;
  if (typeof data === "string") {
    b64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    b64 = btoa(Array.from(data, (b) => String.fromCharCode(b)).join(""));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
