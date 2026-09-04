/**
 * Mirrors server/src/leagues/features.ts. Add a key here (and there) to make
 * it toggleable per tenant in the admin dashboard and gate-able in the app —
 * e.g. `{hasFeature(league, "comparison") && <ComparisonTab />}`.
 */
export const FEATURE_KEYS = ["comparison"] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  comparison: "Player comparison"
};

export function hasFeature(league: { features: string[] }, key: FeatureKey): boolean {
  return league.features.includes(key);
}
