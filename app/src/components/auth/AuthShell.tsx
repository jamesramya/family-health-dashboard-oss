import type { ReactNode } from "react";

interface Props {
  heroTitle?: string;
  heroBody?: string;
  children: ReactNode;
}

const DEFAULT_TITLE = "A shared record of everyone you care for.";
const DEFAULT_BODY =
  "Labs, vitals, medications and notes for Amma, Appa, the kids, you — all in one place. Self-hosted. Open source. Your data stays with you.";

export function AuthShell({
  heroTitle = DEFAULT_TITLE,
  heroBody = DEFAULT_BODY,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-cream-50 grid lg:grid-cols-2">
      {/* Left — brand panel (desktop only) */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-teal-700 text-cream-50 relative overflow-hidden">
        {/* Wordmark */}
        <div className="relative z-10 flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 28 28" fill="none" aria-hidden>
            <circle cx="14" cy="14" r="13" fill="#fdfbf5" />
            <path d="M14 7v14M7 14h14" stroke="#1b3e36" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="font-display text-2xl leading-none">Family Health</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-md">
          <p className="font-serif text-[46px] leading-[1.05] tracking-tight">{heroTitle}</p>
          <p className="text-cream-200/70 mt-5 leading-relaxed">{heroBody}</p>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-cream-200/50">
          v1.4 · MIT licensed · familyhealth.dev
        </p>

        {/* Radial glow decoration */}
        <div className="absolute -right-32 -bottom-32 w-[500px] h-[500px] rounded-full bg-teal-500 opacity-40 blur-3xl" />
      </aside>

      {/* Right — form area */}
      <main className="flex flex-col items-center justify-center px-5 py-12">
        {/* Mobile wordmark (hidden on desktop) */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10 self-start">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
            <circle cx="14" cy="14" r="13" fill="#2f6b5f" />
            <path d="M14 7v14M7 14h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="font-display text-xl text-teal-600 leading-none">Family Health</span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
