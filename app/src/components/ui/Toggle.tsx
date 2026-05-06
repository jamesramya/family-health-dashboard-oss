interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function Toggle({ on, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex flex-shrink-0 w-11 h-6 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 ${on ? "bg-teal-600" : "bg-cream-300"}`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-sm transition-[transform] duration-200 ease-out-strong ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
