import { useId } from "react";

interface Props {
  /** Box size in px. Defaults to 100% so it fills its `.logo` container. */
  size?: number | string;
  className?: string;
}

/**
 * Synapse brand mark: a white synaptic glyph (a central node firing to three
 * neighbors) on the signature aurora violet→azure→cyan tile. One component
 * powers the sidebar/auth branding and the favicon, so the identity stays
 * consistent from 16px tab icon to 38px auth hero.
 */
export function BrandLogo({ size = "100%", className }: Props) {
  const raw = useId();
  const uid = raw.replace(/:/g, "");
  const tileId = `syn-tile-${uid}`;
  const glossId = `syn-gloss-${uid}`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={tileId} x1="6" y1="3" x2="58" y2="61" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c6ff0" />
          <stop offset="0.52" stopColor="#4f8bff" />
          <stop offset="1" stopColor="#34d6e0" />
        </linearGradient>
        <radialGradient id={glossId} cx="0.3" cy="0.24" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Tile */}
      <rect x="4" y="4" width="56" height="56" rx="15" fill={`url(#${tileId})`} />
      <rect x="4" y="4" width="56" height="56" rx="15" fill={`url(#${glossId})`} />

      {/* Synapse: soft glow + firing connections + nodes */}
      <circle cx="32" cy="32" r="10" fill="#ffffff" opacity="0.12" />
      <g stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" opacity="0.9" fill="none">
        <path d="M32 32 Q22 28 20 20" />
        <path d="M32 32 Q45 27 45 22" />
        <path d="M32 32 Q40 41 33 47" />
      </g>
      <g fill="#ffffff">
        <circle cx="20" cy="20" r="4" />
        <circle cx="45" cy="22" r="4" />
        <circle cx="33" cy="47" r="4.2" />
        <circle cx="32" cy="32" r="6.6" />
      </g>
    </svg>
  );
}
