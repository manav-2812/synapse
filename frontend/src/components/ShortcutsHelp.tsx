import { useEffect } from "react";
import { SHORTCUTS } from "../hooks/useShortcuts";
import { Icon } from "./ui/Icon";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <span className="shortcuts-title">
            <Icon name="sparkles" size={16} /> Keyboard shortcuts
          </span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="shortcuts-list">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="shortcut-row">
              <span className="shortcut-label">{s.label}</span>
              <span className="shortcut-keys">
                {s.keys.map((k) => (
                  <kbd key={k} className="kbd-hint">{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
