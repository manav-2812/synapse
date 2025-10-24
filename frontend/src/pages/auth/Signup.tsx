import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { BrandLogo } from "../../components/ui/BrandLogo";

export default function Signup() {
  const { signup } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <h1>Create your account</h1>
          <p className="auth-sub">
            Turn your documents into notes, quizzes, and conversation.
          </p>
        </div>

        {error && (
          <div className="error-text" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          <Input
            label="Full name"
            name="full_name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
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
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" fullWidth loading={busy}>
            Create account
          </Button>
        </form>

        <div className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </main>
    </div>
  );
}
