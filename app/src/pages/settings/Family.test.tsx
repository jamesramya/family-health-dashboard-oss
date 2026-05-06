import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Family } from "./Family";

let mockRole = "admin";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mockRole },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-admin", () => ({
  usePatients: () => ({
    data: { patients: [{ id: "p1", name: "Demo", date_of_birth: "1950-03-04", gender: "f", blood_type: "O+", allergies: null, photo_r2_key: null }] },
    isLoading: false,
  }),
  useCreatePatient: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePatient: () => ({ mutate: vi.fn(), isPending: false }),
  usePurgePatientData: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderFamily(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/settings?section=family${search ? `&${search}` : ""}`]}>
        <Family />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Family", () => {
  it("renders the Family members card for admin", () => {
    mockRole = "admin";
    renderFamily();
    expect(screen.getByText("Family members")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("mounts with ?action=add → add form is shown", () => {
    mockRole = "admin";
    renderFamily("action=add");
    expect(screen.getByText("New person")).toBeInTheDocument();
  });

  it("mounts without action param → add form is not shown", () => {
    mockRole = "admin";
    renderFamily();
    expect(screen.queryByText("New person")).not.toBeInTheDocument();
  });

  it("non-admin renders nothing", () => {
    mockRole = "viewer";
    const { container } = renderFamily();
    expect(container.firstChild).toBeNull();
  });

  it("Family members h3 uses Inter semibold, not Instrument Serif", () => {
    mockRole = "admin";
    renderFamily();
    const h3 = screen.getByRole("heading", { level: 3, name: /family members/i });
    expect(h3.className).not.toContain("font-serif");
    expect(h3.className).not.toContain("font-display");
    expect(h3.className).toContain("font-semibold");
  });
});
