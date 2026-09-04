import type { League } from "./types.js";

/**
 * Single source of truth for gate-able features. Add a key here, add its
 * label in FEATURE_LABELS, and it's immediately toggleable per tenant from
 * the admin dashboard — mirrored (by hand, same as the rest of the League
 * shape) in client/src/league/features.ts for the checkbox list and any
 * client-side gating.
 */
export const FEATURE_KEYS = ["comparison"] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  comparison: "Player comparison"
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

export function hasFeature(league: Pick<League, "features">, key: FeatureKey): boolean {
  return Boolean(league.features?.includes(key));
}
