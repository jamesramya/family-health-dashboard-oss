import { Search, ChevronRight, ChevronDown, Upload } from "lucide-react";
import { formatDate } from "@/lib/format";
import { fileTypeLabel } from "@/lib/file-type";
import type { Document } from "@/types/api";
import { DocumentViewer } from "@/components/DocumentViewer";

const TYPE_GLYPH: Record<string, { bg: string; fg: string; glyph: string }> = {
  blood_report: { bg: "#fbe9e4", fg: "#963623", glyph: "PDF" },
  scan:         { bg: "#d6e8e3", fg: "#1b3e36", glyph: "IMG" },
  ecg:          { bg: "#fcf3e1", fg: "#a57918", glyph: "ECG" },
  prescription: { bg: "#eef4ea", fg: "#547e45", glyph: "RX" },
  consultation: { bg: "#f2ecda", fg: "#6b6558", glyph: "DOC" },
  culture_report: { bg: "#d7e5cd", fg: "#547e45", glyph: "CUL" },
  other:        { bg: "#f2ecda", fg: "#6b6558", glyph: "FILE" },
};

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

interface Props {
  header: string;
  docs: Document[];
  selectedId: string | null;
  patientId: string;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string | null) => void;
  onUpload?: () => void;
}

export function DocList({ header, docs, selectedId, patientId, search, onSearch, onSelect, onUpload }: Props) {
  return (
    <div className="flex-1 min-w-0 bg-cream-50 flex flex-col">
      <div className="p-4 border-b border-cream-300 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {header} · {docs.length}
          </p>
          {onUpload && (
            <button
              onClick={onUpload}
              aria-label="Upload documents"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint [@media(hover:hover)]:hover:text-teal-600 [@media(hover:hover)]:hover:bg-teal-50"
            >
              <Upload size={14} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 bg-cream-50 border border-cream-300 rounded-xl px-3 py-2">
          <Search size={14} className="text-ink-faint" />
          <input
            className="bg-transparent border-0 text-[13px] flex-1 outline-none"
            placeholder="Search documents…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {docs.map((d) => {
          const sel = d.id === selectedId;
          const g = TYPE_GLYPH[d.type] ?? TYPE_GLYPH.other;
          return (
            <li key={d.id} className="mb-1">
              <button
                onClick={() => onSelect(sel ? null : d.id)}
                aria-expanded={sel}
                className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left ${
                  sel ? "bg-teal-50 ring-1 ring-teal-500/30 rounded-b-none" : "[@media(hover:hover)]:hover:bg-cream-100"
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
                    {formatDate(d.document_date)} · {formatSize(d.file_size_bytes)} · {fileTypeLabel(d)}
                  </p>
                </div>
                {sel
                  ? <ChevronDown size={14} className="text-teal-600 mt-1 shrink-0" />
                  : <ChevronRight size={14} className="text-ink-faint mt-1 shrink-0" />
                }
              </button>
              {sel && (
                <div className="h-[70vh] overflow-hidden bg-white rounded-b-2xl border border-teal-500/20 border-t-0">
                  <DocumentViewer document={d} patientId={patientId} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
