/** An eight-week trend. Missing weeks (no data) break the line rather than
 * drawing a false zero; the latest point is emphasised. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const width = 112;
  const height = 28;
  const pad = 3;
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) {
    return <span className="text-xs text-text-muted">No trend yet</span>;
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1);
  const y = (v: number) => height - pad - ((v - min) * (height - 2 * pad)) / span;

  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));
  const last = values[values.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      {segments.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          className="stroke-text-muted"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {values.map((v, i) =>
        v === null || i === values.length - 1 ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r={1.5} className="fill-text-muted" />
        )
      )}
      {last !== null && (
        <circle cx={x(values.length - 1)} cy={y(last)} r={3} className="fill-brand-yellow" />
      )}
    </svg>
  );
}
