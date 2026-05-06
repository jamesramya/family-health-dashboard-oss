import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceNotes } from "./VoiceNotes";
import { saveVoiceSettings } from "@/lib/voice-settings";

vi.mock("@/lib/voice-settings", () => ({
  loadVoiceSettings: () => ({ enabled: false, autoTranscribe: false }),
  saveVoiceSettings: vi.fn(),
}));

const mockSave = saveVoiceSettings as ReturnType<typeof vi.fn>;

describe("VoiceNotes", () => {
  it("renders enabled toggle off by default", () => {
    render(<VoiceNotes />);
    expect(screen.getByRole("switch", { name: /enable voice recording/i })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking enabled toggle flips it on", async () => {
    const user = userEvent.setup();
    render(<VoiceNotes />);
    await user.click(screen.getByRole("switch", { name: /enable voice recording/i }));
    expect(screen.getByRole("switch", { name: /enable voice recording/i })).toHaveAttribute("aria-checked", "true");
  });

  it("Save button calls saveVoiceSettings", async () => {
    const user = userEvent.setup();
    render(<VoiceNotes />);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(mockSave).toHaveBeenCalled();
  });

  it("shows Saved. after Save click", async () => {
    const user = userEvent.setup();
    render(<VoiceNotes />);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(<VoiceNotes />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
