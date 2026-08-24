import { useMemo, useRef, useState } from "react";
import type { HeatmapDay } from "../../types/api";

interface Props {
  data: HeatmapDay[];
  streak: number;
  loading?: boolean;
}

/** Returns intensity bucket 0–4 given a minute count and the max in the dataset. */
function bucket(minutes: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || max <= 0) return 0;
  const pct = minutes / max;
  if (pct < 0.15) return 1;
  if (pct < 0.40) return 2;
  if (pct < 0.70) return 3;
  return 4;
}

function formatTooltipDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];  // Sun=0 → 6 rows, Mon/Wed/Fri labeled

export function StudyHeatmap({ data, streak, loading }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build a complete 53-week × 7-day grid ending today
  const { weeks, monthPositions, maxMinutes } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start from the most recent Sunday that is ≥371 days ago
    const dayOfWeek = today.getDay(); // 0=Sun
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (52 * 7 + dayOfWeek + 6));

    // Map iso→minutes
    const byDate = new Map<string, number>();
    let max = 0;
    for (const d of data) {
      byDate.set(d.date, d.count);
      if (d.count > max) max = d.count;
    }

    const weeksArr: Array<Array<{ iso: string; minutes: number; inFuture: boolean }>> = [];
    const monthPos: Array<{ month: number; col: number }> = [];
    let seenMonths = new Set<number>();
    let cursor = new Date(startDate);

    for (let w = 0; w < 53; w++) {
      const week: Array<{ iso: string; minutes: number; inFuture: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const iso = cursor.toISOString().slice(0, 10);
        const inFuture = cursor > today;
        week.push({ iso, minutes: byDate.get(iso) ?? 0, inFuture });
        // Track month label at first occurrence of each month
        const m = cursor.getMonth();
        if (!seenMonths.has(m) && d === 0) {
          monthPos.push({ month: m, col: w });
          seenMonths.add(m);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weeksArr.push(week);
    }

    return { weeks: weeksArr, monthPositions: monthPos, maxMinutes: max };
  }, [data]);

  const CELL = 12;   // px per cell
  const GAP = 3;     // px gap
  const STEP = CELL + GAP;
  const LEFT_OFFSET = 28; // px for day labels

  function handleMouseEnter(e: React.MouseEvent, cell: { iso: string; minutes: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const label = cell.minutes > 0
      ? `${formatTooltipDate(cell.iso)}: ${cell.minutes} min`
      : `${formatTooltipDate(cell.iso)}: no activity`;
    setTooltip({
      text: label,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 36,
    });
  }

  if (loading) {
    return (
      <div className="heatmap-loading">
        <div className="skeleton" style={{ height: 112, borderRadius: 6 }} />
      </div>
    );
  }

  return (
    <div className="heatmap-wrap" ref={containerRef}>
      {/* Streak counter */}
      <div className="heatmap-meta">
        <span className="heatmap-streak">
          <strong>{streak}</strong> day streak
        </span>
      </div>

      {/* Month labels row */}
      <div className="heatmap-months" style={{ paddingLeft: LEFT_OFFSET }}>
        {monthPositions.map(({ month, col }) => (
          <span
            key={`${month}-${col}`}
            className="heatmap-month-label"
            style={{ left: col * STEP }}
          >
            {MONTH_LABELS[month]}
          </span>
        ))}
      </div>

      {/* Grid: day-of-week labels + cells */}
      <div className="heatmap-grid-row" style={{ display: "flex", gap: 0 }}>
        {/* Day labels */}
        <div className="heatmap-day-labels" style={{ width: LEFT_OFFSET }}>
          {DAY_LABELS.map((lbl, i) => (
            <span key={i} className="heatmap-day-label">{lbl}</span>
          ))}
        </div>

        {/* Week columns */}
        <div
          className="heatmap-grid"
          onMouseLeave={() => setTooltip(null)}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-col">
              {week.map((cell) => {
                const b = cell.inFuture ? 0 : bucket(cell.minutes, maxMinutes);
                return (
                  <div
                    key={cell.iso}
                    className={`heatmap-cell hm-${b}${cell.inFuture ? " hm-future" : ""}`}
                    onMouseEnter={(e) => !cell.inFuture && handleMouseEnter(e, cell)}
                    aria-label={`${cell.iso}: ${cell.minutes} minutes`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
          aria-hidden="true"
        >
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {([0, 1, 2, 3, 4] as const).map((b) => (
          <div key={b} className={`heatmap-cell hm-${b}`} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>
    </div>
  );
}
