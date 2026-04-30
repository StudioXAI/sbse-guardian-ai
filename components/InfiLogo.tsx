/* ─────────────────────────────────────────────────────────────
   INFI MultiChain Logo

   Inline SVG recreation of the chain-link mark for use as a small
   header logo. The original JPG has a white background and 3D
   gloss detail that doesn't survive at small sizes — this clean
   SVG version reads better at 16-32px and is fully transparent.

   Colors match the source:
   - Green chains   (top-left, bottom-right)
   - Cyan/blue chain (top-right)
   - Blue chain     (bottom-left)
   - Red center hub

   For larger contexts (marketing, landing hero), use the original
   PNG at /infi-multichain-logo.png.
   ───────────────────────────────────────────────────────────── */

interface Props {
  /** Pixel size (logo is square, this is both width and height). */
  size?: number;
  /** Optional className for outer wrapper. */
  className?: string;
}

export default function InfiLogo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="INFI MultiChain"
      role="img"
    >
      {/* Central red hub */}
      <defs>
        <radialGradient id="infiHub" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff5a7a" />
          <stop offset="60%" stopColor="#e63350" />
          <stop offset="100%" stopColor="#a01e35" />
        </radialGradient>
        <linearGradient id="infiGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d160" />
          <stop offset="100%" stopColor="#0a8a3a" />
        </linearGradient>
        <linearGradient id="infiCyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22c8e0" />
          <stop offset="100%" stopColor="#0a6a8a" />
        </linearGradient>
        <linearGradient id="infiBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a6ed9" />
          <stop offset="100%" stopColor="#1a3a82" />
        </linearGradient>
      </defs>

      {/* Hub circle */}
      <circle cx="50" cy="50" r="14" fill="url(#infiHub)" />

      {/* Top-left link (green) — rounded rect rotated -45° */}
      <g transform="translate(28 28) rotate(-45)">
        <rect
          x="-22"
          y="-9"
          width="32"
          height="18"
          rx="9"
          ry="9"
          fill="none"
          stroke="url(#infiGreen)"
          strokeWidth="4"
        />
      </g>

      {/* Top-right link (cyan) — rotated 45° */}
      <g transform="translate(72 28) rotate(45)">
        <rect
          x="-10"
          y="-9"
          width="32"
          height="18"
          rx="9"
          ry="9"
          fill="none"
          stroke="url(#infiCyan)"
          strokeWidth="4"
        />
      </g>

      {/* Bottom-left link (blue) — rotated 45° */}
      <g transform="translate(28 72) rotate(45)">
        <rect
          x="-22"
          y="-9"
          width="32"
          height="18"
          rx="9"
          ry="9"
          fill="none"
          stroke="url(#infiBlue)"
          strokeWidth="4"
        />
      </g>

      {/* Bottom-right link (green) — rotated -45° */}
      <g transform="translate(72 72) rotate(-45)">
        <rect
          x="-10"
          y="-9"
          width="32"
          height="18"
          rx="9"
          ry="9"
          fill="none"
          stroke="url(#infiGreen)"
          strokeWidth="4"
        />
      </g>
    </svg>
  );
}
