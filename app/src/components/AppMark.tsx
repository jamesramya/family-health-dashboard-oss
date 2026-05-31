export interface AppPreset {
  name: string;
  publisher: string;
  verified: boolean;
  brand: string;
  glyphKind: "claude" | "chatgpt" | "cursor" | "zed" | "cline" | "mcp" | "generic" | "initial";
}

export const APP_PRESETS: Record<string, AppPreset> = {
  "claude-desktop": {
    name: "Claude Desktop", publisher: "Anthropic, PBC", verified: true,
    brand: "#d97757", glyphKind: "claude",
  },
  "claude-web": {
    name: "Claude", publisher: "Anthropic, PBC", verified: true,
    brand: "#d97757", glyphKind: "claude",
  },
  "chatgpt": {
    name: "ChatGPT", publisher: "OpenAI", verified: true,
    brand: "#000000", glyphKind: "chatgpt",
  },
  "cursor": {
    name: "Cursor", publisher: "Anysphere Inc.", verified: true,
    brand: "#0f0f0f", glyphKind: "cursor",
  },
  "zed": {
    name: "Zed", publisher: "Zed Industries", verified: true,
    brand: "#084CCF", glyphKind: "zed",
  },
  "cline": {
    name: "Cline", publisher: "cline.bot", verified: true,
    brand: "#0a0a0a", glyphKind: "cline",
  },
  "mcp-inspector": {
    name: "MCP Inspector", publisher: "modelcontextprotocol.io", verified: true,
    brand: "#1f2937", glyphKind: "mcp",
  },
};

export const CLIENT_PRESET_MAP: Record<string, string> = {
  "Claude Desktop": "claude-desktop",
  "Claude": "claude-web",
  "ChatGPT": "chatgpt",
  "Cursor": "cursor",
  "Zed": "zed",
  "Cline": "cline",
  "MCP Inspector": "mcp-inspector",
};

const FALLBACK_PRESET: AppPreset = {
  name: "Unknown App", publisher: "—", verified: false,
  brand: "#92847a", glyphKind: "initial",
};

export function getPresetByName(clientName: string): AppPreset {
  const key = CLIENT_PRESET_MAP[clientName];
  if (key !== undefined) {
    const preset = APP_PRESETS[key];
    if (preset !== undefined) return preset;
  }
  return FALLBACK_PRESET;
}

export function renderGlyph(preset: AppPreset, size: number): React.ReactNode {
  const px = Math.round(size * 0.5);
  switch (preset.glyphKind) {
    case "claude":
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
        </svg>
      );
    case "chatgpt":
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="9.5" y="3.5" width="5" height="17" rx="2.5" />
          <rect x="9.5" y="3.5" width="5" height="17" rx="2.5" transform="rotate(60 12 12)" />
          <rect x="9.5" y="3.5" width="5" height="17" rx="2.5" transform="rotate(120 12 12)" />
        </svg>
      );
    case "cursor":
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
        </svg>
      );
    case "zed":
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M2.25 1.5a.75.75 0 0 0-.75.75v16.5H0V2.25A2.25 2.25 0 0 1 2.25 0h20.095c1.002 0 1.504 1.212.795 1.92L10.764 14.298h3.486V12.75h1.5v1.922a1.125 1.125 0 0 1-1.125 1.125H9.264l-2.578 2.578h11.689V9h1.5v9.375a1.5 1.5 0 0 1-1.5 1.5H5.185L2.562 22.5H21.75a.75.75 0 0 0 .75-.75V5.25H24v16.5A2.25 2.25 0 0 1 21.75 24H1.655C.653 24 .151 22.788.86 22.08L13.19 9.75H9.75v1.5h-1.5V9.375A1.125 1.125 0 0 1 9.375 8.25h5.314l2.625-2.625H5.625V15h-1.5V5.625a1.5 1.5 0 0 1 1.5-1.5h13.19L21.438 1.5z" />
        </svg>
      );
    case "cline":
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="m23.365 13.556-1.442-2.895V8.994c0-2.764-2.218-5.002-4.954-5.002h-2.464c.178-.367.276-.779.276-1.213A2.77 2.77 0 0 0 12.018 0a2.77 2.77 0 0 0-2.763 2.779c0 .434.098.846.276 1.213H7.067c-2.736 0-4.954 2.238-4.954 5.002v1.667L.64 13.549c-.149.29-.149.636 0 .927l1.472 2.855v1.667C2.113 21.762 4.33 24 7.067 24h9.902c2.736 0 4.954-2.238 4.954-5.002V17.33l1.44-2.865c.143-.286.143-.622.002-.91m-12.854 2.36a2.27 2.27 0 0 1-2.261 2.273 2.27 2.27 0 0 1-2.261-2.273v-4.042A2.27 2.27 0 0 1 8.249 9.6a2.267 2.267 0 0 1 2.262 2.274zm7.285 0a2.27 2.27 0 0 1-2.26 2.273 2.27 2.27 0 0 1-2.262-2.273v-4.042A2.267 2.267 0 0 1 15.535 9.6a2.267 2.267 0 0 1 2.261 2.274z" />
        </svg>
      );
    case "mcp":
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M14.5 14.5L20 20" />
        </svg>
      );
    default: {
      const initial = (preset.name || "?").trim().charAt(0).toUpperCase();
      return (
        <span
          className="font-semibold"
          style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }}
        >
          {initial}
        </span>
      );
    }
  }
}

interface AppMarkProps {
  preset: AppPreset;
  size?: number;
  loading?: boolean;
}

export function AppMark({ preset, size = 56, loading = false }: AppMarkProps) {
  const radius = Math.round(size * 0.28);
  if (loading) {
    return (
      <div
        className="rounded-2xl bg-cream-200 animate-pulse flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: preset.brand, borderRadius: radius, color: "white" }}
    >
      {renderGlyph(preset, size)}
    </div>
  );
}

interface AppMarkInlineProps {
  preset: AppPreset;
  size?: number;
}

export function AppMarkInline({ preset, size = 40 }: AppMarkInlineProps) {
  const radius = Math.round(size * 0.26);
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: preset.brand, borderRadius: radius, color: "white" }}
    >
      {renderGlyph(preset, size)}
    </div>
  );
}
