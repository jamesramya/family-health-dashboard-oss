import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AIModels } from "./AIModels";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { api } from "@/lib/api";

function wrap(ui: React.ReactElement) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={c}>{ui}</QueryClientProvider>;
}

const BASE_PROVIDERS = [
  { provider: "openai", has_key: false, source: null, model: null },
  { provider: "anthropic", has_key: false, source: null, model: null },
  { provider: "google", has_key: false, source: null, model: null },
  { provider: "deepgram", has_key: false, source: null, model: null },
  { provider: "mistral", has_key: false, source: null, model: null },
  { provider: "groq", has_key: false, source: null, model: null },
  { provider: "cohere", has_key: false, source: null, model: null },
  { provider: "workers-ai", has_key: false, source: null, model: null },
  { provider: "perplexity", has_key: false, source: null, model: null },
];

const BASE_USE_CASES = [
  { use_case: "doc_extract", provider: "google", model: "gemini-2.5-flash" },
  { use_case: "vitals_parse", provider: "google", model: "gemini-2.5-flash" },
  { use_case: "test_disambig", provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  { use_case: "ref_range", provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  { use_case: "voice_trans", provider: "deepgram", model: "nova-3" },
];

const BASE_GATEWAY = { account_id: null, gateway_id: null, source: null };

describe("AIModels — env-sourced providers", () => {
  it("shows 'Env var' badge, no rotate/remove buttons, but an Override button when source=env", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") {
        return Promise.resolve({
          providers: BASE_PROVIDERS.map((p) =>
            p.provider === "anthropic"
              ? { ...p, has_key: true, source: "env" }
              : p
          ),
        });
      }
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve(BASE_GATEWAY);
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    expect(await screen.findByText("Env var")).toBeInTheDocument();
    expect(screen.getByText("Configured via environment variable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rotate key/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /override/i })).toBeInTheDocument();
  });

  it("clicking Override on an env-sourced provider reveals the key form with amber note", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") {
        return Promise.resolve({
          providers: BASE_PROVIDERS.map((p) =>
            p.provider === "anthropic"
              ? { ...p, has_key: true, source: "env" }
              : p
          ),
        });
      }
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve(BASE_GATEWAY);
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    const overrideBtn = await screen.findByRole("button", { name: /override/i });
    fireEvent.click(overrideBtn);
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByText(/override the environment variable/i)).toBeInTheDocument();
  });

  it("shows green 'Key saved' badge and action buttons when source=d1", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") {
        return Promise.resolve({
          providers: BASE_PROVIDERS.map((p) =>
            p.provider === "openai"
              ? { ...p, has_key: true, source: "d1", model: "gpt-4.1" }
              : p
          ),
        });
      }
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve(BASE_GATEWAY);
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    expect(await screen.findByText("Key saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rotate key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});

function mockBaseApi() {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/ai/providers") return Promise.resolve({ providers: BASE_PROVIDERS });
    if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
    if (path === "/ai/gateway") return Promise.resolve(BASE_GATEWAY);
    return Promise.resolve({});
  });
}

describe("AIModels — env-sourced gateway", () => {
  it("shows read-only gateway info when source=env, with an Override button", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") return Promise.resolve({ providers: BASE_PROVIDERS });
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve({
        account_id: "cf-acct-abc123",
        gateway_id: "family-health",
        source: "env",
      });
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    expect(await screen.findByText("cf-acct-abc123")).toBeInTheDocument();
    expect(screen.getByText("family-health")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save gateway/i })).not.toBeInTheDocument();
    expect(screen.getByText(/configured via environment variable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /override/i })).toBeInTheDocument();
  });

  it("clicking Override on env-sourced gateway reveals editable form pre-populated with env values", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") return Promise.resolve({ providers: BASE_PROVIDERS });
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve({
        account_id: "cf-acct-abc123",
        gateway_id: "family-health",
        source: "env",
      });
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    const overrideBtn = await screen.findByRole("button", { name: /override/i });
    fireEvent.click(overrideBtn);
    expect(screen.getByRole("button", { name: /save gateway/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("cf-acct-abc123")).toBeInTheDocument();
    expect(screen.getByDisplayValue("family-health")).toBeInTheDocument();
    expect(screen.getByText(/override the ai_gateway_url/i)).toBeInTheDocument();
  });

  it("clicking Cancel on env-sourced gateway override returns to read-only env view", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") return Promise.resolve({ providers: BASE_PROVIDERS });
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve({
        account_id: "cf-acct-abc123",
        gateway_id: "family-health",
        source: "env",
      });
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    const overrideBtn = await screen.findByRole("button", { name: /override/i });
    fireEvent.click(overrideBtn);
    expect(screen.getByRole("button", { name: /save gateway/i })).toBeInTheDocument();
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByRole("button", { name: /save gateway/i })).not.toBeInTheDocument();
    expect(screen.getByText(/configured via environment variable/i)).toBeInTheDocument();
  });

  it("after a successful gateway save, Cancel button and amber override note are gone", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") return Promise.resolve({ providers: BASE_PROVIDERS });
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve({
        account_id: "cf-acct-abc123",
        gateway_id: "family-health",
        source: "env",
      });
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    const overrideBtn = await screen.findByRole("button", { name: /override/i });
    fireEvent.click(overrideBtn);
    const saveBtn = screen.getByRole("button", { name: /save gateway/i });
    fireEvent.click(saveBtn);
    // After save, overriding resets → Cancel disappears
    await screen.findByRole("button", { name: /override/i }); // read-only view returns
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/override the ai_gateway_url/i)).not.toBeInTheDocument();
  });

  it("shows editable form when source=d1", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") return Promise.resolve({ providers: BASE_PROVIDERS });
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve({
        account_id: "d1-acct",
        gateway_id: "d1-gw",
        source: "d1",
      });
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    expect(await screen.findByRole("button", { name: /save gateway/i })).toBeInTheDocument();
  });
});

describe("AIModels — smoke tests", () => {
  it("renders the section heading", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    expect(await screen.findByText("AI models")).toBeInTheDocument();
  });

  it("renders all 9 provider rows", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    await screen.findByText("AI models");
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anthropic").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/google gemini/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deepgram").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mistral").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Groq").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cohere").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/workers ai/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Perplexity").length).toBeGreaterThan(0);
  });

  it("shows Key saved pill for providers that have_key=true", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/ai/providers") {
        return Promise.resolve({
          providers: BASE_PROVIDERS.map((p) =>
            p.provider === "google"
              ? { ...p, has_key: true, source: "d1", model: "gemini-2.5-flash" }
              : p
          ),
        });
      }
      if (path === "/ai/use-cases") return Promise.resolve({ use_cases: BASE_USE_CASES });
      if (path === "/ai/gateway") return Promise.resolve(BASE_GATEWAY);
      return Promise.resolve({});
    });
    render(wrap(<AIModels />));
    expect(await screen.findByText("Key saved")).toBeInTheDocument();
  });

  it("renders the Cloudflare AI Gateway card with account_id and gateway_id fields", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    expect(await screen.findByText(/cloudflare account id/i)).toBeInTheDocument();
    expect(screen.getByText(/gateway id/i)).toBeInTheDocument();
  });

  it("renders the use-case routing matrix with 5 rows", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    await screen.findByText("AI models");
    expect(screen.getByText("Document extraction")).toBeInTheDocument();
    expect(screen.getByText("Vitals parsing")).toBeInTheDocument();
    expect(screen.getByText("Test disambiguation")).toBeInTheDocument();
    expect(screen.getByText("Reference range arbitration")).toBeInTheDocument();
    expect(screen.getByText("Voice transcription")).toBeInTheDocument();
  });

  it("renders the Voice Notes sub-section", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    expect(await screen.findByText("Voice notes")).toBeInTheDocument();
  });

  it("renders transcribe, format, and keep audio toggles in Voice Notes", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    await screen.findByText("Voice notes");
    expect(screen.getByText("Transcribe voice notes")).toBeInTheDocument();
    expect(screen.getByText("Auto-format transcript")).toBeInTheDocument();
    expect(screen.getByText("Keep original audio")).toBeInTheDocument();
  });

  it("gateway card shows Not set pill when account_id is null", async () => {
    mockBaseApi();
    render(wrap(<AIModels />));
    expect(await screen.findByText("Not set")).toBeInTheDocument();
  });

  it("page title uses font-semibold, not font-serif", async () => {
    mockBaseApi();
    const { container } = render(wrap(<AIModels />));
    await screen.findByText("AI models");
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).toContain("font-semibold");
    expect(h2!.className).not.toMatch(/font-serif|font-display/);
  });
});
