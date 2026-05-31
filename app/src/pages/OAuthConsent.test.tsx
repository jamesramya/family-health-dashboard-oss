import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OAuthConsent } from "./OAuthConsent";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from "@/lib/api";
const mockApi = vi.mocked(api);

const CONSENT_URL =
  "/oauth/authorize?client_id=client-1&scope=mcp.read&redirect_uri=https://claude.ai/callback&state=xyz&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&resource=http://localhost/mcp&response_type=code";

const INFO_RESPONSE = {
  client_id: "client-1",
  client_name: "Claude Desktop",
  scope_descriptions: ["Read your family's health records"],
  redirect_uri: "https://claude.ai/callback",
  redirect_uri_host: "claude.ai",
};

const INFO_UNKNOWN = {
  client_id: "unknown-1",
  client_name: "Some Random App",
  scope_descriptions: ["Read your family's health records"],
  redirect_uri: "http://localhost:3000/cb",
  redirect_uri_host: "localhost",
};

const WRITE_CONSENT_URL =
  "/oauth/authorize?client_id=client-1&scope=mcp.read+mcp.write&redirect_uri=https://claude.ai/callback&state=xyz&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&resource=http://localhost/mcp&response_type=code";

const INFO_WRITE_RESPONSE = {
  ...INFO_RESPONSE,
  scope_descriptions: ["Read your family's health records", "Read and write health data"],
};

Object.defineProperty(window, "location", {
  value: { assign: vi.fn(), pathname: "/oauth/authorize", search: "" },
  writable: true,
});

function renderConsent(url = CONSENT_URL) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/oauth/authorize" element={<OAuthConsent />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (window.location.assign as ReturnType<typeof vi.fn>).mockReset?.();
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes("/auth/me"))
      return Promise.resolve({ user: { display_name: "Test User", email: "test@test.com" } });
    return Promise.resolve(INFO_RESPONSE);
  });
  mockApi.post.mockResolvedValue({ redirect_to: "https://claude.ai/callback?code=abc" });
});

describe("OAuthConsent", () => {
  it("renders client name from info response", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument();
    });
  });

  it("renders scope descriptions", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByText(/Read your family's health records/i)).toBeInTheDocument();
    });
  });

  it("renders redirect_uri host as footnote", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByText(/claude\.ai/)).toBeInTheDocument();
    });
  });

  it("renders Deny and Approve buttons", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    });
  });

  it("renders 'Verified publisher' badge for known client", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByText(/Verified publisher/i)).toBeInTheDocument();
    });
  });

  it("renders 'Unrecognized app' badge for unknown client name", async () => {
    mockApi.get.mockResolvedValue(INFO_UNKNOWN);
    renderConsent();
    await waitFor(() => {
      expect(screen.getByText(/Unrecognized app/i)).toBeInTheDocument();
    });
  });

  it("renders unverified warning for unknown client", async () => {
    mockApi.get.mockResolvedValue(INFO_UNKNOWN);
    renderConsent();
    await waitFor(() => {
      expect(screen.getByText(/This app isn't published by anyone we know/i)).toBeInTheDocument();
    });
  });

  it("Approve button posts to /oauth/authorize/decision and redirects", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        "/oauth/authorize/decision",
        expect.objectContaining({ decision: "approve" })
      );
    });
    expect(window.location.assign).toHaveBeenCalledWith("https://claude.ai/callback?code=abc");
  });

  it("Deny button posts decision=deny", async () => {
    renderConsent();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        "/oauth/authorize/decision",
        expect.objectContaining({ decision: "deny" })
      );
    });
  });

  it("renders error message for missing required params", () => {
    render(
      <MemoryRouter initialEntries={["/oauth/authorize"]}>
        <Routes>
          <Route path="/oauth/authorize" element={<OAuthConsent />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/required parameters are missing/i)).toBeInTheDocument();
  });

  describe("scope toggle", () => {
    beforeEach(() => {
      mockApi.get.mockImplementation((path: string) => {
        if (path.includes("/auth/me"))
          return Promise.resolve({ user: { display_name: "Test User", email: "test@test.com" } });
        return Promise.resolve(INFO_WRITE_RESPONSE);
      });
    });

    it("renders a checkbox on the write scope row when scope includes mcp.write", async () => {
      renderConsent(WRITE_CONSENT_URL);
      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: /grant write access/i })).toBeInTheDocument();
      });
    });

    it("does not render a checkbox for read-only scope", async () => {
      renderConsent(); // CONSENT_URL has scope=mcp.read only
      await waitFor(() => {
        expect(screen.queryByRole("checkbox", { name: /grant write access/i })).toBeNull();
      });
    });

    it("Approve with write checkbox checked (default) sends granted_scope equal to full requested scope", async () => {
      renderConsent(WRITE_CONSENT_URL);
      await waitFor(() => screen.getByRole("button", { name: /approve/i }));
      const checkbox = screen.getByRole("checkbox", { name: /grant write access/i });
      expect(checkbox).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          "/oauth/authorize/decision",
          expect.objectContaining({ granted_scope: "mcp.read mcp.write" })
        );
      });
    });

    it("Approve with write checkbox unchecked sends granted_scope=mcp.read", async () => {
      renderConsent(WRITE_CONSENT_URL);
      await waitFor(() => screen.getByRole("checkbox", { name: /grant write access/i }));
      fireEvent.click(screen.getByRole("checkbox", { name: /grant write access/i })); // uncheck
      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          "/oauth/authorize/decision",
          expect.objectContaining({ granted_scope: "mcp.read" })
        );
      });
    });

    it("Deny does not send granted_scope", async () => {
      renderConsent(WRITE_CONSENT_URL);
      await waitFor(() => screen.getByRole("button", { name: /deny/i }));
      fireEvent.click(screen.getByRole("button", { name: /deny/i }));
      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          "/oauth/authorize/decision",
          expect.not.objectContaining({ granted_scope: expect.anything() })
        );
      });
    });
  });
});
