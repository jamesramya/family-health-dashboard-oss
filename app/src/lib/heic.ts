export class HeicConversionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "HeicConversionError";
  }
}

export function isHeic(file: File): boolean {
  if (["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(file.type)) {
    return true;
  }
  if (file.type === "" || file.type === "application/octet-stream") {
    return /\.(heic|heif)$/i.test(file.name);
  }
  return false;
}

export async function convertHeicToJpeg(
  file: File,
  quality = 0.92
): Promise<File> {
  try {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality });
    const blob = Array.isArray(result) ? result[0] : result;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : undefined;
    throw new HeicConversionError(msg ?? "HEIC conversion failed");
  }
}
