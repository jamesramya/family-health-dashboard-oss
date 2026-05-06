interface AvatarProps {
  initials: string;
  tone: string;
  size?: number;
  ring?: boolean;
}

export function Avatar({ initials, tone, size = 44, ring = false }: AvatarProps) {
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        background: tone,
        fontSize: size * 0.38,
        boxShadow: ring ? `0 0 0 3px #fdfbf5, 0 0 0 5px ${tone}` : "none",
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
