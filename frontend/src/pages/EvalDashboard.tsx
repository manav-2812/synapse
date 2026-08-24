import { useEffect, useMemo, useState } from "react";
import { evalApi } from "../api/eval";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { Sparkline } from "../components/ui/Sparkline";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import type { EvalRunItem, EvalRunResponse, RunEvalResponse } from "../types/api";

type TrendPoint = { t: string; precision: number; recall: number; mrr: number };

const TREND_LEGEND = [
  { key: "precision", color: "var(--accent)", label: "Precision@k" },
  { key: "recall", color: "var(--ok)", label: "Recall@k" },
  { key: "mrr", color: "var(--info)", label: "MRR" },
] as const;

export default function EvalDashboard() {
  const { toast } = useToast();
  const [run, setRun] = useState<RunEvalResponse | null>(null);
  const [history, setHistory] = useState<EvalRunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tableFilter, setTableFilter] = useState("");
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);

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
    [history]
  );

  async function runEval() {
    if (running) return;
    setRunning(true);
    try {
      const res = await evalApi.run();
      setRun(res);
      await loadHistory();
      toast(
        "success",
        "Evaluation complete",
        `Passed ${res.aggregate.n_passed}/${res.aggregate.n_evaluated} questions`
      );
    } catch (err) {
      toast("error", "Evaluation failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setRunning(false);
    }
  }

  const agg = run?.aggregate;

  // Filtered per-question results
  const filteredResults = useMemo(() => {
    if (!run) return [];
    if (!tableFilter.trim()) return run.results;
    const q = tableFilter.toLowerCase().trim();
    return run.results.filter(
      (r) =>
        r.question.toLowerCase().includes(q) ||
        r.expected_answer.toLowerCase().includes(q)
    );
  }, [run, tableFilter]);

  return (
    <div className="eval-page-layout">
      {/* ── Page Header ── */}
      <div className="eval-head">
        <div className="eval-head-text">
          <h1 className="eval-head-title">Retrieval Evaluation & Accuracy</h1>
          <p className="eval-head-sub">
            Empirical quality and semantic retrieval precision measured across benchmark test sets.
          </p>
        </div>

        <Button onClick={() => void runEval()} disabled={running} className="btn-upload-hero">
          {running ? <Spinner /> : <Icon name="target" size={16} />}
          <span>{running ? "Evaluating…" : "Run Evaluation"}</span>
        </Button>
      </div>

      {/* ── 3-Metric Core Benchmarks Strip ── */}
      <div className="eval-stats-strip">
        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">Precision@k</span>
            <span style={{ color: "var(--accent)" }}><Icon name="target" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? `${(agg.precision_at_k * 100).toFixed(1)}%` : "—"}
          </span>
          <span className="eval-stat-sub">
            {agg ? `Top-${run?.k} retrieval relevance` : "Run benchmark to calculate"}
          </span>
        </div>

        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">Recall@k</span>
            <span style={{ color: "var(--ok)" }}><Icon name="checkCircle" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? `${(agg.recall_at_k * 100).toFixed(1)}%` : "—"}
          </span>
          <span className="eval-stat-sub">
            {agg ? `${agg.n_passed} of ${agg.n_evaluated} questions passed` : "Grounded retrieval coverage"}
          </span>
        </div>

        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">Mean Reciprocal Rank (MRR)</span>
            <span style={{ color: "var(--info)" }}><Icon name="layers" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? agg.mrr.toFixed(3) : "—"}
          </span>
          <span className="eval-stat-sub">
            {agg ? `Passed ${agg.n_passed} benchmark probes` : "First relevant rank position"}
          </span>
        </div>
      </div>

      {/* ── Score Trends Chart ── */}
      <div className="analytics-card">
        <div className="analytics-card-head">
          <div>
            <h2 className="analytics-card-title">Historical Accuracy Trends</h2>
            <p className="analytics-card-sub">
              Precision, Recall, and MRR trajectory tracked over successive benchmark iterations.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {TREND_LEGEND.map((l) => (
              <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-faint)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {trends.length >= 2 ? (
          <div>
            <Sparkline
              width={720}
              height={180}
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
          </div>
        ) : (
          <div style={{ padding: "20px 0" }}>
            <EmptyState icon="chart" title="Execute at least two evaluations to visualize trend analytics." />
          </div>
        )}
      </div>

      {/* ── Per-Question Results Table Container ── */}
      <div className={`doc-collapsible-box${resultsCollapsed ? " is-collapsed" : ""}`}>
        <div className="doc-collapsible-header" onClick={() => setResultsCollapsed((prev) => !prev)}>
          <div className="doc-collapsible-left">
            <button
              type="button"
              className="doc-collapse-toggle-btn"
              aria-label={resultsCollapsed ? "Expand questions" : "Collapse questions"}
            >
              <Icon name={resultsCollapsed ? "chevronRight" : "chevronDown"} size={14} />
            </button>
            <span className="doc-collapsible-title">Benchmark Probe Results</span>
            <span className="doc-collapsible-badge">
              {run ? `${agg?.n_passed ?? 0}/${agg?.n_evaluated ?? 0} Passed` : "0 Probes"}
            </span>
          </div>

          {run && (
            <div className="doc-collapsible-right" onClick={(e) => e.stopPropagation()}>
              <div className="quiz-search-wrap">
                <Icon name="search" size={13} className="quiz-search-icon" />
                <input
                  type="text"
                  className="quiz-search-input"
                  placeholder="Filter questions..."
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                />
                {tableFilter && (
                  <button
                    type="button"
                    className="quiz-search-clear"
                    onClick={() => setTableFilter("")}
                    title="Clear filter"
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {!resultsCollapsed && (
          <div className="doc-collapsible-body" style={{ padding: 0 }}>
            {run ? (
              filteredResults.length === 0 ? (
                <div style={{ padding: 24 }}>
                  <EmptyState icon="search" title="No questions matching the search filter." />
                </div>
              ) : (
                <div className="eval-table-wrap">
                  <table className="eval-table-custom">
                    <thead>
                      <tr>
                        <th style={{ width: "35%" }}>Probe Question</th>
                        <th style={{ width: "35%" }}>Expected Ground Truth</th>
                        <th>P@k</th>
                        <th>R@k</th>
                        <th>MRR</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r: EvalRunItem) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500, color: "var(--text-h)" }}>{r.question}</td>
                          <td style={{ color: "var(--text-faint)" }}>{r.expected_answer}</td>
                          <td style={{ fontWeight: 600 }}>{(r.precision_at_k * 100).toFixed(0)}%</td>
                          <td style={{ fontWeight: 600 }}>{(r.recall_at_k * 100).toFixed(0)}%</td>
                          <td style={{ fontWeight: 600 }}>{r.mrr.toFixed(2)}</td>
                          <td>
                            {r.skipped ? (
                              <span className="eval-status-pill skip">No Source</span>
                            ) : r.hit ? (
                              <span className="eval-status-pill pass">
                                <Icon name="checkCircle" size={10} /> Pass
                              </span>
                            ) : (
                              <span className="eval-status-pill miss">
                                <Icon name="close" size={10} /> Miss
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div style={{ padding: 32 }}>
                <EmptyState icon="target" title="Run an evaluation above to inspect per-question precision breakdown." />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Past Runs History Container ── */}
      {history.length > 0 && (
        <div className={`doc-collapsible-box${historyCollapsed ? " is-collapsed" : ""}`}>
          <div className="doc-collapsible-header" onClick={() => setHistoryCollapsed((prev) => !prev)}>
            <div className="doc-collapsible-left">
              <button
                type="button"
                className="doc-collapse-toggle-btn"
                aria-label={historyCollapsed ? "Expand history" : "Collapse history"}
              >
                <Icon name={historyCollapsed ? "chevronRight" : "chevronDown"} size={14} />
              </button>
              <span className="doc-collapsible-title">Evaluation Run History</span>
              <span className="doc-collapsible-badge">{history.length}</span>
            </div>
          </div>

          {!historyCollapsed && (
            <div className="doc-collapsible-body" style={{ padding: 0 }}>
              <div className="note-lib-list">
                {history.slice(0, 10).map((h) => (
                  <div key={h.id} className="note-lib-row" style={{ cursor: "default" }}>
                    <div className="note-lib-row-left">
                      <div className="note-lib-icon">
                        <Icon name="clock" size={14} />
                      </div>
                      <div className="note-lib-row-info">
                        <span className="note-lib-row-title">{formatDateTime(h.timestamp)}</span>
                        <div className="note-lib-row-meta">
                          <span>Precision: <strong>{(h.aggregate_scores.precision_at_k * 100).toFixed(1)}%</strong></span>
                          <span>·</span>
                          <span>Recall: <strong>{(h.aggregate_scores.recall_at_k * 100).toFixed(1)}%</strong></span>
                          <span>·</span>
                          <span>MRR: <strong>{h.aggregate_scores.mrr.toFixed(3)}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
