// Returns true only for same-origin relative paths starting with /
// Rejects: //evil.com (protocol-relative), absolute URLs, empty string,
// backslash-prefixed paths (browser normalizes /\ to //), control characters
export function isSafeReturnTo(url: string): boolean {
  if (/[\x00-\x1f\\]/.test(url)) return false;
  return /^\/(?:[^/?#].*)?$/.test(url);
}

export function getSafeReturnTo(searchParams: URLSearchParams): string | null {
  const returnTo = searchParams.get("returnTo");
  if (!returnTo || !isSafeReturnTo(returnTo)) return null;
  return returnTo;
}
