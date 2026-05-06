type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={`motion-safe:animate-pulse bg-cream-200 rounded-2xl ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
