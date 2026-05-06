import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { ScanFinding } from "@/types/api";

export function ScanDetailPanel({ scan }: { scan: ScanFinding }) {
  return (
    <div className="rounded-2xl bg-cream-50 border border-cream-200 p-6 shadow-card space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Scan</p>
        <h2 className="font-semibold tracking-tight text-3xl text-ink leading-tight mt-1">{scan.scan_type}</h2>
        <p className="text-sm text-ink-muted mt-1">
          {scan.body_area}
          {scan.scan_date && ` · ${formatDate(scan.scan_date)}`}
          {scan.ordering_doctor && ` · Dr. ${scan.ordering_doctor}`}
        </p>
      </header>

      {scan.findings_summary && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Findings</p>
          <p className="text-sm text-ink-soft leading-relaxed">{scan.findings_summary}</p>
        </section>
      )}

      {scan.impression && (
        <section className="rounded-xl bg-amber-50 border border-amber-100 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-600 mb-1">Impression</p>
          <p className="text-sm text-ink-soft leading-relaxed">{scan.impression}</p>
        </section>
      )}

      {scan.document_id && (
        <Link
          to={`/documents?doc=${scan.document_id}`}
          className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700"
        >
          <FileText size={14} /> Open source document
        </Link>
      )}
    </div>
  );
}
