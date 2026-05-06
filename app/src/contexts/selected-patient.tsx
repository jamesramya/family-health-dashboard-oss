import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useDefaultPatientId, usePatients } from "@/hooks/use-admin";

interface SelectedPatientContextValue {
  patientId: string | undefined;
  patientName: string | undefined;
  setSelectedId: (id: string | undefined) => void;
}

const SelectedPatientContext = createContext<SelectedPatientContextValue | null>(null);

export function SelectedPatientProvider({ children }: { children: ReactNode }) {
  const [explicitId, setExplicitId] = useState<string | undefined>(undefined);
  const { patientId: defaultId } = useDefaultPatientId();
  const { data: patientsData } = usePatients();

  const patientId = explicitId ?? defaultId;
  const patients = patientsData?.patients ?? [];
  const patientName = patients.find((p) => p.id === patientId)?.name;

  const value = useMemo(
    () => ({ patientId, patientName, setSelectedId: setExplicitId }),
    [patientId, patientName]
  );

  return (
    <SelectedPatientContext.Provider value={value}>
      {children}
    </SelectedPatientContext.Provider>
  );
}

export function useSelectedPatient(): SelectedPatientContextValue {
  const ctx = useContext(SelectedPatientContext);
  if (!ctx) throw new Error("useSelectedPatient must be used inside SelectedPatientProvider");
  return ctx;
}
