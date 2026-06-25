export function Skeleton({
  width = "100%",
  height = "12px",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div className="stack gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad stack gap-3">
          <Skeleton width="40%" height="14px" />
          <Skeleton width="100%" />
          <Skeleton width="85%" />
        </div>
      ))}
    </div>
  );
}
