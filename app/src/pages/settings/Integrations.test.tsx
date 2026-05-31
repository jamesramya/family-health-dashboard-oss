import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Integrations } from "./Integrations";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), delete: vi.fn() } }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock("@/hooks/use-admin", () => ({ usePatients: () => ({ data: { patients: [] } }) }));

import { api } from "@/lib/api";
const mockApi = vi.mocked(api);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const MOCK_CLIENTS = [
  { id: "c1", client_name: "Claude Desktop", scopes: "mcp.read mcp.write", created_at: "2026-01-01T00:00:00.000Z", last_used_at: "2026-05-01T10:00:00.000Z" },
];

const MOCK_LOG = {
  entries: [],
  total: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes("/user/oauth-clients/log")) return Promise.resolve(MOCK_LOG);
    if (path.includes("/user/oauth-clients")) return Promise.resolve({ clients: MOCK_CLIENTS });
    if (path.includes("/admin/patients")) return Promise.resolve({ patients: [] });
    return Promise.reject(new Error("Unknown path: " + path));
  });
});

describe("Integrations", () => {
  it("renders ConnectViaMcpCard with MCP URL", async () => {
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByText("Connect via MCP")).toBeInTheDocument();
    });
    expect(screen.getByText(/\/mcp/)).toBeInTheDocument();
  });

  it("renders PHI ribbon when there are connected apps", async () => {
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: /PHI flow reminder/i })).toBeInTheDocument();
    });
  });

  it("does NOT render PHI ribbon when no apps connected", async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes("/user/oauth-clients/log")) return Promise.resolve(MOCK_LOG);
      if (path.includes("/user/oauth-clients")) return Promise.resolve({ clients: [] });
      if (path.includes("/admin/patients")) return Promise.resolve({ patients: [] });
      return Promise.reject(new Error("Unknown path: " + path));
    });
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByText("Connect via MCP")).toBeInTheDocument();
    });
    expect(screen.queryByRole("complementary", { name: /PHI flow reminder/i })).not.toBeInTheDocument();
  });

  it("renders AuthorizedAppsCard with app name and revoke button", async () => {
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByText("Claude Desktop")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("renders scope chip for read+write app", async () => {
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByText("Claude Desktop")).toBeInTheDocument();
    });
    expect(screen.getByText("write")).toBeInTheDocument();
  });

  it("renders AccessLogSection header", async () => {
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByText("Access log")).toBeInTheDocument();
    });
  });

  it("revoke button triggers confirm and calls delete", async () => {
    wrap(<Integrations />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
    });
    mockApi.delete.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith("/user/oauth-clients/c1");
    });
  });
});
