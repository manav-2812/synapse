const LABELS: Record<string, string> = {
  pending: "Queued",
  processing: "Processing",
  completed: "Ready",
  failed: "Failed",
};

export function StatusBadge({
  status,
  error,
}: {
  status: string;
  error?: string | null;
}) {
  const label = LABELS[status] || status;
  return (
    <span
      className={`status-badge status-${status}`}
      title={status === "failed" && error ? error : undefined}
    >
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
