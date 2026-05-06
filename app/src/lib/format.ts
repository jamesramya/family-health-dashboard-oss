const DISPLAY_LOCALE = "en-GB";

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const time = new Date(iso)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\u202f/g, " ");
  return `${formatDate(iso)}, ${time}`;
}

export function formatVitalDate(iso: string): string {
  return formatDateTime(iso);
}

export function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
  });
}

export function relTimeCompact(iso: string): string {
  const diffDay = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDay === 0) return "today";
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w ago`;
  return formatDate(iso);
}
