import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VitalLogPanel } from "./VitalLogPanel";

vi.mock("@/hooks/use-vitals", () => ({
  useCreateVital: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VitalLogPanel patientId="p1" />
    </QueryClientProvider>
  );
}

describe("VitalLogPanel", () => {
  it("contains no legacy gray, blue, or red Tailwind tokens in rendered output", () => {
    const { container } = renderPanel();
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-(gray|blue|red)-/);
  });
});
