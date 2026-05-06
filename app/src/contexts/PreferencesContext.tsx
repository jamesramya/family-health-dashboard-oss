import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type TextSize = "normal" | "large" | "xl";
export type Density = "comfortable" | "compact";
export type StatusLanguage = "plain" | "medical";
export type Language = "en" | "ta" | "fr";

export interface UserPreferences {
  textSize: TextSize;
  density: Density;
  statusLanguage: StatusLanguage;
  language?: Language;
}

const DEFAULTS: UserPreferences = {
  textSize: "normal",
  density: "comfortable",
  statusLanguage: "plain",
};

const STORAGE_KEY = "fh-prefs";

const VALID_TEXT_SIZES = new Set<string>(["normal", "large", "xl"]);
const VALID_DENSITIES = new Set<string>(["comfortable", "compact"]);
const VALID_STATUS_LANGS = new Set<string>(["plain", "medical"]);
const VALID_LANGUAGES = new Set<string>(["en", "ta", "fr"]);

function sanitize(raw: unknown): Partial<UserPreferences> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<UserPreferences> = {};
  if (typeof r.textSize === "string" && VALID_TEXT_SIZES.has(r.textSize))
    out.textSize = r.textSize as TextSize;
  if (typeof r.density === "string" && VALID_DENSITIES.has(r.density))
    out.density = r.density as Density;
  if (typeof r.statusLanguage === "string" && VALID_STATUS_LANGS.has(r.statusLanguage))
    out.statusLanguage = r.statusLanguage as StatusLanguage;
  if (typeof r.language === "string" && VALID_LANGUAGES.has(r.language))
    out.language = r.language as Language;
  return out;
}

interface PreferencesContextValue {
  prefs: UserPreferences;
  setPref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    try {
      return { ...DEFAULTS, ...sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")) };
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    document.documentElement.dataset.size = prefs.textSize;
    document.documentElement.dataset.density = prefs.density;
  }, [prefs]);

  const setPref = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => setPrefs((prev) => ({ ...prev, [key]: value })), []);

  const ctxValue = useMemo(() => ({ prefs, setPref }), [prefs, setPref]);

  return (
    <PreferencesContext.Provider value={ctxValue}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
