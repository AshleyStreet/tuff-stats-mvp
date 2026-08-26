export type StatSource = {
  stats: Record<string, number | undefined>;
  derived?: {
    totalPoints?: number;
    totalTouchdowns?: number;
    receptionsPerGame?: number;
    receivingTouchdownsPerGame?: number;
  };
};

/** Resolve a presentation-schema key against stats or first-class derived fields. */
export function readStat(source: StatSource, key: string): number {
  switch (key) {
    case "totalPoints":
      return source.derived?.totalPoints ?? 0;
    case "totalTouchdowns":
      return source.derived?.totalTouchdowns ?? 0;
    case "recPerGame":
      return source.derived?.receptionsPerGame ?? 0;
    case "recTdPerGame":
      return source.derived?.receivingTouchdownsPerGame ?? 0;
    case "goalsPerGame": {
      const goals = Number(source.stats?.goals ?? 0) || 0;
      const games = Math.max(Number(source.stats?.gms ?? 0) || 0, 1);
      return Number((goals / games).toFixed(2));
    }
    default:
      return Number(source.stats?.[key] ?? 0) || 0;
  }
}
