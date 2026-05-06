import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface BtnProps {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary:   "bg-teal-500 text-cream-50 [@media(hover:hover)]:hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary: "bg-white border border-cream-300 text-ink-soft [@media(hover:hover)]:hover:bg-cream-100 disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:     "text-ink-soft [@media(hover:hover)]:hover:bg-cream-200 disabled:opacity-50 disabled:cursor-not-allowed",
  danger:    "bg-rose-500 text-white [@media(hover:hover)]:hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm min-h-[36px]",
  md: "px-4 py-2.5 text-sm min-h-[44px]",
  lg: "px-5 py-3 text-base min-h-[48px]",
};

export function Btn({
  children,
  variant = "primary",
  size = "md",
  icon,
  onClick,
  type = "button",
  disabled,
  className = "",
  "aria-label": ariaLabel,
}: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-full transition-[transform,background-color,color] duration-160 ease-out-strong active:scale-[0.97] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
