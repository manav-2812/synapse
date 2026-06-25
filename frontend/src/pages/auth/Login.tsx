import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import { ApiError, setPersistence } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";

function getRedirect(): string {
  const r = localStorage.getItem("synapse_redirect");
  if (r && r !== "/login" && r !== "/signup") {
    localStorage.removeItem("synapse_redirect");
    return r;
  }
  return "/dashboard";
}

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setPersistence(remember);
      await login(email.trim(), password);
      navigate(getRedirect(), { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to sign in. Please try again.";
      setError(msg);
      toast("error", "Sign in failed", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="aurora" aria-hidden="true" />
      <div className="aurora aurora-2" aria-hidden="true" />

      <main className="auth-card">
        <div className="auth-head">
          <div className="auth-brand">
            <span className="logo">
              <BrandLogo />
            </span>
            <span className="auth-wordmark">Synapse</span>
          </div>
          <h1>Welcome back</h1>
          <p className="auth-sub">Sign in to pick up where you left off.</p>
        </div>

        {error && (
          <div className="error-text" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            trailing={
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                tabIndex={0}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
              </button>
            }
          />

          <div className="auth-opt">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
          </div>

          <Button type="submit" fullWidth loading={busy}>
            Sign in
          </Button>
        </form>

        <div className="auth-foot">
          New to Synapse? <Link to="/signup">Create an account</Link>
        </div>
      </main>
    </div>
  );
}
