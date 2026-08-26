import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../../api/auth";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { useTheme } from "../../hooks/useTheme";
import "../../styles/auth.css";

export default function ResetPassword() {
  const { themeMode, setThemeMode } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing or invalid password reset token. Please request a new link.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setSuccess(true);
      toast("success", "Password updated", "Your password has been changed successfully.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to reset password. The link may have expired.";
      setError(msg);
      toast("error", "Reset failed", msg);
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
        <h1 className="notion-main-title">Create new password.</h1>
        <p className="notion-sub-title">
          {success
            ? "Your password has been changed."
            : "Enter a strong, secure password for your account."}
        </p>

        {error && (
          <div className="notion-error-banner" role="alert">
            <Icon name="close" size={13} />
            <span>{error}</span>
          </div>
        )}

        {!token && !success && (
          <div className="notion-error-banner" role="alert">
            <Icon name="alertTriangle" size={14} />
            <span>No reset token provided. Please request a new link.</span>
          </div>
        )}

        {success ? (
          <div className="notion-success-card">
            <div className="notion-success-icon">
              <Icon name="check" size={20} />
            </div>
            <p className="notion-success-text">
              Your password has been successfully updated. You can now sign in with your new credentials.
            </p>
            <Button
              type="button"
              fullWidth
              className="notion-btn-primary"
              style={{ marginTop: "16px" }}
              onClick={() => navigate("/login", { replace: true })}
            >
              Sign in now
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="notion-form">
            <div className="notion-field">
              <Input
                label="New password"
                name="new_password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Enter new password (min. 8 chars)..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                trailing={
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <Icon name={showPassword ? "eyeOff" : "eye"} size={15} />
                  </button>
                }
              />
            </div>

            <div className="notion-field">
              <Input
                label="Confirm new password"
                name="confirm_password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Confirm your new password..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              fullWidth
              loading={busy}
              disabled={!token}
              className="notion-btn-primary"
            >
              Update password
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
