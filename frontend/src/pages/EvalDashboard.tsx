import React, { useEffect, useMemo, useState } from "react";
import { evalApi } from "../api/eval";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Icon } from "../components/ui/Icon";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import type { EvalRunItem, EvalRunResponse, RunEvalResponse } from "../types/api";

type TrendPoint = { t: string; precision: number; recall: number; mrr: number };

const TREND_LEGEND = [
  { key: "precision", color: "var(--accent)", label: "Precision@k" },
  { key: "recall", color: "var(--ok)", label: "Recall@k" },
  { key: "mrr", color: "var(--info)", label: "MRR" },
] as const;

type ResultFilterTab = "all" | "passed" | "missed";

export default function EvalDashboard() {
  const { toast } = useToast();
  const [currentRun, setCurrentRun] = useState<RunEvalResponse | null>(null);
  const [history, setHistory] = useState<EvalRunResponse[]>([]);
  const [docMap, setDocMap] = useState<Record<string, string>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tableFilter, setTableFilter] = useState("");
  const [resultTab, setResultTab] = useState<ResultFilterTab>("all");
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [expandedProbeId, setExpandedProbeId] = useState<string | null>(null);

  async function loadHistory() {
    try {
      const runs = await evalApi.runs();
      setHistory(runs);
      return runs;
    } catch {
      return [];
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [h, docs] = await Promise.allSettled([
          evalApi.runs(),
          documentsApi.list(),
        ]);
        if (!cancelled) {
          if (h.status === "fulfilled") {
            setHistory(h.value);
            if (h.value.length > 0 && !selectedRunId) {
              setSelectedRunId(h.value[0].id);
            }
          }
          if (docs.status === "fulfilled") {
            const map: Record<string, string> = {};
            docs.value.forEach((d) => {
              map[d.id] = d.original_filename || d.filename || d.id;
            });
            setDocMap(map);
          }
        }
      } catch (err) {
        if (!cancelled)
          toast("error", "Couldn't load eval data", err instanceof ApiError ? err.message : "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function cleanDocName(raw: string): string {
    if (!raw) return "";
    let name = raw.trim();
    if (name.includes("_")) {
      name = name.replace(/_/g, " ");
    }
    return name;
  }

  function formatProbeExcerpt(text: string): string {
    if (!text) return "";
    let clean = text.trim();
    clean = clean.replace(/^[a-z0-9]{1,4}[,\s]+/, "");
    clean = clean.replace(/^[^A-Za-z0-9"']+\s*/, "");
    if (clean.length > 0 && /^[a-z]/.test(clean)) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    return clean;
  }

  function resolveDocName(docId: string, item?: EvalRunItem): string {
    if (docMap[docId]) return cleanDocName(docMap[docId]);
    if (item?.source_document_name) return cleanDocName(item.source_document_name);
    return docId;
  }

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

  // Elapsed timer while evaluation is running
  React.useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function runEval() {
    if (running) return;
    setRunning(true);
    setElapsed(0);
    try {
      const res = await evalApi.run();
      setCurrentRun(res);
      setSelectedRunId("current");
      const updatedHistory = await loadHistory();
      if (updatedHistory.length > 0) {
        setSelectedRunId(updatedHistory[0].id);
      }
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

  // Determine active displayed run: either the selected historical run, or current live run
  const activeRun = useMemo<{
    id: string;
    timestamp: string;
    k: number;
    aggregate: {
      precision_at_k: number;
      recall_at_k: number;
      mrr: number;
      n_evaluated: number;
      n_total: number;
      n_passed: number;
    };
    results: EvalRunItem[];
    isHistorical: boolean;
  } | null>(() => {
    if (selectedRunId === "current" && currentRun) {
      return {
        id: "current",
        timestamp: currentRun.timestamp,
        k: currentRun.k,
        aggregate: currentRun.aggregate,
        results: currentRun.results,
        isHistorical: false,
      };
    }
    if (selectedRunId) {
      const found = history.find((h) => h.id === selectedRunId);
      if (found) {
        return {
          id: found.id,
          timestamp: found.timestamp,
          k: found.raw_results?.k ?? 5,
          aggregate: found.aggregate_scores,
          results: found.raw_results?.results ?? [],
          isHistorical: true,
        };
      }
    }
    if (currentRun) {
      return {
        id: "current",
        timestamp: currentRun.timestamp,
        k: currentRun.k,
        aggregate: currentRun.aggregate,
        results: currentRun.results,
        isHistorical: false,
      };
    }
    if (history.length > 0) {
      const first = history[0];
      return {
        id: first.id,
        timestamp: first.timestamp,
        k: first.raw_results?.k ?? 5,
        aggregate: first.aggregate_scores,
        results: first.raw_results?.results ?? [],
        isHistorical: true,
      };
    }
    return null;
  }, [selectedRunId, currentRun, history]);

  const agg = activeRun?.aggregate;

  // Filtered per-question results
  const filteredResults = useMemo(() => {
    if (!activeRun) return [];
    let list = activeRun.results;

    if (resultTab === "passed") {
      list = list.filter((r) => r.hit && !r.skipped);
    } else if (resultTab === "missed") {
      list = list.filter((r) => !r.hit || r.skipped);
    }

    if (!tableFilter.trim()) return list;
    const q = tableFilter.toLowerCase().trim();
    return list.filter(
      (r) =>
        r.question.toLowerCase().includes(q) ||
        r.expected_answer.toLowerCase().includes(q)
    );
  }, [activeRun, resultTab, tableFilter]);

  const passCount = useMemo(
    () => activeRun?.results.filter((r) => r.hit && !r.skipped).length ?? 0,
    [activeRun]
  );
  const missCount = useMemo(
    () => activeRun?.results.filter((r) => !r.hit || r.skipped).length ?? 0,
    [activeRun]
  );

  return (
    <div className="eval-page-layout">
      {/* ── Page Header ── */}
      <div className="eval-head">
        <div className="eval-head-text">
          <h1 className="eval-head-title">Retrieval Evaluation & Benchmarks</h1>
          <p className="eval-head-sub">
            Empirical quality and semantic retrieval precision measured across benchmark test sets.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {activeRun && activeRun.isHistorical && history.length > 0 && (
            <button
              type="button"
              className="eval-viewing-pill"
              onClick={() => setSelectedRunId(history[0].id)}
              title="Click to return to most recent run"
            >
              <Icon name="clock" size={12} />
              {formatDateTime(activeRun.timestamp)}
            </button>
          )}
          <button
            type="button"
            className={`eval-run-btn${running ? " running" : ""}`}
            onClick={() => void runEval()}
            disabled={running}
            aria-label={running ? `Evaluating… ${elapsed}s` : "Run Evaluation"}
          >
            {running && <span className="eval-run-shimmer" aria-hidden="true" />}
            <span className="eval-run-icon">
              {running
                ? <span className="eval-run-pulse" />
                : <Icon name="eval" size={15} />}
            </span>
            <span className="eval-run-label">
              {running ? `Evaluating… ${elapsed}s` : "Run Evaluation"}
            </span>
          </button>
        </div>
      </div>

      {/* ── 4-Tile Core Benchmarks Strip ── */}
      <div className="eval-stats-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {/* Precision@k */}
        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">Precision@k</span>
            <span style={{ color: "var(--accent)" }}><Icon name="eval" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? `${(agg.precision_at_k * 100).toFixed(1)}%` : "—"}
          </span>
          <span className="eval-stat-sub">
            {agg ? `Top-${activeRun?.k ?? 5} retrieval relevance` : "Run benchmark to calculate"}
          </span>
        </div>

        {/* Recall@k */}
        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">Recall@k</span>
            <span style={{ color: "var(--ok)" }}><Icon name="checkCircle" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? `${(agg.recall_at_k * 100).toFixed(1)}%` : "—"}
          </span>
          <span className="eval-stat-sub">
            {agg ? `${agg.n_passed} of ${agg.n_evaluated} probes passed` : "Grounded retrieval coverage"}
          </span>
        </div>

        {/* Mean Reciprocal Rank */}
        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">MRR Score</span>
            <span style={{ color: "var(--info)" }}><Icon name="layers" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? agg.mrr.toFixed(3) : "—"}
          </span>
          <span className="eval-stat-sub">
            {agg ? (agg.mrr >= 0.8 ? "Optimal rank accuracy" : agg.mrr >= 0.5 ? "Good retrieval rank" : "Needs calibration") : "First relevant rank position"}
          </span>
        </div>

        {/* Total Probes Evaluated */}
        <div className="eval-stat-item">
          <div className="eval-stat-top">
            <span className="eval-stat-lbl">Dataset Probes</span>
            <span style={{ color: "var(--text-muted)" }}><Icon name="doc" size={16} /></span>
          </div>
          <span className="eval-stat-val">
            {loading ? "…" : agg ? agg.n_evaluated : "0"}
          </span>
          <span className="eval-stat-sub">
            {agg ? `Auto-generated from indexed documents` : "Dynamically synthesized"}
          </span>
        </div>
      </div>

      {/* ── Historical Accuracy Trends Chart (20px Rounded) ── */}
      <div className="analytics-card">
        <div className="analytics-card-head">
          <div>
            <h2 className="analytics-card-title">Historical Accuracy Trends</h2>
            <p className="analytics-card-sub">
              Precision, Recall, and MRR trajectory tracked over successive benchmark iterations.
            </p>
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {TREND_LEGEND.map((l) => (
              <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-faint)" }}>
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
              tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
              ariaLabel="Eval score trends across runs"
              series={TREND_LEGEND.map((l) => ({
                color: l.color,
                label: l.label,
                values: trends.map((p) => p[l.key]),
                area: l.key === "precision",
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
              {activeRun ? `${passCount}/${activeRun.results.length} Passed` : "0 Probes"}
            </span>
          </div>

          {activeRun && (
            <div className="doc-collapsible-right" onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {/* Filter Tabs */}
              <div className="eval-filter-tabs">
                <button
                  type="button"
                  className={`eval-filter-tab${resultTab === "all" ? " active" : ""}`}
                  onClick={() => setResultTab("all")}
                >
                  All ({activeRun.results.length})
                </button>
                <button
                  type="button"
                  className={`eval-filter-tab passed${resultTab === "passed" ? " active" : ""}`}
                  onClick={() => setResultTab("passed")}
                >
                  Passed ({passCount})
                </button>
                <button
                  type="button"
                  className={`eval-filter-tab missed${resultTab === "missed" ? " active" : ""}`}
                  onClick={() => setResultTab("missed")}
                >
                  Missed ({missCount})
                </button>
              </div>

              {/* Search input */}
              <div className="quiz-search-wrap">
                <Icon name="search" size={13} className="quiz-search-icon" />
                <input
                  type="text"
                  className="quiz-search-input"
                  placeholder="Search questions or answers..."
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
            {activeRun ? (
              filteredResults.length === 0 ? (
                <div style={{ padding: 24 }}>
                  <EmptyState icon="search" title="No questions matching the selected filter." />
                </div>
              ) : (
                <div className="eval-table-wrap">
                  <table className="eval-table-custom">
                    <thead>
                      <tr>
                        <th style={{ width: "52%" }}>Probe Question</th>
                        <th style={{ width: "80px", textAlign: "center" }}>P@k</th>
                        <th style={{ width: "80px", textAlign: "center" }}>R@k</th>
                        <th style={{ width: "70px", textAlign: "center" }}>MRR</th>
                        <th style={{ width: "90px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "36px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r: EvalRunItem) => {
                        const isExpanded = expandedProbeId === r.id;
                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              style={{ cursor: "pointer" }}
                              onClick={() => setExpandedProbeId(isExpanded ? null : r.id)}
                            >
                              <td>
                                <p className="eval-probe-q">{r.question}</p>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className="eval-metric-badge">
                                  {(r.precision_at_k * 100).toFixed(0)}%
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className={`eval-metric-badge ${r.recall_at_k >= 1 ? "high" : r.recall_at_k > 0 ? "mid" : "low"}`}>
                                  {(r.recall_at_k * 100).toFixed(0)}%
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className="eval-metric-badge">
                                  {r.mrr.toFixed(2)}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
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
                              <td style={{ textAlign: "center", color: "var(--text-muted)" }}>
                                <Icon name={isExpanded ? "chevronDown" : "chevronRight"} size={12} />
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="eval-probe-detail-row">
                                <td colSpan={6}>
                                  <div className="eval-probe-detail">
                                    <div className="eval-probe-detail-section">
                                      <span className="eval-probe-detail-lbl">Ground Truth Answer</span>
                                      <p className="eval-probe-detail-paragraph">{r.expected_answer}</p>
                                    </div>
                                    <div className="eval-probe-detail-grid">
                                      <div className="eval-probe-detail-section">
                                        <span className="eval-probe-detail-lbl">Expected Documents</span>
                                        <div className="eval-probe-chips-wrap">
                                          {r.expected_documents?.length
                                            ? r.expected_documents.map((d, i) => {
                                                const name = resolveDocName(d, r);
                                                return (
                                                  <span key={i} className="eval-doc-chip" title={`Document ID: ${d}`}>
                                                    <Icon name="fileText" size={11} />
                                                    <span>{name}</span>
                                                  </span>
                                                );
                                              })
                                            : <em style={{ color: "var(--text-faint)" }}>None specified</em>}
                                        </div>
                                      </div>
                                      <div className="eval-probe-detail-section">
                                        <span className="eval-probe-detail-lbl">Retrieved Chunks (Rank Ordered)</span>
                                        <div className="eval-probe-chips-wrap">
                                          {r.retrieved_documents?.length
                                            ? r.retrieved_documents.map((d, i) => {
                                                const name = resolveDocName(d);
                                                return (
                                                  <span
                                                    key={i}
                                                    className={`eval-doc-chip${r.hit ? " hit" : " miss"}`}
                                                    title={`Rank ${i + 1} | Document ID: ${d}`}
                                                  >
                                                    <span className="eval-doc-chip-rank">#{i + 1}</span>
                                                    <Icon name="fileText" size={11} />
                                                    <span>{name}</span>
                                                  </span>
                                                );
                                              })
                                            : <em style={{ color: "var(--text-faint)" }}>No chunks retrieved</em>}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
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

      {/* ── Evaluation Run History Container (Selectable & Interactive) ── */}
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
              <span className="doc-collapsible-badge">{history.length} Runs</span>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Click any run to view its probe results
            </span>
          </div>

          {!historyCollapsed && (
            <div className="doc-collapsible-body" style={{ padding: 0 }}>
              <div className="note-lib-list">
                {history.map((h, idx) => {
                  const isSelected = selectedRunId === h.id || (!selectedRunId && idx === 0);
                  const isLatest = idx === 0;

                  return (
                    <div
                      key={h.id}
                      className="note-lib-row"
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "var(--surface-2)" : undefined,
                        borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                        padding: "14px 18px",
                      }}
                      onClick={() => setSelectedRunId(h.id)}
                    >
                      <div className="note-lib-row-left">
                        <div className="note-lib-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
                          <Icon name="clock" size={15} />
                        </div>
                        <div className="note-lib-row-info">
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="note-lib-row-title" style={{ fontSize: 13.5, fontWeight: 600 }}>
                              {formatDateTime(h.timestamp)}
                            </span>
                            {isLatest && (
                              <span className="eval-status-pill pass" style={{ fontSize: 10, padding: "1px 6px" }}>
                                Latest
                              </span>
                            )}
                            {isSelected && (
                              <span className="topic-diag-badge mid" style={{ fontSize: 10, padding: "1px 6px" }}>
                                Active
                              </span>
                            )}
                          </div>
                          <div className="note-lib-row-meta" style={{ marginTop: 2 }}>
                            <span>P@k: <strong>{(h.aggregate_scores.precision_at_k * 100).toFixed(1)}%</strong></span>
                            <span>·</span>
                            <span>R@k: <strong>{(h.aggregate_scores.recall_at_k * 100).toFixed(1)}%</strong></span>
                            <span>·</span>
                            <span>MRR: <strong>{h.aggregate_scores.mrr.toFixed(3)}</strong></span>
                            <span>·</span>
                            <span>{h.aggregate_scores.n_passed}/{h.aggregate_scores.n_evaluated} passed</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11.5, padding: "4px 10px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRunId(h.id);
                        }}
                      >
                        {isSelected ? "Viewing Probes" : "Inspect Run"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
