import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../../api/auth";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { useTheme } from "../../hooks/useTheme";
import { validateCertifiedEmail } from "../../utils/validation";
import "../../styles/auth.css";

export default function ForgotPassword() {
  const { themeMode, setThemeMode } = useTheme();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const emailErr = validateCertifiedEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    setBusy(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setSent(true);
      if (res?.dev_reset_link) {
        setDevLink(res.dev_reset_link);
      }
      toast("success", "Reset link sent", "If an account exists, instructions have been dispatched.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to process password reset. Please try again.";
      setError(msg);
      toast("error", "Request failed", msg);
    } finally {
      setBusy(false);
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
        {/* Top Logo & Name */}
        <div className="notion-brand-header">
          <div className="notion-brand-icon">
            <BrandLogo size={26} />
          </div>
          <span className="notion-brand-name">SYNAPSE</span>
        </div>

        {/* Headings */}
        <h1 className="notion-main-title">Reset your password.</h1>
        <p className="notion-sub-title">
          {sent
            ? "Check your inbox or use the link below."
            : "Enter your email to receive a password reset link."}
        </p>

        {error && (
          <div className="notion-error-banner" role="alert">
            <Icon name="close" size={13} />
            <span>{error}</span>
          </div>
        )}

        {sent ? (
          <div className="notion-success-card">
            <div className="notion-success-icon">
              <Icon name="check" size={20} />
            </div>
            <p className="notion-success-text">
              If an account is associated with <strong>{email}</strong>, a password reset link has been dispatched. The link expires in 15 minutes.
            </p>

            {devLink ? (
              <div style={{ marginTop: "16px", width: "100%" }}>
                <a
                  href={devLink}
                  className="notion-btn-primary"
                  style={{ textDecoration: "none", width: "100%", justifyContent: "center" }}
                >
                  Click to Reset Password Now
                </a>
              </div>
            ) : (
              <Link to="/login" className="notion-btn-primary" style={{ textDecoration: "none", marginTop: "16px" }}>
                Back to Sign in
              </Link>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="notion-form">
            <div className="notion-field">
              <Input
                label="Your email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your registered email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <Button type="submit" fullWidth loading={busy} className="notion-btn-primary">
              Send reset link
            </Button>
          </form>
        )}

        {/* Switch to Login */}
        <div className="notion-switch-link" style={{ marginTop: "24px" }}>
          <span>Remember your password?</span>{" "}
          <Link to="/login" className="notion-link-bold">
            Sign in
          </Link>
        </div>

        {/* Terms */}
        <p className="notion-legal-text">
          By continuing, you acknowledge that you understand and agree to the{" "}
          <Link
            to="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="notion-legal-link-btn"
          >
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link
            to="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="notion-legal-link-btn"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </main>
  );
}
