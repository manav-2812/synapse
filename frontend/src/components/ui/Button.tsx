import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  className = "",
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={`btn btn-${variant} ${fullWidth ? "btn-full" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner spinner-sm" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
