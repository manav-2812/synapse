import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import { authApi } from "../../api/auth";
import { ApiError, setPersistence } from "../../api/client";
import { startGoogleOAuth, startMicrosoftOAuth } from "../../utils/oauth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { useTheme } from "../../hooks/useTheme";
import { validateCertifiedEmail } from "../../utils/validation";
import "../../styles/auth.css";

export default function Signup() {
  const { signup, loginWithPasskey } = useAuth();
  const { themeMode, setThemeMode } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailInlineError, setEmailInlineError] = useState<string | null>(null);

  // Post-signup verification state
  // Security: dev_verify_link is intentionally absent -- signed links are written
  // to the server log only and never returned in HTTP response bodies.
  const [verificationPending, setVerificationPending] = useState<{
    email: string;
  } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function handleEmailBlur() {
    if (!email) {
      setEmailInlineError(null);
      return;
    }
    const err = validateCertifiedEmail(email);
    setEmailInlineError(err);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailInlineError(null);

    const emailErr = validateCertifiedEmail(email);
    if (emailErr) {
      setEmailInlineError(emailErr);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await signup(email.trim(), password, fullName.trim());
      if (res?.is_verified === false) {
        setVerificationPending({ email: email.trim() });
        setResendCooldown(60);
        toast("success", "Account created", "Please check your inbox to verify your email address.");
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      // Whitelist safe, user-facing messages. Show a generic fallback for
      // anything unexpected so internal errors never reach the UI.
      const rawMsg = err instanceof ApiError ? err.message : "";
      const SAFE_PATTERNS = [
        "email", "domain", "password", "character", "name", "account",
        "already exists", "invalid", "disposable", "temporary", "address",
      ];
      const isSafe = SAFE_PATTERNS.some((p) => rawMsg.toLowerCase().includes(p));
      const msg = isSafe ? rawMsg : "Unable to create your account. Please try again.";
      if (msg.toLowerCase().includes("domain") || msg.toLowerCase().includes("email")) {
        setEmailInlineError(msg);
      }
      setError(msg);
      toast("error", "Sign up failed", msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendEmail() {
    if (!verificationPending?.email || resendCooldown > 0) return;
    setResending(true);
    try {
      await authApi.resendVerification(verificationPending.email);
      setResendCooldown(60);
      toast("success", "Verification resent", "A new verification link has been sent to your email.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to resend verification email.";
      toast("error", "Resend failed", msg);
    } finally {
      setResending(false);
    }
  }

  async function onSocialClick(provider: string) {
    if (provider === "Google") {
      try {
        startGoogleOAuth();
      } catch (err: any) {
        toast("error", "Google Sign-in failed", err?.message || "Failed to redirect to Google.");
      }
      return;
    }
    if (provider === "Microsoft") {
      try {
        startMicrosoftOAuth();
      } catch (err: any) {
        toast("error", "Microsoft Sign-in failed", err?.message || "Failed to redirect to Microsoft.");
      }
      return;
    }
    if (provider === "Passkey") {
      setError(null);
      setBusy(true);
      try {
        setPersistence(true);
        await loginWithPasskey();
        navigate("/dashboard", { replace: true });
        toast("success", "Passkey verified", "Welcome to Synapse!");
      } catch (err: any) {
        const msg =
          err?.message || (err instanceof ApiError ? err.message : "Passkey sign-in cancelled or failed.");
        setError(msg);
        toast("error", "Passkey sign-in failed", msg);
      } finally {
        setBusy(false);
      }
      return;
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

        {verificationPending ? (
          /* Verification Required Screen */
          <div className="notion-verification-card">
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "var(--accent-primary, #6366f1)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Icon name="mail" size={28} />
              </div>
              <h1 className="notion-main-title" style={{ fontSize: 22 }}>Check your inbox</h1>
              <p className="notion-sub-title" style={{ marginTop: 6, fontSize: 14 }}>
                We sent a confirmation link to <strong style={{ color: "var(--text-primary, #111827)" }}>{verificationPending.email}</strong>.
              </p>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: 8,
                background: "var(--surface-subtle, #f9fafb)",
                border: "1px solid var(--border-subtle, #e5e7eb)",
                fontSize: 13,
                color: "var(--text-secondary, #4b5563)",
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              Click the link inside the email to verify your address and enter your Synapse workspace. The link expires in 24 hours.
            </div>

            <Button
              variant="secondary"
              fullWidth
              onClick={handleResendEmail}
              disabled={resending || resendCooldown > 0}
              style={{ marginBottom: 12 }}
            >
              {resending
                ? "Sending..."
                : resendCooldown > 0
                ? `Resend link in ${resendCooldown}s`
                : "Resend verification email"}
            </Button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Link
                to="/login"
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary, #6b7280)",
                  textDecoration: "underline",
                }}
              >
                Back to Sign in
              </Link>
            </div>
          </div>
        ) : (
          /* Standard Signup Form */
          <>
            <h1 className="notion-main-title">Your AI workspace.</h1>
            <p className="notion-sub-title">Sign up for your Synapse account</p>

            {error && !emailInlineError && (
              <div className="notion-error-banner" role="alert">
                <Icon name="close" size={13} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="notion-form" noValidate>
              <div className="notion-field">
                <Input
                  label="Your email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailInlineError) setEmailInlineError(null);
                  }}
                  onBlur={handleEmailBlur}
                  required
                />
                {emailInlineError && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "#ef4444",
                      lineHeight: 1.4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    role="alert"
                  >
                    <Icon name="close" size={12} />
                    <span>{emailInlineError}</span>
                  </div>
                )}
              </div>

              <div className="notion-field">
                <Input
                  label="Full name"
                  name="full_name"
                  autoComplete="name"
                  placeholder="e.g. Ada Lovelace"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="notion-field">
                <Input
                  label="Password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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

              <Button type="submit" fullWidth loading={busy} className="notion-btn-primary">
                Create account
              </Button>
            </form>

            <div className="notion-divider">
              <span className="notion-divider-line" />
              <span className="notion-divider-label">or continue with</span>
              <span className="notion-divider-line" />
            </div>

            <div className="notion-tiles-grid">
              <button
                type="button"
                className="notion-tile"
                onClick={() => onSocialClick("Google")}
                aria-label="Continue with Google"
              >
                <div className="notion-tile-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <span className="notion-tile-label">Google</span>
              </button>

              <button
                type="button"
                className="notion-tile"
                onClick={() => onSocialClick("Microsoft")}
                aria-label="Continue with Microsoft"
              >
                <div className="notion-tile-icon">
                  <svg width="18" height="18" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                </div>
                <span className="notion-tile-label">Microsoft</span>
              </button>

              <button
                type="button"
                className="notion-tile"
                onClick={() => onSocialClick("Passkey")}
                aria-label="Continue with Passkey"
              >
                <div className="notion-tile-icon">
                  <Icon name="key" size={18} />
                </div>
                <span className="notion-tile-label">Passkey</span>
              </button>
            </div>

            <p className="notion-footer-text">
              Existing user?{" "}
              <Link to="/login" className="notion-link-bold">
                Log in
              </Link>
            </p>
          </>
        )}

        <div className="notion-legal-footer">
          By continuing, you agree to Synapse&apos;s{" "}
          <Link to="/terms" target="_blank" className="notion-legal-link">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" target="_blank" className="notion-legal-link">
            Privacy Policy
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
