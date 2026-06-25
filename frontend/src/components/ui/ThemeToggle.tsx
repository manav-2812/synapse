// Animated light/dark toggle (Phase C9): the sun and moon cross-fade and
// rotate as `data-theme` on <html> flips, honoring prefers-reduced-motion.
import { Icon } from "./Icon";

interface Props {
  theme: string;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: Props) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={onToggle}
    >
      <span className="tt-icon tt-sun" aria-hidden="true">
        <Icon name="sun" size={18} />
      </span>
      <span className="tt-icon tt-moon" aria-hidden="true">
        <Icon name="moon" size={18} />
      </span>
    </button>
  );
}
