import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DeleteAccountModal({ onConfirm, onCancel, loading }: Props) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel, loading]);

  const isConfirmed = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div
      className="logout-overlay"
      onClick={(e) => e.target === e.currentTarget && !loading && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-desc"
      style={{
        backdropFilter: "blur(8px)",
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="logout-modal"
        style={{
          maxWidth: 480,
          background: "radial-gradient(130% 130% at 50% 0%, rgba(239, 68, 68, 0.08) 0%, rgba(24, 24, 27, 0.95) 100%)",
          border: "1px solid rgba(239, 68, 68, 0.28)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.7), 0 0 50px -10px rgba(239, 68, 68, 0.2)",
          borderRadius: 20,
          padding: "32px 28px",
        }}
      >
        {/* Warning Icon Badge */}
        <div
          className="logout-modal-icon"
          style={{
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.1) 100%)",
            color: "#f87171",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            boxShadow: "0 0 24px rgba(239, 68, 68, 0.25)",
            width: 56,
            height: 56,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
          }}
        >
          <Icon name="trash" size={26} />
        </div>

        {/* Copy */}
        <h2
          className="logout-modal-title"
          id="delete-account-title"
          style={{
            color: "var(--text-primary, #fff)",
            fontSize: "1.28rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Delete Account &amp; All Workspace Data?
        </h2>
        <p
          className="logout-modal-desc"
          id="delete-account-desc"
          style={{
            fontSize: "0.88rem",
            lineHeight: 1.55,
            color: "var(--text-secondary, #a1a1aa)",
            marginBottom: 20,
          }}
        >
          This will permanently purge your user profile, uploaded files on disk, ChromaDB vector collections, flashcards, quizzes, study notes, and chat threads. This action is <strong>irreversible</strong> (GDPR &amp; CCPA Right to Erasure).
        </p>

        {/* Confirmation Input Box */}
        <div
          style={{
            marginTop: 8,
            marginBottom: 24,
            textAlign: "left",
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <label
            style={{
              fontSize: "0.82rem",
              color: "var(--text-secondary, #cbd5e1)",
              display: "block",
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            Please type <span style={{ color: "#ef4444", fontWeight: 700, letterSpacing: "0.05em" }}>DELETE</span> to confirm:
          </label>
          <input
            type="text"
            className="input"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={loading}
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: confirmText && !isConfirmed ? "1px solid rgba(239, 68, 68, 0.5)" : "1px solid var(--border-color, rgba(255,255,255,0.12))",
              background: "rgba(15, 23, 42, 0.6)",
              color: "#fff",
              fontSize: "0.95rem",
              letterSpacing: "0.04em",
              outline: "none",
            }}
          />
        </div>

        {/* Actions */}
        <div className="logout-modal-actions" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            className="danger-btn-premium"
            onClick={onConfirm}
            disabled={!isConfirmed || loading}
            style={{
              width: "100%",
              padding: "13px 20px",
              opacity: !isConfirmed ? 0.45 : 1,
              cursor: !isConfirmed || loading ? "not-allowed" : "pointer",
            }}
          >
            <Icon name="trash" size={16} />
            <span>{loading ? "Erasing Account..." : "Permanently Delete My Account"}</span>
          </button>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            style={{ width: "100%", padding: "10px 18px", borderRadius: 10 }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
