import { prepareUploadFile, PrepareUploadOptions } from "./prepare-upload";

export interface UploadFileOptions extends PrepareUploadOptions {
  type?: string;
  sourceLab?: string;
}

export async function buildUploadFormData(
  file: File,
  options?: UploadFileOptions
): Promise<FormData> {
  const prepared = await prepareUploadFile(file, options);
  const fd = new FormData();
  fd.append("file", prepared);
  fd.append("title", prepared.name.replace(/\.[^.]+$/, ""));
  fd.append("type", options?.type ?? "other");
  fd.append("document_date", new Date().toISOString().slice(0, 10));
  if (options?.sourceLab) fd.append("source_lab", options.sourceLab);
  return fd;
}
