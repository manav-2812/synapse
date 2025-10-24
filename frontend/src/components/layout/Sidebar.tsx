import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./nav";
import { Icon } from "../ui/Icon";
import { BrandLogo } from "../ui/BrandLogo";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: Props) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Primary">
      <div className="sidebar-brand">
        <span className="logo">
          <BrandLogo />
        </span>
        <span className="brand-label">Synapse</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            title={collapsed ? it.label : undefined}
          >
            <span className="ico">
              <Icon name={it.icon} />
            </span>
            <span className="nav-label">{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="ico">
            <Icon name="chevron" size={16} />
          </span>
          <span className="nav-label">{collapsed ? "" : "Collapse"}</span>
        </button>
      </div>
    </aside>
  );
}
