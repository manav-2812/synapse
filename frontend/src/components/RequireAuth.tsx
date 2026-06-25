import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Gates protected routes on an authenticated session. While the initial
 * /users/me lookup is in flight we render nothing (avoids a login flash).
 * On expiry the AuthContext's unauthorized handler already bounces to /login,
 * but we also defensively redirect here if there is no user once loading ends.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
