import { useState, useRef } from "react";
import { FileUp, X } from "lucide-react";
import { useUploadQueue } from "@/contexts/upload-queue";
import { Btn } from "@/components/ui";
import type { DocumentType } from "@/types/api";
import { buildUploadFormData } from "@/lib/upload-helpers";

interface DocumentUploadProps {
  patientId: string;
  onSuccess?: () => void;
  defaultType?: DocumentType;
}

export function DocumentUpload({ patientId, onSuccess, defaultType = "other" }: DocumentUploadProps) {
  const { enqueue } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sourceLab, setSourceLab] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertErrors, setConvertErrors] = useState(0);

  function handleFiles(incoming: File[]) {
    setConvertErrors(0);
    setSelectedFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
  }

  function removeFile(name: string) {
    setConvertErrors(0);
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(e.target.files ?? []));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) return;
    setConvertErrors(0);

    let errors = 0;
    const failedNames = new Set<string>();

    for (const file of selectedFiles) {
      try {
        const fd = await buildUploadFormData(file, {
          onConvertingChange: setConverting,
          sourceLab: sourceLab || undefined,
          type: defaultType,
        });
        enqueue(patientId, fd, (fd.get("file") as File).name);
      } catch {
        errors++;
        failedNames.add(file.name);
      }
    }

    setConverting(false);

    if (errors > 0) {
      setConvertErrors(errors);
      setSelectedFiles((prev) => prev.filter((f) => failedNames.has(f.name)));
    } else {
      setSelectedFiles([]);
      setSourceLab("");
      setConvertErrors(0);
      if (inputRef.current) inputRef.current.value = "";
      onSuccess?.();
    }
  }

  const hasFiles = selectedFiles.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
          isDragOver
            ? "border-teal-500 bg-teal-50"
            : hasFiles
            ? "border-sage-500 bg-sage-50"
            : "border-cream-300 bg-white hover:bg-cream-100"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
        {hasFiles ? (
          <ul className="space-y-1 text-left" onClick={(e) => e.stopPropagation()}>
            {selectedFiles.map((f) => (
              <li key={f.name} className="flex items-center gap-2 px-1">
                <span className="text-sm font-medium text-sage-600 truncate flex-1">{f.name}</span>
                <span className="text-xs text-sage-500 shrink-0 font-mono">
                  {(f.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 text-ink-faint hover:text-rose-500 transition-colors"
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <FileUp size={32} className="mx-auto mb-2 text-ink-faint" aria-hidden />
            <p className="text-sm font-medium text-ink-soft">
              Drag & drop or click to select files
            </p>
            <p className="text-xs text-ink-faint mt-1">PDF, JPG, PNG, HEIC · multiple files supported</p>
          </div>
        )}
      </div>

      {hasFiles && (
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Lab / Source (optional)
          </label>
          <input
            type="text"
            value={sourceLab}
            onChange={(e) => setSourceLab(e.target.value)}
            placeholder="e.g. Apollo Hospitals"
            className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-teal-500"
          />
          <p className="text-xs text-ink-faint mt-1">
            Title, type and date will be set automatically from the document.
          </p>
        </div>
      )}

      <Btn type="submit" disabled={!hasFiles || converting}>
        {converting
          ? "Converting HEIC…"
          : selectedFiles.length > 1
          ? `Upload ${selectedFiles.length} files`
          : "Upload"
        }
      </Btn>

      {convertErrors > 0 && (
        <p className="text-[13px] text-rose-600 mt-2" role="alert">
          {convertErrors} file{convertErrors > 1 ? "s" : ""} could not be converted — try JPG or PNG instead.
        </p>
      )}
    </form>
  );
}
