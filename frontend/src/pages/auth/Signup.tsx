import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import { ApiError, setPersistence } from "../../api/client";
import { startGoogleOAuth, startMicrosoftOAuth } from "../../utils/oauth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { AuthLegalModal, type LegalType } from "../../components/auth/AuthLegalModal";

export default function Signup() {
  const { signup, loginWithPasskey } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<LegalType>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await signup(email.trim(), password, fullName.trim());
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to create your account.";
      setError(msg);
      toast("error", "Sign up failed", msg);
    } finally {
      setBusy(false);
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
    <div className="notion-page">
      <div className="notion-content-wrap">
        {/* Top Logo & Name */}
        <div className="notion-brand-header">
          <div className="notion-brand-icon">
            <BrandLogo size={26} />
          </div>
          <span className="notion-brand-name">SYNAPSE</span>
        </div>

        {/* Headings */}
        <h1 className="notion-main-title">Your AI workspace.</h1>
        <p className="notion-sub-title">Sign up for your Synapse account</p>

        {error && (
          <div className="notion-error-banner" role="alert">
            <Icon name="close" size={13} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} className="notion-form">
          <div className="notion-field">
            <Input
              label="Your email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
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
            Continue
          </Button>
        </form>

        {/* Divider */}
        <div className="notion-divider">
          <span className="notion-divider-line" />
          <span className="notion-divider-label">or continue with</span>
          <span className="notion-divider-line" />
        </div>

        {/* Social / Auth Tiles Grid */}
        <div className="notion-tiles-grid">
          <button
            type="button"
            className="notion-tile"
            onClick={() => onSocialClick("Google")}
          >
            <div className="notion-tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
            </div>
            <span className="notion-tile-text">Google</span>
          </button>

          <button
            type="button"
            className="notion-tile"
            onClick={() => onSocialClick("Microsoft")}
          >
            <div className="notion-tile-icon">
              <svg width="19" height="19" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            </div>
            <span className="notion-tile-text">Microsoft</span>
          </button>

          <button
            type="button"
            className="notion-tile"
            onClick={() => onSocialClick("Passkey")}
          >
            <div className="notion-tile-icon">
              <Icon name="key" size={19} />
            </div>
            <span className="notion-tile-text">Passkey</span>
          </button>
        </div>

        {/* Switch to Login */}
        <div className="notion-switch-link">
          <span>Existing user?</span>{" "}
          <Link to="/login" className="notion-link-bold">
            Log in
          </Link>
        </div>

        {/* Terms */}
        <p className="notion-legal-text">
          By continuing, you acknowledge that you understand and agree to the{" "}
          <button
            type="button"
            className="notion-legal-link-btn"
            onClick={() => setLegalModal("terms")}
          >
            Terms &amp; Conditions
          </button>{" "}
          and{" "}
          <button
            type="button"
            className="notion-legal-link-btn"
            onClick={() => setLegalModal("privacy")}
          >
            Privacy Policy
          </button>
        </p>
      </div>

      {/* Legal Modal */}
      <AuthLegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  );
}

