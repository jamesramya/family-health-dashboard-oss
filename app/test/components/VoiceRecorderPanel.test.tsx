import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { VoiceRecorderPanel } from "@/components/notes/VoiceRecorderPanel";

const mockStop = vi.fn();
const mockStart = vi.fn();
const mockStream = { getTracks: () => [{ stop: vi.fn() }] };

beforeEach(() => {
  vi.clearAllMocks();
  const mockMediaRecorder = {
    start: mockStart,
    stop: mockStop,
    ondataavailable: null as ((e: BlobEvent) => void) | null,
    onstop: null as (() => void) | null,
    state: "inactive",
  };
  vi.stubGlobal("MediaRecorder", vi.fn().mockImplementation(() => mockMediaRecorder));
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn().mockReturnValue("blob:test-url"),
    revokeObjectURL: vi.fn(),
  });
});

describe("VoiceRecorderPanel", () => {
  it("shows Record button initially", () => {
    const { getByText } = render(<VoiceRecorderPanel onRecording={vi.fn()} />);
    expect(getByText("Record")).toBeInTheDocument();
  });

  it("calls onRecording(null) when re-record clicked after a blob is ready", async () => {
    const onRecording = vi.fn();
    const { getByText } = render(<VoiceRecorderPanel onRecording={onRecording} />);

    fireEvent.click(getByText("Record"));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    const instance = (MediaRecorder as ReturnType<typeof vi.fn>).mock.results[0].value;
    await act(async () => { instance.onstop?.(); });

    await waitFor(() => expect(getByText("Re-record")).toBeInTheDocument());
    onRecording.mockClear();

    fireEvent.click(getByText("Re-record"));
    await waitFor(() => expect(onRecording).toHaveBeenCalledWith(null));
  });

  it("shows timer while recording", async () => {
    const { getByText, getByTestId } = render(<VoiceRecorderPanel onRecording={vi.fn()} />);
    fireEvent.click(getByText("Record"));
    await waitFor(() => expect(getByText("Stop")).toBeInTheDocument());
    expect(getByTestId("voice-duration")).toBeInTheDocument();
  });

  it("shows error when getUserMedia is denied", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    const { getByText, findByText } = render(<VoiceRecorderPanel onRecording={vi.fn()} />);
    fireEvent.click(getByText("Record"));
    await findByText(/Microphone permission denied/);
  });
});
