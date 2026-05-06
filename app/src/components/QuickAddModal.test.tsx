import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QuickAddModal, type QuickAddKind } from "./QuickAddModal";

vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock("@/contexts/selected-patient", () => ({
  useSelectedPatient: vi.fn().mockReturnValue({
    patientId: "p1",
    patientName: "Demo",
    setSelectedId: vi.fn(),
  }),
}));

vi.mock("@/components/VitalLogPanel", () => ({
  VitalLogPanel: ({ patientId }: { patientId: string }) => (
    <div data-testid="vital-form">{patientId}</div>
  ),
}));

vi.mock("@/components/MedicationForm", () => ({
  MedicationForm: ({ patientId }: { patientId: string }) => (
    <div data-testid="medication-form">{patientId}</div>
  ),
}));

vi.mock("@/components/NoteFormPanel", () => ({
  NoteFormPanel: ({ patientId }: { patientId: string }) => (
    <div data-testid="note-form">{patientId}</div>
  ),
}));

vi.mock("@/components/DocumentUpload", () => ({
  DocumentUpload: ({ patientId, onSuccess }: { patientId: string; onSuccess?: () => void }) => (
    <div data-testid="doc-upload">
      {patientId}
      <button onClick={onSuccess}>trigger-success</button>
    </div>
  ),
}));

vi.mock("@/contexts/upload-queue", () => ({
  useUploadQueue: () => ({ enqueue: vi.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

function renderModal(kind: QuickAddKind) {
  return render(wrap(<QuickAddModal kind={kind} onClose={vi.fn()} />));
}

describe("QuickAddModal — lab/scan kinds", () => {
  it("renders DocumentUpload when kind=lab (via LabUploadPanel)", () => {
    renderModal("lab");
    expect(screen.getByTestId("doc-upload")).toBeInTheDocument();
  });

  it("renders the coming soon message when kind=scan", () => {
    renderModal("scan");
    expect(screen.getByText(/Scan upload is coming soon/i)).toBeInTheDocument();
  });

  it("renders an 'Upload as document instead' button when kind=scan", () => {
    renderModal("scan");
    expect(
      screen.getByRole("button", { name: /Upload as document instead/i })
    ).toBeInTheDocument();
  });

  it("calls onClose immediately when lab upload succeeds (no success screen)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(wrap(<QuickAddModal kind="lab" onClose={onClose} />));
    await user.click(screen.getByRole("button", { name: "trigger-success" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking 'Upload as document instead'", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(wrap(<QuickAddModal kind="scan" onClose={onClose} />));
    await user.click(
      screen.getByRole("button", { name: /Upload as document instead/i })
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe("QuickAddModal — patientId from SelectedPatientContext", () => {
  it("passes patientId from context to VitalLogPanel", async () => {
    const { useSelectedPatient } = await import("@/contexts/selected-patient");
    vi.mocked(useSelectedPatient).mockReturnValue({
      patientId: "p2",
      patientName: "Test Patient",
      setSelectedId: vi.fn(),
    });
    renderModal("vital");
    expect(screen.getByTestId("vital-form")).toHaveTextContent("p2");
  });
});

describe("QuickAddModal — META titles", () => {
  const cases: Array<[QuickAddKind, string]> = [
    ["vital", "Log Vital"],
    ["medication", "Add Medication"],
    ["note", "Add Note"],
    ["document", "Upload Document"],
    ["lab", "Upload Lab"],
    ["scan", "Add Scan"],
  ];

  it.each(cases)("kind=%s has title %s", (kind, expectedTitle) => {
    renderModal(kind);
    expect(screen.getByRole("dialog", { name: expectedTitle })).toBeInTheDocument();
  });
});
