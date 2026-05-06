import { BottomSheet } from "./BottomSheet";
import { MedicationForm } from "./MedicationForm";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  patientId: string;
  patientName: string;
}

export function AddMedicationSheet({ isOpen, onClose, onSaved, patientId, patientName }: Props) {
  function handleSuccess() {
    onSaved?.();
    onClose();
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="New medication"
      title={patientName ? `Add to ${patientName}` : "Add medication"}
    >
      <div className="px-4 py-2 pb-8 overflow-y-auto">
        <MedicationForm
          patientId={patientId}
          onSuccess={handleSuccess}
          onCancel={onClose}
        />
      </div>
    </BottomSheet>
  );
}
