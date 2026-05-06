export function formatMedName(
  brand: string,
  generic: string | null | undefined
): string {
  const b = brand.trim().toUpperCase();
  const g = (generic ?? "").trim().toUpperCase();
  if (!g || g === b) return b;
  return `${b} (${g})`;
}
