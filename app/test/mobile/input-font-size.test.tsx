import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Login } from "@/pages/Login";
import { Setup } from "@/pages/Setup";
import { ChangePassword } from "@/pages/ChangePassword";
import { MedicationForm } from "@/components/MedicationForm";
import { VitalLogPanel } from "@/components/VitalLogPanel";
import { NoteFormPanel } from "@/components/NoteFormPanel";

vi.mock("@/hooks/use-turnstile", () => ({
  useTurnstile: () => ({ ref: { current: null }, token: "mock-token", reset: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({ setup_complete: false }),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/hooks/use-medications", () => ({
  useCreateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-vitals", () => ({
  useCreateVital: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-notes", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateNote: () => ({ mutate: vi.fn(), isPending: false }),
  useNotes: () => ({ data: { notes: [] } }),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: () => ({ data: { documents: [] } }),
}));

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function noTinyFontInputs(container: HTMLElement) {
  const inputs = Array.from(
    container.querySelectorAll<HTMLElement>("input, textarea, select")
  );
  inputs.forEach((el) => {
    expect(el.className).not.toMatch(/\btext-xs\b|\btext-sm\b/);
  });
  return inputs.length;
}

describe("iOS 16px input floor", () => {
  it("Login has no text-xs/text-sm inputs", () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    noTinyFontInputs(container);
  });

  it("Setup has no text-xs/text-sm inputs", () => {
    const { container } = render(
      <MemoryRouter>
        <Setup />
      </MemoryRouter>
    );
    noTinyFontInputs(container);
  });

  it("ChangePassword has no text-xs/text-sm inputs", () => {
    const { container } = render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );
    noTinyFontInputs(container);
  });
});

describe("iOS 16px input floor — form components", () => {
  it("MedicationForm has no text-xs/text-sm inputs, textareas, or selects", () => {
    const { container } = render(
      <QueryClientProvider client={makeQC()}>
        <MedicationForm patientId="p1" onSuccess={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>
    );
    noTinyFontInputs(container);
  });

  it("VitalLogPanel has no text-xs/text-sm inputs, textareas, or selects", () => {
    const { container } = render(
      <QueryClientProvider client={makeQC()}>
        <VitalLogPanel patientId="p1" />
      </QueryClientProvider>
    );
    noTinyFontInputs(container);
  });

  it("NoteFormPanel has no text-xs/text-sm inputs, textareas, or selects", () => {
    const { container } = render(
      <QueryClientProvider client={makeQC()}>
        <NoteFormPanel patientId="p1" onSuccess={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>
    );
    noTinyFontInputs(container);
  });
});

describe("Auth form autocomplete attributes", () => {
  it("Login email input has autoComplete='email'", () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const emailInput = container.querySelector<HTMLInputElement>('input[type="email"]');
    expect(emailInput).not.toBeNull();
    expect(emailInput?.getAttribute("autocomplete")).toBe("email");
  });

  it("Login password input has autoComplete='current-password'", () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const pwInput = container.querySelector<HTMLInputElement>('input[type="password"]');
    expect(pwInput).not.toBeNull();
    expect(pwInput?.getAttribute("autocomplete")).toBe("current-password");
  });

  it("ChangePassword old_password input has autoComplete='current-password'", () => {
    const { container } = render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    const currentPw = Array.from(inputs).find(
      (i) => i.getAttribute("autocomplete") === "current-password"
    );
    expect(currentPw).not.toBeUndefined();
  });

  it("ChangePassword new_password input has autoComplete='new-password'", () => {
    const { container } = render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    const newPw = Array.from(inputs).find(
      (i) => i.getAttribute("autocomplete") === "new-password"
    );
    expect(newPw).not.toBeUndefined();
  });
});
