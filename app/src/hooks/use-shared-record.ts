import { useQuery } from "@tanstack/react-query";
import type { BloodWorkCategory, VitalReading } from "@/types/api";

interface SharedPatient {
  id: string;
  name: string;
  date_of_birth: string;
  gender: string;
  blood_type: string | null;
}

interface SharedTestResult {
  date: string;
  label: string;
  unit: string;
  value: number | null;
  value_text: string | null;
  flag: "HIGH" | "LOW" | "NORMAL";
}

interface SharedVital {
  type: string;
  measured_at: string;
  value_primary: number;
  value_secondary: number | null;
  unit: string;
}

export interface SharedRecord {
  patient: SharedPatient;
  test_results: SharedTestResult[];
  vitals: SharedVital[];
}

export function useSharedRecord(token: string) {
  return useQuery({
    queryKey: ["shared-record", token],
    queryFn: () => shareGet<SharedRecord>(token, ""),
    retry: false,
  });
}

export interface SharedMedication {
  id: string;
  brand_name: string;
  generic_name: string | null;
  dosage: string;
  form: string;
  prescribing_doctor: string | null;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  notes: string | null;
  is_active: number;
  schedules: { time_of_day: string; dose_quantity: string | null; meal_relation: string }[];
}

export interface SharedDocument {
  id: string;
  type: string;
  title: string;
  document_date: string;
  mime_type: string;
  file_size_bytes: number;
  source_lab: string | null;
}

export interface SharedScan {
  id: string;
  scan_type: string;
  body_area: string;
  findings_summary: string;
  impression: string | null;
  ordering_doctor: string | null;
  scan_date: string;
}

async function shareGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`/api/share/${token}${path}`);
  if (res.status === 410) throw new Error("expired");
  if (!res.ok) throw new Error("not_found");
  return res.json() as Promise<T>;
}

export function useSharedLabs(token: string) {
  return useQuery({
    queryKey: ["shared-labs", token],
    queryFn: () => shareGet<{ categories: BloodWorkCategory[] }>(token, "/labs"),
    retry: false,
  });
}

export interface SharedVitalsParams {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useSharedVitals(token: string, params?: SharedVitalsParams) {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.dateFrom) qs.set("date_from", params.dateFrom);
  if (params?.dateTo) qs.set("date_to", params.dateTo);
  const path = qs.size > 0 ? `/vitals?${qs.toString()}` : "/vitals";
  return useQuery({
    queryKey: ["shared-vitals", token, params?.type ?? null, params?.dateFrom ?? null, params?.dateTo ?? null],
    queryFn: () => shareGet<{ vitals: VitalReading[] }>(token, path),
    retry: false,
  });
}

export function useSharedMedications(token: string) {
  return useQuery({
    queryKey: ["shared-medications", token],
    queryFn: () => shareGet<{ medications: SharedMedication[] }>(token, "/medications"),
    retry: false,
  });
}

export function useSharedScans(token: string) {
  return useQuery({
    queryKey: ["shared-scans", token],
    queryFn: () => shareGet<{ scans: SharedScan[] }>(token, "/scans"),
    retry: false,
  });
}

export function useSharedDocuments(token: string) {
  return useQuery({
    queryKey: ["shared-documents", token],
    queryFn: () => shareGet<{ documents: SharedDocument[] }>(token, "/documents"),
    retry: false,
  });
}
