import { useEffect } from "react";
import { Icon } from "./ui/Icon";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function LogoutConfirmModal({ onConfirm, onCancel, loading }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="logout-overlay"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
      aria-describedby="logout-desc"
    >
      <div className="logout-modal">
        {/* Icon */}
        <div className="logout-modal-icon">
          <Icon name="logout" size={22} />
        </div>

        {/* Copy */}
        <h2 className="logout-modal-title" id="logout-title">
          Log out of your account?
        </h2>
        <p className="logout-modal-desc" id="logout-desc">
          You will need to log back in to access your Synapse workspace.
        </p>

        {/* Actions */}
        <div className="logout-modal-actions">
          <button
            className="logout-confirm-btn"
            onClick={onConfirm}
            disabled={loading}
            autoFocus
          >
            {loading ? (
              <span className="spinner spinner-sm" role="status" aria-label="Logging out" />
            ) : (
              "Log out"
            )}
          </button>
          <button className="logout-cancel-btn" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
