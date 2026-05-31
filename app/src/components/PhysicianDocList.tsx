import { useState } from "react";
import { ChevronRight, ChevronDown, Search } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { SharedDocument } from "@/hooks/use-shared-record";
import { SharedDocumentViewer } from "@/components/SharedDocumentViewer";

const TYPE_GLYPH: Record<string, { bg: string; fg: string; glyph: string }> = {
  blood_report:   { bg: "#fbe9e4", fg: "#963623", glyph: "PDF" },
  scan:           { bg: "#d6e8e3", fg: "#1b3e36", glyph: "IMG" },
  ecg:            { bg: "#fcf3e1", fg: "#a57918", glyph: "ECG" },
  prescription:   { bg: "#eef4ea", fg: "#547e45", glyph: "RX" },
  consultation:   { bg: "#f2ecda", fg: "#6b6558", glyph: "DOC" },
  culture_report: { bg: "#d7e5cd", fg: "#547e45", glyph: "CUL" },
  other:          { bg: "#f2ecda", fg: "#6b6558", glyph: "FILE" },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface Props {
  docs: SharedDocument[];
  search: string;
  onSearch: (v: string) => void;
  token: string;
}

export function PhysicianDocList({ docs, search, onSearch, token }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 bg-cream-50 border border-cream-300 rounded-xl px-3 py-2">
        <Search size={14} className="text-ink-faint" />
        <input
          className="bg-transparent border-0 text-[13px] flex-1 outline-none"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>

      {docs.length === 0 && (
        <p className="text-sm text-ink-muted text-center py-4">No documents.</p>
      )}

      <ul className="space-y-1">
        {docs.map((d) => {
          const sel = d.id === selectedId;
          const g = TYPE_GLYPH[d.type] ?? TYPE_GLYPH.other;
          return (
            <li key={d.id}>
              <button
                onClick={() => setSelectedId(sel ? null : d.id)}
                aria-expanded={sel}
                className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-colors ${
                  sel
                    ? "bg-teal-50 ring-1 ring-teal-500/30 rounded-b-none"
                    : "hover:bg-cream-100"
                }`}
              >
                <div
                  className="w-8 h-10 rounded-lg shrink-0 grid place-items-center text-[9px] font-mono font-bold"
                  style={{ background: g.bg, color: g.fg }}
                >
                  {g.glyph}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] leading-tight truncate ${sel ? "text-teal-700 font-semibold" : "text-ink font-medium"}`}>
                    {d.title}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-0.5 font-mono">
                    {formatDate(d.document_date)} · {formatSize(d.file_size_bytes)} · {d.type.replace(/_/g, " ")}
                  </p>
                </div>
                {sel
                  ? <ChevronDown size={14} className="text-teal-600 mt-1 shrink-0" />
                  : <ChevronRight size={14} className="text-ink-faint mt-1 shrink-0" />}
              </button>
              {sel && (
                <div className="rounded-b-2xl border border-teal-500/20 border-t-0 overflow-hidden" style={{ minHeight: "60vh" }}>
                  <SharedDocumentViewer document={d} token={token} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
