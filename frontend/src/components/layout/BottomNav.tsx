import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./nav";
import { Icon } from "../ui/Icon";

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV_ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
        >
          <Icon name={it.icon} />
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
