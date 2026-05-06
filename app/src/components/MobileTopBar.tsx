import { Menu, Search } from "lucide-react";

interface MobileTopBarProps {
  onOpenMenu: () => void;
  onSearch: () => void;
}

export function MobileTopBar({ onOpenMenu, onSearch }: MobileTopBarProps) {
  return (
    <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white/80 backdrop-blur border-b border-cream-200 flex items-center px-2">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="w-11 h-11 rounded-full grid place-items-center text-ink-soft transition-[transform,background-color] duration-160 ease-out-strong [@media(hover:hover)]:hover:bg-cream-200 active:scale-[0.94] active:bg-cream-300"
      >
        <Menu size={22} aria-hidden />
      </button>
      <div className="flex-1 flex items-center justify-center gap-2">
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden>
          <circle cx="14" cy="14" r="13" fill="#2f6b5f" />
          <path d="M14 7v14M7 14h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="font-display text-xl text-teal-600 leading-none">Family Health</span>
      </div>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Search"
        className="w-11 h-11 rounded-full grid place-items-center text-ink-soft transition-[transform,background-color] duration-160 ease-out-strong [@media(hover:hover)]:hover:bg-cream-200 active:scale-[0.94] active:bg-cream-300"
      >
        <Search size={20} aria-hidden />
      </button>
    </header>
  );
}
