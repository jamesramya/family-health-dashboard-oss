import { isHeic, convertHeicToJpeg } from "./heic";

export interface PrepareUploadOptions {
  onConvertingChange?: (converting: boolean) => void;
}

export async function prepareUploadFile(
  file: File,
  options?: PrepareUploadOptions
): Promise<File> {
  if (!isHeic(file)) {
    return file;
  }

  options?.onConvertingChange?.(true);
  try {
    const converted = await convertHeicToJpeg(file);
    return converted;
  } finally {
    options?.onConvertingChange?.(false);
  }
}
