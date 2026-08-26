import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { documentsApi } from "../../api/documents";
import { formatBytes } from "../../lib/format";

interface Props {
  title: string;
}

export function TopNav({ title }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const [storageBytes, setStorageBytes] = useState(0);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    documentsApi
      .list()
      .then((docs) => {
        if (cancelled) return;
        setStorageBytes(docs.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0));
        setDocCount(docs.length);
      })
      .catch(() => {/* non-critical */});
    return () => { cancelled = true; };
  }, []);

  function closeAll() {
    setMenuOpen(false);
    setWorkspaceOpen(false);
  }

  // Escape closes any open popover.
  useEffect(() => {
    if (!menuOpen && !workspaceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, workspaceOpen]);

  const initial = (user?.full_name || user?.email || "?")
    .slice(0, 1)
    .toUpperCase();

  const storageLabel = formatBytes(storageBytes);

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <h1>{title}</h1>
      </div>

      <div className="top-nav-search">
        <button
          className="global-search"
          title="Search or ask AI…  (Ctrl/Cmd + K)"
          onClick={() => navigate("/search")}
        >
          <Icon name="search" size={16} />
          <span className="global-search-text">Search or ask AI…</span>
          <kbd className="kbd-hint">⌘K</kbd>
        </button>
      </div>

      <div className="top-nav-actions">
        <button
          className="storage-chip"
          aria-label={`Storage used: ${storageLabel}`}
          title={`${storageLabel} used across ${docCount} ${
            docCount === 1 ? "file" : "files"
          }`}
          onClick={() => navigate("/documents")}
        >
          <Icon name="hardDrive" size={15} />
          <span className="storage-chip-text">{storageLabel}</span>
        </button>

        <div className="top-nav-divider" aria-hidden="true" />

        <div className="nav-item-wrap">
          <button
            className="workspace-pill"
            aria-label="Switch workspace (Personal)"
            title="Workspace"
            onClick={() => {
              setWorkspaceOpen((o) => !o);
              if (!workspaceOpen) {
                setMenuOpen(false);
              }
            }}
          >
            <Icon name="layers" size={15} />
            <span className="workspace-name">Personal</span>
            <Icon name="chevronDown" size={14} />
          </button>
          {workspaceOpen && (
            <>
              <div className="menu-backdrop" onClick={closeAll} aria-hidden="true" />
              <div className="menu workspace-menu" role="menu">
                <div className="menu-head">
                  <div className="menu-name">Workspaces</div>
                </div>
                <div className="menu-item current">
                  <Icon name="layers" size={15} />
                  Personal
                  <Icon name="check" size={14} className="check" />
                </div>
                <div className="menu-item disabled" role="menuitem" aria-disabled="true">
                  <Icon name="plus" size={15} />
                  New workspace
                  <span className="soon">soon</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="avatar-wrap">
          <button
            className="avatar avatar-btn"
            aria-label="Open profile menu"
            title={user?.full_name || user?.email || "Profile"}
            onClick={() => {
              setMenuOpen((o) => !o);
              if (!menuOpen) {
                setWorkspaceOpen(false);
              }
            }}
          >
            {user?.profile_image_url ? (
              <img src={user.profile_image_url} alt="" className="avatar-img" />
            ) : (
              initial
            )}
          </button>
          {menuOpen && (
            <>
              <div
                className="menu-backdrop"
                onClick={closeAll}
                aria-hidden="true"
              />
              <div className="sb-profile-popover sb-profile-popover--topnav" role="menu">
                <button
                  className="sb-profile-pop-item"
                  role="menuitem"
                  onClick={() => {
                    closeAll();
                    navigate("/profile");
                  }}
                >
                  <span>Settings</span>
                </button>
                <button
                  className="sb-profile-pop-item"
                  role="menuitem"
                  onClick={() => void logout()}
                >
                  <span>Log out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
