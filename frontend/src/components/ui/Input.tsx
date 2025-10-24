import { useId, type InputHTMLAttributes, type ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  // Optional content rendered inside the field on the right (e.g. a
  // show/hide-password toggle). The input gets extra right padding so text
  // never sits under the adornment.
  trailing?: ReactNode;
}

export function Input({ label, error, id, className = "", trailing, ...rest }: Props) {
  // Connect the label to the input. Prefer an explicit id/name; otherwise
  // generate a stable one so inputs rendered without a `name` (e.g. on the
  // Profile page) are still properly associated with their <label> for
  // assistive tech and axe-core ("Form elements must have labels").
  const reactId = useId();
  const inputId = id || rest.name || reactId;
  return (
    <div className="field">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="input-wrap">
        <input
          id={inputId}
          className={`input ${trailing ? "has-trailing" : ""} ${
            error ? "input-error" : ""
          } ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...rest}
        />
        {trailing && <div className="input-trailing">{trailing}</div>}
      </div>
      {error && (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
