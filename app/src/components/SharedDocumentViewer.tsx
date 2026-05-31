import { useEffect, useState } from "react";
import type { SharedDocument } from "@/hooks/use-shared-record";

interface Props {
  document: SharedDocument;
  token: string;
}

export function SharedDocumentViewer({ document, token }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    setLoading(true);
    setError(false);
    fetch(`/api/share/${token}/documents/${document.id}/file`)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (!revoked) { setError(true); setLoading(false); }
      });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, document.id]);

  return (
    <div className="flex-1 bg-cream-100 flex items-center justify-center overflow-auto h-full min-h-[50vh]">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading…
        </div>
      )}
      {error && !loading && (
        <p className="text-sm text-rose-500">Failed to load document.</p>
      )}
      {blobUrl && !loading && !error && (
        <>
          {document.mime_type.startsWith("application/pdf") && (
            <embed
              src={blobUrl}
              type="application/pdf"
              className="w-full h-full min-h-[70vh]"
              title={document.title}
            />
          )}
          {document.mime_type.startsWith("image/") && (
            <img
              src={blobUrl}
              alt={document.title}
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
          {!document.mime_type.startsWith("application/pdf") && !document.mime_type.startsWith("image/") && (
            <p className="text-sm text-ink-muted text-center px-6">
              Preview not available for this file type.{" "}
              <a href={blobUrl} download={document.title} className="text-teal-600 underline">
                Download
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
