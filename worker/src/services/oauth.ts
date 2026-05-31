import { constantTimeEqual } from "./crypto";

export async function verifyPkceS256(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const computed = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return constantTimeEqual(computed, codeChallenge);
}

export function mapOAuthScopeToPat(scope: string): string {
  const scopes = [...new Set(scope.split(/\s+/).filter(Boolean))].sort();
  const joined = scopes.join(" ");
  if (joined === "mcp.read") return "read";
  if (joined === "mcp.read mcp.write") return "read,write";
  throw new Error("invalid_scope");
}

export function isRedirectUriRegistered(registered: string, requested: string): boolean {
  try {
    const parsed: unknown = JSON.parse(registered);
    if (!Array.isArray(parsed)) return false;
    return (parsed as string[]).includes(requested);
  } catch {
    return false;
  }
}

export function mintTokenBytes(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
