// Dependency-free SVG line/area chart. Reused by the usage-cost sparkline and
// the retrieval-eval trend chart so the whole app shares one charting primitive.

export interface ChartSeries {
  values: number[];
  color: string; // any CSS color, e.g. "var(--accent)"
  label?: string;
  area?: boolean;
}

export interface SparklineProps {
  series: ChartSeries[];
  width?: number;
  height?: number;
  /** Fixed y-axis bounds. Defaults to [min(0, data), max(data)] auto-fit. */
  yMin?: number;
  yMax?: number;
  showGrid?: boolean;
  yTicks?: number[];
  tickFormatter?: (val: number) => string;
  ariaLabel?: string;
  className?: string;
}

function defaultFormatTick(val: number): string {
  if (val === 0) return "0";
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}k`;
  if (Number.isInteger(val)) return `${val}`;
  return val.toFixed(1);
}

export function Sparkline({
  series,
  width = 640,
  height = 200,
  yMin,
  yMax,
  showGrid = true,
  yTicks,
  tickFormatter = defaultFormatTick,
  ariaLabel = "Trend chart",
  className = "trend-chart",
}: SparklineProps) {
  const padX = 40;
  const padY = 22;

  const all = series.flatMap((s) => s.values);
  const lo = yMin ?? Math.min(0, ...(all.length ? all : [0]));
  const hi = yMax ?? (all.length ? Math.max(...all, lo + 1e-6) : 1);
  const span = hi - lo || 1;

  const maxLen = Math.max(1, ...series.map((s) => s.values.length));
  const x = (i: number) => padX + (i * (width - padX * 2)) / Math.max(1, maxLen - 1);
  const y = (v: number) => height - padY - ((v - lo) / span) * (height - padY * 2);

  const pathFor = (vals: number[]) =>
    vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  const areaFor = (vals: number[]) => {
    if (vals.length === 0) return "";
    const top = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    return `${top} ${x(vals.length - 1)},${y(lo)} ${x(0)},${y(lo)}`;
  };

  const ticks = yTicks ?? [lo, lo + span / 2, hi];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {series.map((s, i) => (
          <linearGradient
            key={`grad-${i}`}
            id={`spark-grad-${i}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
            <stop offset="85%" stopColor={s.color} stopOpacity="0.04" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
          </linearGradient>
        ))}
      </defs>

      <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="axis" />
      <line x1={padX} y1={padY} x2={padX} y2={height - padY} className="axis" />
      {showGrid &&
        ticks.map((g, i) => (
          <g key={i}>
            <line x1={padX} y1={y(g)} x2={width - padX} y2={y(g)} className="chart-grid" />
            <text x={4} y={y(g) + 3} className="axis-label" style={{ fontVariantNumeric: "tabular-nums" }}>
              {tickFormatter(g)}
            </text>
          </g>
        ))}
      {series.map((s, i) => (
        <g key={i}>
          {s.area && s.values.length > 0 && (
            <polygon
              points={areaFor(s.values)}
              fill={`url(#spark-grad-${i})`}
              className="chart-area"
            />
          )}
          {s.values.length > 0 && (
            <polyline
              points={pathFor(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
