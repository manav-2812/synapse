import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { useTheme } from "../../hooks/useTheme";
import "../../styles/auth.css";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { verifyEmail } = useAuth();
  const { themeMode, setThemeMode } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"verifying" | "success" | "error">(token ? "verifying" : "error");
  const [errorMsg, setErrorMsg] = useState<string | null>(
    token ? null : "No verification token was provided. Please check the link from your email."
  );
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const verifyingAttemptedRef = useRef(false);

  useEffect(() => {
    if (!token || verifyingAttemptedRef.current) return;
    verifyingAttemptedRef.current = true;

    (async () => {
      try {
        await verifyEmail(token);
        setStatus("success");
        toast("success", "Email verified", "Your workspace is ready. Welcome to Synapse!");
        setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 1200);
      } catch (err) {
        setStatus("error");
        let msg = err instanceof ApiError ? err.message : "Verification link is invalid or expired.";
        if (msg.includes("per 1 minute") || msg.includes("429")) {
          msg = "Too many verification requests. Please wait a few seconds before trying again.";
        }
        setErrorMsg(msg);
        toast("error", "Verification failed", msg);
      }
    })();
  }, [token, verifyEmail, toast, navigate]);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toast("error", "Email required", "Please enter your email to receive a new link.");
      return;
    }
    setResending(true);
    try {
      await authApi.resendVerification(resendEmail.trim());
      setResendDone(true);
      toast("success", "Link sent", "Check your inbox for your new verification link.");
    } catch (err) {
      let msg = err instanceof ApiError ? err.message : "Unable to send verification link.";
      if (msg.includes("per 1 minute") || msg.includes("429")) {
        msg = "Too many requests. Please wait a moment before requesting another link.";
      }
      toast("error", "Resend failed", msg);
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="notion-page">
      <div className="notion-auth-topbar">
        <div className="notion-theme-segmented" role="radiogroup" aria-label="Theme mode switcher">
          <button
            type="button"
            className={`notion-theme-btn ${themeMode === "light" ? "active" : ""}`}
            onClick={() => setThemeMode("light")}
            title="Light mode"
            aria-label="Light mode"
            aria-checked={themeMode === "light"}
            role="radio"
          >
            <Icon name="sun" size={14} />
          </button>
          <button
            type="button"
            className={`notion-theme-btn ${themeMode === "system" ? "active" : ""}`}
            onClick={() => setThemeMode("system")}
            title="System preference"
            aria-label="System theme"
            aria-checked={themeMode === "system"}
            role="radio"
          >
            <Icon name="monitor" size={14} />
          </button>
          <button
            type="button"
            className={`notion-theme-btn ${themeMode === "dark" ? "active" : ""}`}
            onClick={() => setThemeMode("dark")}
            title="Dark mode"
            aria-label="Dark mode"
            aria-checked={themeMode === "dark"}
            role="radio"
          >
            <Icon name="moon" size={14} />
          </button>
        </div>
      </div>

      <div className="notion-content-wrap">
        <div className="notion-brand-header">
          <div className="notion-brand-icon">
            <BrandLogo size={28} />
          </div>
          <span className="notion-brand-name">SYNAPSE</span>
        </div>

        <div className="notion-verification-card">
          {status === "verifying" && (
            <div style={{ padding: "16px 0" }}>
              <h1 className="notion-main-title" style={{ fontSize: 22, marginBottom: 8 }}>
                Verifying your email...
              </h1>
              <p className="notion-sub-title" style={{ fontSize: 14, marginBottom: 28 }}>
                Activating your Synapse workspace, please wait.
              </p>
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 20px" }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    border: "3px solid var(--border-subtle, #e4e4e7)",
                    borderTopColor: "#6366f1",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              </div>
            </div>
          )}

          {status === "success" && (
            <div style={{ padding: "12px 0" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(34, 197, 94, 0.12)",
                  color: "#22c55e",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                ✓
              </div>
              <h1 className="notion-main-title" style={{ fontSize: 22, marginBottom: 6 }}>
                Email verified!
              </h1>
              <p className="notion-sub-title" style={{ fontSize: 14, marginBottom: 24 }}>
                Your account is confirmed. Redirecting to dashboard...
              </p>
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate("/dashboard", { replace: true })}
              >
                Go to Dashboard
              </Button>
            </div>
          )}

          {status === "error" && (
            <div style={{ textAlign: "left" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "#ef4444",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    marginBottom: 14,
                  }}
                >
                  <Icon name="close" size={20} />
                </div>
                <h1 className="notion-main-title" style={{ fontSize: 22, marginBottom: 6 }}>
                  Verification failed
                </h1>
                <p className="notion-sub-title" style={{ fontSize: 14, margin: 0 }}>
                  {errorMsg || "The link may be expired or already used."}
                </p>
              </div>

              {!resendDone ? (
                <form onSubmit={handleResend} className="notion-form" style={{ marginTop: 20 }}>
                  <div className="notion-field">
                    <Input
                      label="Request a new verification link"
                      name="email"
                      type="email"
                      placeholder="Enter your registered email..."
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    disabled={resending || !resendEmail.trim()}
                  >
                    {resending ? "Sending link..." : "Send new verification link"}
                  </Button>
                </form>
              ) : (
                <div
                  className="notion-success-card"
                  style={{ marginTop: 16, marginBottom: 20 }}
                >
                  <div className="notion-success-icon">✓</div>
                  <p className="notion-success-text">
                    Verification email sent! Please check your inbox and click the new link.
                  </p>
                </div>
              )}

              <div style={{ textAlign: "center", marginTop: 24 }}>
                <Link
                  to="/login"
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary, #71717a)",
                    textDecoration: "underline",
                  }}
                >
                  Back to Sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
