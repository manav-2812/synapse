import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Icon } from "../ui/Icon";
import "../../styles/app.css";

const LS_KEY = "synapse_sidebar_v2";

export function AppShell() {
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.innerWidth > 768) {
        localStorage.setItem(LS_KEY, collapsed ? "1" : "0");
      }
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    const handleToggle = () => setCollapsed((prev) => !prev);
    const handleOpen = () => setCollapsed(false);
    window.addEventListener("synapse:toggle-app-sidebar", handleToggle);
    window.addEventListener("synapse:open-app-sidebar", handleOpen);
    return () => {
      window.removeEventListener("synapse:toggle-app-sidebar", handleToggle);
      window.removeEventListener("synapse:open-app-sidebar", handleOpen);
    };
  }, []);

  // Scroll content area to top and auto-close sidebar on mobile navigation
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setCollapsed(true);
    }
  }, [pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={`app-shell${collapsed ? " sidebar-is-collapsed" : ""}`}>
        {!collapsed && (
          <>
            <div
              className="sidebar-mobile-backdrop"
              onClick={() => setCollapsed(true)}
              aria-hidden="true"
            />
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(true)} />
          </>
        )}
        <main className="app-content" id="main" ref={contentRef}>
          {collapsed && (
            <button
              className="top-corner-hamburger-btn"
              onClick={() => setCollapsed(false)}
              title="Open sidebar (Ctrl+\)"
              aria-label="Open sidebar"
            >
              <Icon name="menu" size={20} />
            </button>
          )}
          <div className="route-view" key={pathname}>
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </>
  );
}
