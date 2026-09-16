import Image from "next/image";
import type { IconKey } from "@/lib/cohorts";

/**
 * Official Team Wharton cluster crests (§12.6). Circular badge images live in
 * /public/clusters/<icon_key>.png. To change the artwork, replace those files —
 * no schema or layout change. `color` is accepted for call-site compatibility
 * but ignored (each crest carries its own colors).
 */
const SRC: Record<IconKey, string> = {
  lion: "/clusters/lion.png",
  dragon: "/clusters/dragon.png",
  bee: "/clusters/bee.png",
  tiger: "/clusters/tiger.png",
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
    <Image
      src={SRC[icon]}
      width={size}
      height={size}
      alt={title ?? `${icon} cluster`}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
