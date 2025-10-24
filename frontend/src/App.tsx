import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { useShortcuts } from "./hooks/useShortcuts";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";

// Route-level code splitting keeps the initial bundle small (Phase 4 / perf).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Documents = lazy(() => import("./pages/Documents"));
const Chat = lazy(() => import("./pages/Chat"));
const Quiz = lazy(() => import("./pages/Quiz"));
const Flashcards = lazy(() => import("./pages/Flashcards"));
const Notes = lazy(() => import("./pages/Notes"));
const Analytics = lazy(() => import("./pages/Analytics"));
const EvalDashboard = lazy(() => import("./pages/EvalDashboard"));
const Profile = lazy(() => import("./pages/Profile"));

function RouteFallback() {
  return (
    <div className="spinner-center">
      <span className="spinner" role="status" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcuts(() => setHelpOpen(true));

  useEffect(() => {
    const onShortcuts = () => setHelpOpen(true);
    window.addEventListener("synapse:shortcuts", onShortcuts);
    return () => window.removeEventListener("synapse:shortcuts", onShortcuts);
  }, []);

  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected (rendered inside the app shell via <Outlet/>) */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/documents"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Documents />
              </Suspense>
            }
          />
          <Route
            path="/chat"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Chat />
              </Suspense>
            }
          />
          <Route
            path="/quiz"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Quiz />
              </Suspense>
            }
          />
          <Route
            path="/flashcards"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Flashcards />
              </Suspense>
            }
          />
          <Route
            path="/notes"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Notes />
              </Suspense>
            }
          />
          <Route
            path="/analytics"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Analytics />
              </Suspense>
            }
          />
          <Route
            path="/profile"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Profile />
              </Suspense>
            }
          />
          <Route
            path="/eval"
            element={
              <Suspense fallback={<RouteFallback />}>
                <EvalDashboard />
              </Suspense>
            }
          />
        </Route>

        {/* Anything else -> dashboard (RequireAuth will bounce to /login if needed) */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Global command palette (Ctrl/Cmd+K) + shortcuts help (?) */}
      <CommandPalette />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
