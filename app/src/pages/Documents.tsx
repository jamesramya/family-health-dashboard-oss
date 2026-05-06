import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDocuments } from "@/hooks/use-documents";
import { useDefaultPatientId } from "@/hooks/use-admin";
import { FolderRail, type FolderKey } from "@/components/documents/FolderRail";
import { DocList } from "@/components/documents/DocList";
import { QuickAddModal } from "@/components/QuickAddModal";
import type { DocumentType } from "@/types/api";

export function Documents() {
  const { patientId, isLoading: patientLoading } = useDefaultPatientId();
  const { data } = useDocuments(patientId ?? "");
  const [folder, setFolder] = useState<FolderKey>("all");
  const [search, setSearch] = useState("");
  const [params, setParams] = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);

  const selectedDocId = params.get("doc");
  const docs = data?.documents ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: docs.length };
    for (const d of docs) c[d.type] = (c[d.type] ?? 0) + 1;
    return c as Record<FolderKey, number>;
  }, [docs]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return docs
      .filter((d) => folder === "all" || d.type === (folder as DocumentType))
      .filter((d) => !s || d.title.toLowerCase().includes(s))
      .sort((a, b) => new Date(b.document_date).getTime() - new Date(a.document_date).getTime());
  }, [docs, folder, search]);

  function select(id: string) {
    setParams((p) => { const n = new URLSearchParams(p); n.set("doc", id); return n; });
  }
  function close() {
    setParams((p) => { const n = new URLSearchParams(p); n.delete("doc"); return n; });
  }

  if (patientLoading) return <div className="py-16 text-center text-ink-muted">Loading…</div>;
  if (!patientId) return <p className="py-16 text-center text-ink-muted">No patient found.</p>;

  const folderLabel = folder === "all" ? "All documents" : folder.replace("_", " ");

  return (
    <>
      <div className="flex flex-col md:flex-row h-[calc(100vh-6rem)] rounded-2xl overflow-hidden border border-cream-200 shadow-card bg-cream-50">
        <FolderRail counts={counts} active={folder} onSelect={setFolder} />
        <DocList
          header={folderLabel}
          docs={filtered}
          selectedId={selectedDocId}
          patientId={patientId}
          search={search}
          onSearch={setSearch}
          onSelect={(id) => (id ? select(id) : close())}
          onUpload={() => setUploadOpen(true)}
        />
      </div>

      <QuickAddModal kind={uploadOpen ? "document" : null} onClose={() => setUploadOpen(false)} />
    </>
  );
}
