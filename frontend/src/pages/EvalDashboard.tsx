import { useEffect, useMemo, useState } from "react";
import { evalApi } from "../api/eval";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { Spinner } from "../components/ui/Spinner";
import { Sparkline } from "../components/ui/Sparkline";
import { StatValue } from "../components/ui/StatValue";
import { formatDateTime } from "../lib/format";
import type { EvalRunItem, EvalRunResponse, RunEvalResponse } from "../types/api";

type TrendPoint = { t: string; precision: number; recall: number; mrr: number };

const TREND_LEGEND = [
  { key: "precision", color: "var(--accent)", label: "Precision@k" },
  { key: "recall", color: "var(--ok)", label: "Recall@k" },
  { key: "mrr", color: "var(--info)", label: "MRR" },
] as const;

function StatCard({
  label,
  value,
  sub,
  count,
  format,
}: {
  label: string;
  value: string;
  sub?: string;
  /** When provided, the value counts up to this number on scroll-into-view. */
  count?: number;
  format?: (n: number) => string;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      {count != null ? (
        <StatValue value={count} format={format} />
      ) : (
        <div className="stat-value">{value}</div>
      )}
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

export default function EvalDashboard() {
  const { toast } = useToast();
  const [run, setRun] = useState<RunEvalResponse | null>(null);
  const [history, setHistory] = useState<EvalRunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function loadHistory() {
    try {
      setHistory(await evalApi.runs());
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [h] = await Promise.all([evalApi.runs()]);
        if (!cancelled) setHistory(h);
      } catch (err) {
        if (!cancelled)
          toast("error", "Couldn't load eval history", err instanceof ApiError ? err.message : "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const trends = useMemo<TrendPoint[]>(
    () =>
      [...history]
        .reverse()
        .map((r) => ({
          t: r.timestamp,
          precision: r.aggregate_scores.precision_at_k,
          recall: r.aggregate_scores.recall_at_k,
          mrr: r.aggregate_scores.mrr,
        })),
    [history],
  );

  async function runEval() {
    if (running) return;
    setRunning(true);
    try {
      const res = await evalApi.run();
      setRun(res);
      await loadHistory();
      toast("success", "Evaluation complete", `Passed ${res.aggregate.n_passed}/${res.aggregate.n_evaluated}`);
    } catch (err) {
      toast("error", "Evaluation failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setRunning(false);
    }
  }

  const agg = run?.aggregate;

  return (
    <div className="stack">
      <div className="page-head spread">
        <div>
          <h1>Retrieval Evaluation</h1>
          <p className="page-sub muted">
            Measured retrieval quality over a hand-written question set — not assumed.
          </p>
        </div>
        <button className="btn btn-primary" onClick={runEval} disabled={running}>
          {running ? <Spinner /> : <Icon name="chart" size={16} />}
          {running ? "Running…" : "Run Evaluation"}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="stat-tile">
              <Skeleton height="14px" />
              <Skeleton height="34px" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-3">
          <StatCard
            label="Precision@k"
            value={agg ? `${(agg.precision_at_k * 100).toFixed(1)}%` : "—"}
            sub={agg ? `of top-${run?.k} results` : "Run an evaluation"}
            count={agg ? agg.precision_at_k * 100 : undefined}
            format={(n) => `${n.toFixed(1)}%`}
          />
          <StatCard
            label="Recall@k"
            value={agg ? `${(agg.recall_at_k * 100).toFixed(1)}%` : "—"}
            sub={agg ? `${agg.n_evaluated} questions` : ""}
            count={agg ? agg.recall_at_k * 100 : undefined}
            format={(n) => `${n.toFixed(1)}%`}
          />
          <StatCard
            label="MRR"
            value={agg ? agg.mrr.toFixed(3) : "—"}
            sub={agg ? `passed ${agg.n_passed}` : ""}
            count={agg ? agg.mrr * 1000 : undefined}
            format={(n) => (n / 1000).toFixed(3)}
          />
        </div>
      )}

      <section className="card">
        <h2 className="section-title">Score trends</h2>
        {loading ? (
          <Skeleton height="200px" />
        ) : trends.length >= 2 ? (
          <div>
            <Sparkline
              width={640}
              height={200}
              yMin={0}
              yMax={1}
              yTicks={[0, 0.25, 0.5, 0.75, 1]}
              ariaLabel="Eval score trends across runs"
              series={TREND_LEGEND.map((l) => ({
                color: l.color,
                label: l.label,
                values: trends.map((p) => p[l.key]),
              }))}
            />
            <div className="legend">
              {TREND_LEGEND.map((l) => (
                <span key={l.key} className="legend-item">
                  <span className="swatch" style={{ background: l.color }} /> {l.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Icon name="chart" size={22} />
            </span>
            <span>Run at least two evaluations to see trends.</span>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Per-question results</h2>
        {run ? (
          run.results.length === 0 ? (
            <div className="empty">
              <span>No eval questions found.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="eval-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Expected answer</th>
                    <th className="num">P@k</th>
                    <th className="num">R@k</th>
                    <th className="num">MRR</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {run.results.map((r: EvalRunItem) => (
                    <tr key={r.id} className={r.skipped ? "skipped" : r.hit ? "pass" : "fail"}>
                      <td>{r.question}</td>
                      <td className="muted">{r.expected_answer}</td>
                      <td className="num">{(r.precision_at_k * 100).toFixed(0)}%</td>
                      <td className="num">{(r.recall_at_k * 100).toFixed(0)}%</td>
                      <td className="num">{r.mrr.toFixed(2)}</td>
                      <td>
                        {r.skipped ? (
                          <span className="badge">No source doc</span>
                        ) : r.hit ? (
                          <span className="badge status-completed">Pass</span>
                        ) : (
                          <span className="badge status-failed">Miss</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Icon name="chart" size={22} />
            </span>
            <span>Run an evaluation to see per-question results.</span>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2 className="section-title">Past runs</h2>
          <div className="list">
            {history.slice(0, 10).map((h) => (
              <div key={h.id} className="list-item">
                <div className="li-main">
                  <div className="li-title">{formatDateTime(h.timestamp)}</div>
                  <div className="li-sub muted">
                    P {(h.aggregate_scores.precision_at_k * 100).toFixed(0)}% · R{" "}
                    {(h.aggregate_scores.recall_at_k * 100).toFixed(0)}% · MRR{" "}
                    {h.aggregate_scores.mrr.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
