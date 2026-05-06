const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/heic": "HEIC",
  "image/heif": "HEIC",
  "image/webp": "WEBP",
};

export function fileTypeLabel(doc: {
  mime_type?: string | null;
  r2_key?: string | null;
}): string {
  if (doc.mime_type) {
    const label = MIME_LABELS[doc.mime_type.toLowerCase()];
    if (label) return label;
  }

  if (doc.r2_key) {
    const match = doc.r2_key.match(/\.([^.]+)$/);
    if (match) return match[1].toUpperCase();
  }

  return "FILE";
}
