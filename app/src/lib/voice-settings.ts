export interface VoiceSettings {
  enabled: boolean;
  autoTranscribe: boolean;
}

const DEFAULTS: VoiceSettings = { enabled: false, autoTranscribe: false };
const KEY = "voice.settings";

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

export function saveVoiceSettings(v: VoiceSettings) {
  localStorage.setItem(KEY, JSON.stringify(v));
}
