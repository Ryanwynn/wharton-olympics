import type { IconKey } from "@/lib/cohorts";

/**
 * Cluster mascots (§12.6). Placeholder emoji until the official cluster images
 * are supplied — swap the artwork here behind the same `icon_key`; no schema or
 * layout change. (Previously simple line-art; before that, no official seals are
 * used since those are Wharton/student IP.)
 *
 * `color` is accepted for API compatibility with call sites but is ignored:
 * emoji carry their own colors.
 */
const EMOJI: Record<IconKey, string> = {
  lion: "🦁",
  dragon: "🐉",
  bee: "🐝",
  tiger: "🐯",
};

export function MascotIcon({
  icon,
  size = 28,
  title,
}: {
  icon: IconKey;
  size?: number;
  color?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title ?? `${icon} cluster`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        fontSize: Math.round(size * 0.82),
        lineHeight: 1,
      }}
    >
      {EMOJI[icon]}
    </span>
  );
}
