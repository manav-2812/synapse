import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { TopNav } from "./TopNav";
import { useTheme } from "../../hooks/useTheme";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/documents": "Documents",
  "/chat": "Chat",
  "/quiz": "Quiz",
  "/flashcards": "Flashcards",
  "/analytics": "Analytics",
};

export function AppShell() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const title = TITLES[pathname] || "Synapse";

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("synapse_sidebar") === "collapsed";
  });

  useEffect(() => {
    localStorage.setItem("synapse_sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="app-main">
        <div className="aurora" aria-hidden="true" />
        <div className="app-header">
          <TopNav title={title} theme={theme} onToggleTheme={toggle} />
        </div>
        <main className="app-content" id="main">
          <div className="route-view" key={pathname}>
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
