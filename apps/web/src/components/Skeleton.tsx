/** Shimmer placeholder blocks shown while data loads. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

/** A card-shaped skeleton with a title line and a large stat line. */
export function SkeletonCard() {
  return (
    <div className="card">
      <Skeleton width={90} height={13} />
      <Skeleton width="60%" height={26} style={{ marginTop: 12 }} />
    </div>
  );
}

/** A few skeleton list rows. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="row" key={i}>
          <div className="meta" style={{ gap: 6 }}>
            <Skeleton width={140} height={15} />
            <Skeleton width={90} height={12} />
          </div>
          <Skeleton width={80} height={18} />
        </div>
      ))}
    </div>
  );
}
