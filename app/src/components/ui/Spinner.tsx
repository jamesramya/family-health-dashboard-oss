type SpinnerProps = {
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-4",
};

export function Spinner({ size = "lg" }: SpinnerProps) {
  return (
    <div
      className={`${sizeClasses[size]} border-cream-200 border-t-teal-500 rounded-full motion-safe:animate-spin`}
      role="status"
      aria-label="Loading"
    />
  );
}
