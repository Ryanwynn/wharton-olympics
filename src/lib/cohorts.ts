/**
 * The four cohorts (§4). icon_key drives the mascot artwork (§12.6) so the real
 * Wharton seals can drop in later behind the same key with no schema change.
 * Cohort colors are deliberately distinct from Penn Blue/Red brand primaries.
 */
import type { IconKey } from "./types";
export type { IconKey };

export interface CohortSeed {
  name: string;
  iconKey: IconKey;
  colorHex: string;
  sortOrder: number;
}

export const COHORTS: CohortSeed[] = [
  { name: "Lions", iconKey: "lion", colorHex: "#E67E22", sortOrder: 1 },
  { name: "Dragons", iconKey: "dragon", colorHex: "#1B7F5E", sortOrder: 2 },
  { name: "Bees", iconKey: "bee", colorHex: "#D99400", sortOrder: 3 },
  { name: "Tigers", iconKey: "tiger", colorHex: "#C2410C", sortOrder: 4 },
];
