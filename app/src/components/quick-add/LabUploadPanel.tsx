import { DocumentUpload } from "@/components/DocumentUpload";

export function LabUploadPanel({
  patientId,
  onSuccess,
}: {
  patientId: string;
  onSuccess?: () => void;
}) {
  return <DocumentUpload patientId={patientId} onSuccess={onSuccess} defaultType="blood_report" />;
}
