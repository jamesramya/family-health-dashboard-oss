import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIModels } from "./AIModels";
import { loadAISettings, saveAISettings } from "@/lib/ai-settings";

vi.mock("@/lib/ai-settings", () => ({
  loadAISettings: vi.fn(),
  saveAISettings: vi.fn(),
  USE_CASE_INFO: {
    doc_extract:   { label: "Document extraction",         description: "PDF → structured JSON",         primaryModel: "gemini-2.5-flash",         fallbackModel: "gpt-4.1-mini" },
    vitals_parse:  { label: "Vitals parsing",              description: "NLP from voice or text input",  primaryModel: "gemini-2.5-flash",         fallbackModel: "gpt-4.1-nano" },
    test_disambig: { label: "Test disambiguation",         description: "Resolves ambiguous test names", primaryModel: "claude-haiku-4-5-20251001", fallbackModel: null, fallbackNote: "flags for review" },
    ref_range:     { label: "Reference range arbitration", description: "Selects reference ranges",       primaryModel: "claude-haiku-4-5-20251001", fallbackModel: null },
    voice_trans:   { label: "Voice transcription",         description: "Audio → text",                  primaryModel: "Deepgram nova-3",           fallbackModel: null },
  },
}));

const mockLoad = loadAISettings as ReturnType<typeof vi.fn>;
const mockSave = saveAISettings as ReturnType<typeof vi.fn>;

const DEFAULT_SETTINGS = {
  gatewayUrl: "",
  keys: { openai: "", anthropic: "", google: "" },
  routing: { lab_extraction: "openai", voice_transcription: "openai", note_summarization: "openai" },
};

describe("AIModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockReturnValue(DEFAULT_SETTINGS);
  });

  it("renders gateway URL input", () => {
    render(<AIModels />);
    expect(screen.getByPlaceholderText(/gateway\.ai\.cloudflare/i)).toBeInTheDocument();
  });

  it("reveal toggle changes openai input from password to text", async () => {
    const user = userEvent.setup();
    render(<AIModels />);
    const input = screen.getAllByPlaceholderText(/sk-/i)[0] as HTMLInputElement;
    expect(input.type).toBe("password");
    await user.click(screen.getByRole("button", { name: /show openai key/i }));
    expect(input.type).toBe("text");
  });

  it("Save calls saveAISettings with merged state", async () => {
    const user = userEvent.setup();
    render(<AIModels />);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayUrl: expect.any(String), keys: expect.any(Object) })
    );
  });

  it("renders all 5 use-case rows with primary model", () => {
    render(<AIModels />);
    expect(screen.getByText("Document extraction")).toBeInTheDocument();
    expect(screen.getByText("Vitals parsing")).toBeInTheDocument();
    expect(screen.getByText("Test disambiguation")).toBeInTheDocument();
    expect(screen.getByText("Reference range arbitration")).toBeInTheDocument();
    expect(screen.getByText("Voice transcription")).toBeInTheDocument();
    expect(screen.getAllByText("gemini-2.5-flash").length).toBeGreaterThanOrEqual(1);
  });

  it("shows fallback model inline for use-cases that have one", () => {
    render(<AIModels />);
    expect(screen.getByText(/Fallback: gpt-4\.1-mini/)).toBeInTheDocument();
  });

  it("shows Deepgram in provider keys section", () => {
    render(<AIModels />);
    expect(screen.getByText("Deepgram")).toBeInTheDocument();
  });

  it("shows Saved. after Save", async () => {
    const user = userEvent.setup();
    render(<AIModels />);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("does not show 'Key saved' when key is empty", () => {
    mockLoad.mockReturnValue({
      gatewayUrl: "",
      keys: { openai: "", anthropic: "", google: "" },
      routing: { lab_extraction: "openai", voice_transcription: "openai", note_summarization: "openai" },
    });
    render(<AIModels />);
    expect(screen.queryByText("Key saved")).not.toBeInTheDocument();
  });

  it("shows 'Key saved' badge when openai key is set", () => {
    mockLoad.mockReturnValue({
      gatewayUrl: "",
      keys: { openai: "sk-abc", anthropic: "", google: "" },
      routing: { lab_extraction: "openai", voice_transcription: "openai", note_summarization: "openai" },
    });
    render(<AIModels />);
    expect(screen.getByText("Key saved")).toBeInTheDocument();
  });

  it("shows multiple 'Key saved' badges when multiple keys are set", () => {
    mockLoad.mockReturnValue({
      gatewayUrl: "",
      keys: { openai: "sk-abc", anthropic: "sk-ant", google: "" },
      routing: { lab_extraction: "openai", voice_transcription: "openai", note_summarization: "openai" },
    });
    render(<AIModels />);
    expect(screen.getAllByText("Key saved")).toHaveLength(2);
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(<AIModels />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
