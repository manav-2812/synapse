// Reusable empty state used across every list view (Phase C3).
import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  /** Tint of the frosted icon disc. */
  tone?: "default" | "accent";
}

export function EmptyState({ icon = "doc", title, hint, action, tone = "default" }: Props) {
  return (
    <div className="empty">
      <span className={`empty-icon ${tone === "accent" ? "tone-accent" : ""}`}>
        <Icon name={icon} size={24} />
      </span>
      <div className="empty-title">{title}</div>
      {hint && <span className="muted">{hint}</span>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
