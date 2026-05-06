import { FileText, Folder } from "lucide-react";
import type { DocumentType } from "@/types/api";

export type FolderKey = "all" | DocumentType;

const FOLDERS: { key: FolderKey; label: string }[] = [
  { key: "all", label: "All documents" },
  { key: "blood_report", label: "Lab reports" },
  { key: "scan", label: "Scans" },
  { key: "ecg", label: "ECG" },
  { key: "prescription", label: "Prescriptions" },
  { key: "consultation", label: "Consultations" },
  { key: "culture_report", label: "Cultures" },
  { key: "other", label: "Other" },
];

interface Props {
  counts: Record<FolderKey, number>;
  active: FolderKey;
  onSelect: (k: FolderKey) => void;
}

export function FolderRail({ counts, active, onSelect }: Props) {
  return (
    <>
      {/* Desktop vertical column */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-cream-50 border-r border-cream-300 p-4 overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-3">Folders</p>
        {FOLDERS.map((f) => {
          const sel = f.key === active;
          const Icon = f.key === "all" ? FileText : Folder;
          return (
            <button
              key={f.key}
              onClick={() => onSelect(f.key)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] mb-1 ${
                sel ? "bg-teal-50 text-teal-700 font-medium" : "text-ink-soft hover:bg-cream-100"
              }`}
            >
              <Icon size={14} />
              <span className="flex-1 text-left truncate">{f.label}</span>
              <span className="text-xs text-ink-faint tabular">{counts[f.key] ?? 0}</span>
            </button>
          );
        })}
      </aside>

      {/* Mobile horizontal chip row */}
      <div className="md:hidden flex gap-2 px-3 py-2 overflow-x-auto border-b border-cream-300 bg-cream-50 shrink-0">
        {FOLDERS.map((f) => {
          const sel = f.key === active;
          const count = counts[f.key] ?? 0;
          if (count === 0 && f.key !== "all") return null;
          return (
            <button
              key={f.key}
              onClick={() => onSelect(f.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border ${
                sel
                  ? "bg-teal-50 text-teal-700 border-teal-300 font-medium"
                  : "bg-white text-ink-soft border-cream-300 hover:bg-cream-50"
              }`}
            >
              {f.label}
              <span className="text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
