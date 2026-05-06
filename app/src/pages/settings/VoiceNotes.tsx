import { useState } from "react";
import { Btn, Card, Toggle, SettingsRow } from "@/components/ui";
import { loadVoiceSettings, saveVoiceSettings, type VoiceSettings } from "@/lib/voice-settings";

export function VoiceNotes() {
  const [s, setS] = useState<VoiceSettings>(loadVoiceSettings);
  const [saved, setSaved] = useState(false);

  function save() { saveVoiceSettings(s); setSaved(true); setTimeout(() => setSaved(false), 1800); }

  return (
    <Card className="space-y-1">
      <div className="pb-4">
        <h2 className="text-2xl font-semibold text-ink">Voice notes</h2>
        <p className="text-sm text-ink-muted">Record and transcribe audio on clinical notes. Transcription uses Deepgram — configure the key in the worker secrets.</p>
      </div>

      <div className="divide-y divide-cream-200">
        <SettingsRow
          title="Enable voice recording"
          desc="Show a record button on Notes."
          action={
            <Toggle
              on={s.enabled}
              onChange={(v) => setS({ ...s, enabled: v })}
              label="Enable voice recording"
            />
          }
        />
        <SettingsRow
          title="Auto-transcribe on save"
          desc="Requires Deepgram key configured in worker secrets."
          action={
            <Toggle
              on={s.autoTranscribe}
              onChange={(v) => setS({ ...s, autoTranscribe: v })}
              label="Auto-transcribe on save"
            />
          }
        />
      </div>

      <div className="flex items-center gap-3 pt-4">
        <Btn onClick={save}>Save</Btn>
        {saved && <span className="text-sm text-sage-600">Saved.</span>}
      </div>
    </Card>
  );
}
