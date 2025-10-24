const LABELS: Record<string, string> = {
  pending: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export function StatusBadge({
  status,
  error,
}: {
  status: string;
  error?: string | null;
}) {
  const label =
    status === "failed" && error ? `Failed: ${error}` : LABELS[status] || status;
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
