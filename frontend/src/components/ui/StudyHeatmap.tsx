import { useMemo, useRef, useState, useEffect } from "react";
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

function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTooltipDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "No activity recorded";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m study time`;
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? "s" : ""} study time`;
  return `${mins} min${mins > 1 ? "s" : ""} study time`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function StudyHeatmap({ data, streak, loading }: Props) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    duration: string;
    minutes: number;
    x: number;
    y: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute 53-week × 7-day grid ending with the current week (today)
  const { weeks, monthPositions, maxMinutes, activeDaysCount, totalMinutesLogged, maxSingleDay } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const startDate = new Date(today);
    // Start exactly 52 weeks before the start of the current week
    startDate.setDate(today.getDate() - (52 * 7 + dayOfWeek));

    const byDate = new Map<string, number>();
    let max = 0;
    let activeDays = 0;
    let totalMins = 0;

    for (const d of data) {
      byDate.set(d.date, d.count);
      if (d.count > 0) {
        activeDays++;
        totalMins += d.count;
      }
      if (d.count > max) max = d.count;
    }

    const weeksArr: Array<Array<{ iso: string; minutes: number; inFuture: boolean }>> = [];
    const monthPos: Array<{ month: number; col: number }> = [];
    let lastMonth = -1;
    const cursor = new Date(startDate);

    for (let w = 0; w < 53; w++) {
      const week: Array<{ iso: string; minutes: number; inFuture: boolean }> = [];
      let monthInWeek = -1;

      for (let d = 0; d < 7; d++) {
        const iso = toLocalDateStr(cursor);
        const inFuture = cursor.getTime() > today.getTime();
        const mins = byDate.get(iso) ?? 0;
        week.push({ iso, minutes: mins, inFuture });

        const m = cursor.getMonth();
        const dateNum = cursor.getDate();
        // Check if the 1st of the month is in this week or first full week of month
        if (dateNum === 1 || (d === 0 && lastMonth !== -1 && m !== lastMonth)) {
          monthInWeek = m;
        }

        cursor.setDate(cursor.getDate() + 1);
      }

      // Record month label at the week it begins, spaced at least 2 columns apart
      if (monthInWeek !== -1 && monthInWeek !== lastMonth) {
        const prevCol = monthPos.length > 0 ? monthPos[monthPos.length - 1].col : -4;
        if (w - prevCol >= 2 && w <= 51) {
          monthPos.push({ month: monthInWeek, col: w });
          lastMonth = monthInWeek;
        }
      }

      weeksArr.push(week);
    }

    return {
      weeks: weeksArr,
      monthPositions: monthPos,
      maxMinutes: max,
      activeDaysCount: activeDays,
      totalMinutesLogged: totalMins,
      maxSingleDay: max,
    };
  }, [data]);

  // Auto-scroll to current date on mount and update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [weeks]);

  const CELL = 13;
  const GAP = 4;
  const STEP = CELL + GAP;
  const LEFT_OFFSET = 32;

  function handleMouseEnter(e: React.MouseEvent, cell: { iso: string; minutes: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setTooltip({
      date: formatTooltipDate(cell.iso),
      duration: formatMinutes(cell.minutes),
      minutes: cell.minutes,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 12,
    });
  }

  if (loading) {
    return (
      <div className="heatmap-loading" style={{ padding: "16px 0" }}>
        <div className="skeleton" style={{ height: 140, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div className="heatmap-wrap" ref={containerRef}>
      {/* Scrollable Grid Container */}
      <div className="heatmap-scroll-container" ref={scrollRef}>
        <div className="heatmap-inner-grid">
          {/* Month labels row */}
          <div className="heatmap-months" style={{ paddingLeft: LEFT_OFFSET }}>
            {monthPositions.map(({ month, col }) => (
              <span
                key={`${month}-${col}`}
                className="heatmap-month-label"
                style={{ left: LEFT_OFFSET + col * STEP }}
              >
                {MONTH_LABELS[month]}
              </span>
            ))}
          </div>

          {/* Grid: day labels + week columns */}
          <div className="heatmap-grid-row">
            {/* Day labels column */}
            <div className="heatmap-day-labels" style={{ width: LEFT_OFFSET }}>
              {DAY_LABELS.map((lbl, i) => (
                <span key={i} className="heatmap-day-label">
                  {lbl}
                </span>
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
        </div>
      </div>

      {/* Floating Rich Tooltip */}
      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{
            left: Math.max(80, Math.min(tooltip.x, (containerRef.current?.clientWidth || 600) - 80)),
            top: tooltip.y,
          }}
          aria-hidden="true"
        >
          <span className="heatmap-tooltip-date">{tooltip.date}</span>
          <span className="heatmap-tooltip-val">
            {tooltip.duration}
          </span>
        </div>
      )}

      {/* Footer bar with summary badges and intensity legend */}
      <div className="heatmap-footer">
        <div className="heatmap-stats-pills">
          <span className="heatmap-stat-chip" title="Total active learning days in the past 52 weeks">
            <span><strong>{activeDaysCount}</strong> Active Days</span>
          </span>
          <span className="heatmap-stat-chip" title="Total study duration logged">
            <span><strong>{Math.round(totalMinutesLogged / 60)}h {totalMinutesLogged % 60}m</strong> Logged</span>
          </span>
          {maxSingleDay > 0 && (
            <span className="heatmap-stat-chip" title="Peak study day duration">
              <span><strong>{maxSingleDay}m</strong> Peak Day</span>
            </span>
          )}
        </div>

        <div className="heatmap-legend">
          <span className="heatmap-legend-label">Less</span>
          {([0, 1, 2, 3, 4] as const).map((b) => (
            <div key={b} className={`heatmap-cell hm-${b}`} />
          ))}
          <span className="heatmap-legend-label">More</span>
        </div>
      </div>
    </div>
  );
}
