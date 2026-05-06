import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FamilyStrip } from "./FamilyStrip";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import type { Patient } from "@/types/api";

const PATIENTS: Patient[] = [
  { id: "p1", name: "Demo", date_of_birth: "1950-03-04", gender: "f",
    blood_type: "O+", allergies: null, photo_r2_key: null },
  { id: "p2", name: "Ravi",       date_of_birth: "1978-11-12", gender: "m",
    blood_type: null, allergies: null, photo_r2_key: null },
];

function renderWithPrefs(ui: React.ReactElement) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

describe("FamilyStrip", () => {
  it("renders a tile per person with name and status label", () => {
    renderWithPrefs(
      <FamilyStrip
        patients={PATIENTS}
        selectedId="p1"
        onSelect={() => {}}
        canAddPerson
        onAddPerson={() => {}}
        statusFor={() => "well"}
      />
    );
    expect(screen.getByRole("button", { name: /demo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ravi/i })).toBeInTheDocument();
  });

  it("marks the selected tile with aria-current='true'", () => {
    renderWithPrefs(
      <FamilyStrip
        patients={PATIENTS}
        selectedId="p2"
        onSelect={() => {}}
        statusFor={() => "well"}
      />
    );
    expect(screen.getByRole("button", { name: /ravi/i })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /demo/i })).toHaveAttribute("aria-current", "false");
  });

  it("invokes onSelect with the person id when a tile is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithPrefs(
      <FamilyStrip
        patients={PATIENTS}
        selectedId="p1"
        onSelect={onSelect}
        statusFor={() => "well"}
      />
    );
    await user.click(screen.getByRole("button", { name: /ravi/i }));
    expect(onSelect).toHaveBeenCalledWith("p2");
  });

  it("scroll container has fade-scroll-right class", () => {
    const { container } = renderWithPrefs(
      <FamilyStrip
        patients={PATIENTS}
        selectedId="p1"
        onSelect={() => {}}
        statusFor={() => "well"}
      />
    );
    const scrollContainer = container.querySelector('[aria-label="Family members"]');
    expect(scrollContainer?.className).toMatch(/fade-scroll-right/);
  });

  it("shows 'Add person' tile only when canAddPerson is true", () => {
    const { rerender } = renderWithPrefs(
      <FamilyStrip
        patients={PATIENTS}
        selectedId="p1"
        onSelect={() => {}}
        statusFor={() => "well"}
      />
    );
    expect(screen.queryByRole("button", { name: /add person/i })).not.toBeInTheDocument();

    rerender(
      <PreferencesProvider>
        <FamilyStrip
          patients={PATIENTS}
          selectedId="p1"
          onSelect={() => {}}
          canAddPerson
          onAddPerson={() => {}}
          statusFor={() => "well"}
        />
      </PreferencesProvider>
    );
    expect(screen.getByRole("button", { name: /add person/i })).toBeInTheDocument();
  });
});
