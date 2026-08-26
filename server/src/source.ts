/**
 * @deprecated Import from `./adapters/tuff/source.js` or use `getAdapter()`.
 * Kept so any leftover imports keep compiling during the adapter split.
 */
export {
  getGame,
  getPlayerGameLog,
  getPlayerProfile,
  getPlayers,
  getSchedule,
  getSeasons,
  getServiceStatus,
  getStandings,
  refreshSeasonData,
  warmSeasonCaches
} from "./adapters/tuff/source.js";
export type { PlayerProfile, ScheduleResponse } from "./domain/types.js";
