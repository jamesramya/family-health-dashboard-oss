export interface ScanSummary {
  id: string;
  scan_type: string;
  body_area: string;
  findings_summary: string;
  impression: string | null;
  ordering_doctor: string | null;
  scan_date: string;
  document_id?: string;
}
