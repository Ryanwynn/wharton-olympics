import type { IconKey } from "@/lib/cohorts";

/**
 * Generic line-art cluster mascots (§12.6). These are deliberately NOT the official
 * Wharton cluster seals (student/Wharton IP) — they are simple, recognizable
 * placeholders in the brand palette. When official seals + permission are obtained,
 * swap the artwork here behind the same `icon_key`; no schema or layout change.
 *
 * Colors resolve through `currentColor`, so a single `color` prop (or CSS `color`)
 * tints the whole glyph.
 */
export function MascotIcon({
  icon,
  size = 28,
  color = "currentColor",
  title,
}: {
  icon: IconKey;
  size?: number;
  color?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
      role="img"
      aria-label={title ?? `${icon} cluster`}
      focusable="false"
    >
      {ICONS[icon]}
    </svg>
  );
}

const ICONS: Record<IconKey, JSX.Element> = {
  lion: (
    <>
      <path d="M24 5c3 0 4 2 4 2s2-1 4 0 1 4 1 4 3 1 3 4-2 4-2 4 2 1 1 4-3 2-3 2 0 3-3 4-4-1-4-1-1 2-4 2-3-2-3-2-3 2-5 0-1-4-1-4-3 0-3-3 2-3 2-3-2-1-1-4 3-2 3-2-1-3 2-4 3 1 3 1 1-3 4-3z" />
      <circle cx="24" cy="25" r="9" fill="currentColor" fillOpacity={0.08} />
      <circle cx="20.5" cy="23" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="27.5" cy="23" r="1.4" fill="currentColor" stroke="none" />
      <path d="M24 27v2.5" />
      <path d="M24 29.5c-1.5 0-2.5-.8-3-1.6M24 29.5c1.5 0 2.5-.8 3-1.6" />
      <path d="M22.6 26.4h2.8l-1.4 1.4z" fill="currentColor" stroke="none" />
    </>
  ),
  tiger: (
    <>
      <path d="M15 13c-2-3-2-6-2-6s3 1 5 4" />
      <path d="M33 13c2-3 2-6 2-6s-3 1-5 4" />
      <path d="M14 20c0-6 4.5-10 10-10s10 4 10 10c0 5-2 9-4.5 11.5S26 36 24 36s-3-2-5.5-4.5S14 25 14 20z" fill="currentColor" fillOpacity={0.08} />
      <path d="M24 12v5M20 13.5l-1 4M28 13.5l1 4" />
      <circle cx="20.5" cy="22" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="27.5" cy="22" r="1.4" fill="currentColor" stroke="none" />
      <path d="M22.6 26h2.8l-1.4 1.6z" fill="currentColor" stroke="none" />
      <path d="M24 27.6V30M24 30c-1.6 0-2.6-.8-3.2-1.6M24 30c1.6 0 2.6-.8 3.2-1.6" />
    </>
  ),
  bee: (
    <>
      <ellipse cx="17" cy="17" rx="5" ry="7" transform="rotate(-25 17 17)" fill="currentColor" fillOpacity={0.08} />
      <ellipse cx="31" cy="17" rx="5" ry="7" transform="rotate(25 31 17)" fill="currentColor" fillOpacity={0.08} />
      <path d="M21 10c-1-3-3-4-4-4M27 10c1-3 3-4 4-4" />
      <ellipse cx="24" cy="27" rx="8" ry="11" fill="currentColor" fillOpacity={0.12} />
      <path d="M16.5 23.5h15M16 29h16M18 34.5h12" />
      <circle cx="21.5" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="26.5" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  dragon: (
    <>
      <path d="M28 12c2-2 3-5 3-5s-3 1-5 3" />
      <path d="M30 14c-4-2-9-1-12 2s-3 8-1 11c1 1.5 1 3 0 4.5" fill="currentColor" fillOpacity={0.08} />
      <path d="M17 29c-3 0-5-1.5-6-4 3 .5 4-.5 4-.5" />
      <path d="M17 19c-3 0-5 1-6 3" />
      <circle cx="14.5" cy="22.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="24" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <path d="M31 20l3-1M32 24l3 0M31 28l3 1" />
      <path d="M9 25c-2 1-3 3-2 5 .5-1 1.5-1.5 1.5-1.5" />
    </>
  ),
};
