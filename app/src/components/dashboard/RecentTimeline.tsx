import { Link } from "react-router-dom";
import { FlaskConical, Microscope, FileText, NotebookPen, type LucideIcon } from "lucide-react";
import type { Document, DocumentType } from "@/types/api";
import { formatDate } from "@/lib/format";

const PillIcon = (({ size = 24 }: { size?: number | string }) => (
  <svg width={Number(size)} height={Number(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 4.5a5 5 0 0 1 7 7l-10 10a5 5 0 0 1-7-7zM8 8l8 8" />
  </svg>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
)) as unknown as LucideIcon;

const ICONS: Record<DocumentType, LucideIcon> = {
  blood_report:   FlaskConical,
  scan:           Microscope,
  ecg:            FileText,
  prescription:   PillIcon,
  consultation:   NotebookPen,
  culture_report: FlaskConical,
  other:          FileText,
};

interface RecentTimelineProps {
  documents: Document[];
}

export function RecentTimeline({ documents }: RecentTimelineProps) {
  if (documents.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing added recently.</p>;
  }

  const shown = [...documents]
    .sort((a, b) => b.document_date.localeCompare(a.document_date))
    .slice(0, 6);

  return (
    <ul className="space-y-1.5">
      {shown.map((d) => {
        const Icon = ICONS[d.type];
        return (
          <li key={d.id}>
            <Link
              to={`/documents?doc=${d.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2 [@media(hover:hover)]:hover:bg-cream-100 transition-colors duration-160"
            >
              <span className="w-10 h-10 rounded-full bg-cream-100 text-ink-soft grid place-items-center flex-shrink-0">
                <Icon size={14} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink truncate">{d.title}</span>
                <span className="block text-xs text-ink-muted">{formatDate(d.document_date)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
