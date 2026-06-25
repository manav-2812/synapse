import type { ReactNode } from "react";
import { useTips } from "../context/TipsContext";
import { Icon } from "./ui/Icon";

interface Props {
  /** Stable id — once dismissed it is remembered in localStorage. */
  id: string;
  title: string;
  /** Short body copy. */
  children?: ReactNode;
  icon?: string;
}

/**
 * Inline, frosted contextual tip card. Shows once per `id` on first visit
 * (remembered via TipsContext). Dismissable with a "Don't show again" option.
 */
export function Tip({ id, title, children, icon = "sparkles" }: Props) {
  const { isDismissed, dismiss } = useTips();
  if (isDismissed(id)) return null;

  return (
    <div className="tip" role="status">
      <span className="tip-ico">
        <Icon name={icon} size={18} />
      </span>
      <div className="tip-body">
        <div className="tip-title">{title}</div>
        {children && <div className="tip-text muted">{children}</div>}
      </div>
      <div className="tip-actions">
        <button className="link-btn" onClick={() => dismiss(id, false)}>
          Got it
        </button>
        <button
          className="tip-dismiss"
          aria-label="Don't show this tip again"
          onClick={() => dismiss(id, true)}
        >
          Don't show again
        </button>
      </div>
    </div>
  );
}
