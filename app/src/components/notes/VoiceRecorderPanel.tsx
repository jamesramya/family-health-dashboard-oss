import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import { Btn } from "@/components/ui";

interface Props {
  onRecording: (r: { blob: Blob; durationSec: number } | null) => void;
}

export function VoiceRecorderPanel({ onRecording }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  async function start() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    }
    onRecording(null);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setIsRecording(false);
        onRecording({ blob, durationSec });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
      recorderRef.current = rec;
      setIsRecording(true);
    } catch {
      setError("Microphone permission denied.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current = null;
    setIsRecording(false);
  }

  return (
    <div className="rounded-2xl bg-cream-50 border border-cream-200 p-4 shadow-card space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Voice note</p>

      <div className="flex items-center gap-3">
        {!isRecording && !previewUrl && (
          <Btn variant="primary" size="sm" icon={<Mic size={14} />} onClick={start} aria-label="Start recording">
            Record
          </Btn>
        )}

        {isRecording && (
          <>
            <Btn variant="danger" size="sm" icon={<Square size={14} />} onClick={stop} aria-label="Stop recording">
              Stop
            </Btn>
            <span data-testid="voice-duration" className="tabular text-sm text-rose-500 font-medium">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </span>
          </>
        )}

        {previewUrl && !isRecording && (
          <Btn variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={start} aria-label="Re-record">
            Re-record
          </Btn>
        )}
      </div>

      {previewUrl && (
        <audio controls src={previewUrl} className="w-full h-9" />
      )}

      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
