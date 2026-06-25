interface Props {
  size?: "sm" | "md" | "lg";
}

export function Spinner({ size = "md" }: Props) {
  return (
    <span
      className={`spinner spinner-${size}`}
      role="status"
      aria-label="Loading"
    >
      <span className="spinner-ring" aria-hidden="true" />
    </span>
  );
}
