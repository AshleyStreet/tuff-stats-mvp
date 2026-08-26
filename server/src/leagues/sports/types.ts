export type SportIcon = "football" | "softball" | "soccer";

export type StatColumn = {
  key: string;
  label: string;
  short: string;
  group?: string;
};

export type StatDetailGroup = {
  id: string;
  title: string;
  icon?: "zap" | "shield" | "trophy";
  columns: StatColumn[];
};

/**
 * How the white-label UI lays out stats. Adapters still produce domain Stats;
 * this only names and groups columns for presentation.
 */
export type StatPresentation = {
  sortOptions: StatColumn[];
  playerCardMini: StatColumn[];
  playerCardFooter: StatColumn[];
  heroKpis: StatColumn[];
  careerKpis: StatColumn[];
  seasonTableColumns: StatColumn[];
  detailGroups: StatDetailGroup[];
  gameLogColumns: StatColumn[];
  boxScoreColumns: StatColumn[];
  cardDefaults: StatColumn[];
  cardOptions: StatColumn[];
};
