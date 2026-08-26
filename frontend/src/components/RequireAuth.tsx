import { useState, useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BrandLogo } from "./ui/BrandLogo";

/**
 * Gates protected routes on an authenticated session.
 * If initial session check takes >1.5s (e.g. Render cold start),
 * displays a sleek, informative loading screen instead of a blank page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setShowSlowNotice(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    if (!showSlowNotice) {
      return null;
    }
    return (
      <div className="syn-splash-loader" role="status" aria-live="polite">
        <div className="syn-splash-inner">
          <div className="syn-splash-logo">
            <BrandLogo size={36} />
          </div>
          <div className="syn-splash-title">Synapse Workspace</div>
          <div className="syn-splash-msg">
            <span className="syn-splash-spinner" />
            <span>Waking up server instance...</span>
          </div>
          <p className="syn-splash-hint">
            Free-tier instances spin down on inactivity. This takes up to 45s on first load.
          </p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
