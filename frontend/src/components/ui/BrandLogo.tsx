interface Props {
  /** Box size in px or CSS units. Defaults to 24px so it scales naturally. */
  size?: number | string;
  className?: string;
}

/**
 * Synapse Atomic Orbital Logo Mark
 * Bold vector representation matching the user's reference with dual intersecting stadium loops and central nucleus ring.
 */
export function BrandLogo({ size = 24, className }: Props) {
  return (
    <svg
      className={`syn-brand-seal ${className || ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Orbital Loop 1 (tilted -45°) */}
      <rect
        x="1.5"
        y="6.75"
        width="21"
        height="10.5"
        rx="5.25"
        transform="rotate(-45 12 12)"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Orbital Loop 2 (tilted +45°) */}
      <rect
        x="1.5"
        y="6.75"
        width="21"
        height="10.5"
        rx="5.25"
        transform="rotate(45 12 12)"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Central Nucleus Ring */}
      <circle
        cx="12"
        cy="12"
        r="2.6"
        stroke="currentColor"
        strokeWidth="2.3"
        fill="none"
      />
    </svg>
  );
}
