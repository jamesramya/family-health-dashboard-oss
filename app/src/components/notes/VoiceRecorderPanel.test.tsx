import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceRecorderPanel } from "./VoiceRecorderPanel";

const mockStop = vi.fn();
const mockStart = vi.fn();

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { mockStart(); }
  stop() { mockStop(); this.onstop?.(); }
}

function setupMediaDevices(opts: { reject?: boolean } = {}) {
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: opts.reject
        ? vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"))
        : vi.fn().mockResolvedValue(stream),
    },
    configurable: true,
  });
}

describe("VoiceRecorderPanel", () => {
  beforeEach(() => {
    mockStop.mockClear();
    mockStart.mockClear();
  });

  it("shows Record button initially", () => {
    setupMediaDevices();
    render(<VoiceRecorderPanel onRecording={vi.fn()} />);
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop recording/i })).not.toBeInTheDocument();
  });

  it("shows Stop button after clicking Record", async () => {
    setupMediaDevices();
    const user = userEvent.setup();
    render(<VoiceRecorderPanel onRecording={vi.fn()} />);
    await act(async () => { await user.click(screen.getByRole("button", { name: /start recording/i })); });
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
  });

  it("shows permission denied error when getUserMedia rejects", async () => {
    setupMediaDevices({ reject: true });
    const user = userEvent.setup();
    render(<VoiceRecorderPanel onRecording={vi.fn()} />);
    await act(async () => { await user.click(screen.getByRole("button", { name: /start recording/i })); });
    expect(screen.getByText("Microphone permission denied.")).toBeInTheDocument();
  });

  it("calls onRecording(null) on start then with blob on stop", async () => {
    setupMediaDevices();
    const onRecording = vi.fn();
    const user = userEvent.setup();
    render(<VoiceRecorderPanel onRecording={onRecording} />);
    await act(async () => { await user.click(screen.getByRole("button", { name: /start recording/i })); });
    expect(onRecording).toHaveBeenCalledWith(null);
    await act(async () => { await user.click(screen.getByRole("button", { name: /stop recording/i })); });
    expect(onRecording).toHaveBeenCalledTimes(2);
    expect(onRecording.mock.calls[1][0]).toHaveProperty("blob");
  });
});
