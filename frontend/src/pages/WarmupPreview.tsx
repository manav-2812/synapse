import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Icon } from "../components/ui/Icon";
import { useTheme } from "../hooks/useTheme";
import "../styles/app.css";
import "../styles/auth.css";

export default function WarmupPreview() {
  const { themeMode, setThemeMode } = useTheme();
  const [elapsed, setElapsed] = useState(14);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isSuccess) return;
    const interval = setInterval(() => {
      setElapsed((prev) => (prev >= 45 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isSuccess]);

  return (
    <div className="syn-splash-loader" style={{ minHeight: "100vh", position: "relative", flexDirection: "column" }}>
      {/* Floating Warmup Banner Preview */}
      <div
        className={`syn-server-warmup-banner ${isSuccess ? "syn-warmup-success" : "syn-warmup-active"}`}
        style={{ top: "24px" }}
      >
        <div className="syn-warmup-content">
          <div className="syn-warmup-badge">
            {isSuccess ? (
              <Icon name="check" size={14} className="syn-warmup-icon-check" />
            ) : (
              <span className="syn-warmup-pulse-dot" />
            )}
          </div>
          <div className="syn-warmup-text-wrap">
            <div className="syn-warmup-title">
              {isSuccess ? "Server is ready!" : "Waking up server instance..."}
              {!isSuccess && <span className="syn-warmup-timer">{elapsed}s</span>}
            </div>
            <div className="syn-warmup-sub">
              {isSuccess
                ? "Connection established. Loading your data..."
                : "Render spins down on inactivity. First request takes ~30–50s."}
            </div>
          </div>
        </div>
        {!isSuccess && <div className="syn-warmup-progress-bar" />}
      </div>

      {/* Main Full-Screen Waiting Splash Screen */}
      <div className="syn-splash-inner" style={{ marginTop: "40px" }}>
        <div className="syn-splash-logo">
          <BrandLogo size={42} />
        </div>
        <div className="syn-splash-title">Synapse Workspace</div>
        <div className="syn-splash-msg">
          <span className="syn-splash-spinner" />
          <span>Waking up server instance... ({elapsed}s)</span>
        </div>
        <p className="syn-splash-hint" style={{ marginBottom: "28px" }}>
          Free-tier Render instances spin down after 15m of inactivity. First request takes up to ~45s.
        </p>

        {/* Interactive Controls for Testing */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            alignItems: "center",
            padding: "18px 24px",
            borderRadius: "14px",
            background: "var(--bg-surface, rgba(255,255,255,0.06))",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
            maxWidth: "340px",
            width: "100%",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary, #a1a1aa)" }}>
            Interactive Demo Controls
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setIsSuccess((prev) => !prev)}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: "12px" }}
            >
              Toggle State: {isSuccess ? "Ready (Success)" : "Waking up"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSuccess(false);
                setElapsed(1);
              }}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: "12px" }}
            >
              Reset Timer
            </button>
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-faint, #71717a)" }}>Theme:</span>
            <button
              type="button"
              className={`btn btn-xs ${themeMode === "light" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setThemeMode("light")}
            >
              Light
            </button>
            <button
              type="button"
              className={`btn btn-xs ${themeMode === "dark" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setThemeMode("dark")}
            >
              Dark
            </button>
          </div>

          <Link
            to="/login"
            style={{ fontSize: "12px", color: "var(--accent, #6366f1)", textDecoration: "underline", marginTop: "6px" }}
          >
            ← Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
