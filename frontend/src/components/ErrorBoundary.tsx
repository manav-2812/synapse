import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Global error boundary. Catches render-time exceptions anywhere below it
 * (Phase 5) so a single broken subtree shows a recoverable fallback
 * instead of a white screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production this is where you'd ship to Sentry/etc.
    console.error("Uncaught UI error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="auth-screen">
          <main className="auth-card">
            <div className="auth-brand">
              <span
                className="logo"
                style={{
                  background: "var(--warn-bg)",
                  color: "var(--warn)",
                  boxShadow: "none",
                }}
                aria-hidden="true"
              >
                ⚠
              </span>
              <span>Something broke</span>
            </div>
            <h1>Synapse hit a snag</h1>
            <p className="auth-sub">
              An unexpected error occurred while rendering this screen. Your data
              is safe — reloading usually clears it.
            </p>
            {import.meta.env.DEV && (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  background: "var(--surface-2)",
                  padding: 12,
                  borderRadius: 8,
                  color: "var(--danger)",
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button className="btn btn-primary btn-full" onClick={() => location.reload()}>
              Reload
            </button>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}
