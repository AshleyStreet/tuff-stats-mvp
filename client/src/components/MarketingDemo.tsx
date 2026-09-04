import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { LeaguePreviewProvider } from "../league/LeagueProvider";
import { flagFootballPresentation } from "../league/flagFootball";
import { readStat } from "../league/readStat";
import { demoPlayers, demoPublicLeague, demoStandings, demoTeams } from "../lib/demoLeague";
import { filterAndSortPlayers } from "../lib/query";
import { trackEvent } from "../lib/analytics";
import type { Player } from "../types";
import { PlayerCard } from "./PlayerCard";
import { KpiRow } from "./StatGrid";
import { TeamLogo } from "./TeamLogo";

const presentation = flagFootballPresentation;
const SORTS = presentation.sortOptions;

/** Fired once per interaction type, so the demo reports engagement without spamming analytics. */
function useOnceTracker() {
  const [seen] = useState(() => new Set<string>());
  return (action: string) => {
    if (seen.has(action)) return;
    seen.add(action);
    trackEvent("marketing_demo", { action });
  };
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

/**
 * Standalone detail panel rather than the app's PlayerDetail, which fetches
 * career profiles and game logs from /api — calls that would resolve to the
 * default tenant on the marketing host. This renders the same presentation
 * groups against the baked roster, with no network at all.
 */
function DemoDetail({ player, onClose }: { player: Player; onClose: () => void }) {
  return (
    <aside className="aw-demo-detail" aria-label={`${player.name} stats`}>
      <div className="aw-demo-detail-head">
        <TeamLogo name={player.team || player.name} fallback={initials(player.name)} />
        <div>
          <strong>{player.name}</strong>
          <span>
            {player.team} · {readStat(player, "gms")} games
          </span>
        </div>
        <button type="button" className="aw-demo-close" onClick={onClose} aria-label="Close player stats">
          <X size={18} />
        </button>
      </div>

      <KpiRow columns={presentation.heroKpis} source={player} />

      {presentation.detailGroups.map((group) => (
        <section key={group.id} className="aw-demo-group">
          <h4>{group.title}</h4>
          <div className="aw-demo-rows">
            {group.columns.map((column) => (
              <div key={column.key} className="aw-demo-row">
                <span>{column.label}</span>
                <strong>{readStat(player, column.key)}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}

export function MarketingDemo() {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [sort, setSort] = useState(SORTS[0]?.key ?? "totalPoints");
  const [selected, setSelected] = useState<Player | null>(null);
  const track = useOnceTracker();

  const players = useMemo(
    () => filterAndSortPlayers(demoPlayers, { search, team, sort }),
    [search, team, sort]
  );

  const activeSort = SORTS.find((option) => option.key === sort) ?? SORTS[0];
  const leaders = players.slice(0, 3);

  return (
    <LeaguePreviewProvider league={demoPublicLeague}>
      <div className="aw-demo" style={{ ["--red" as string]: demoPublicLeague.branding.primaryColor, ["--gold" as string]: demoPublicLeague.branding.secondaryColor }}>
        <div className="aw-demo-bar">
          <span className="aw-demo-brand">
            <span className="aw-demo-dot" aria-hidden="true" />
            Harbor Flag Football
          </span>
          <span className="aw-demo-season">2026 Season</span>
        </div>

        <div className="aw-demo-controls">
          <label className="aw-demo-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Search players"
              aria-label="Search demo players"
              onChange={(event) => {
                setSearch(event.target.value);
                track("search");
              }}
            />
          </label>

          <label className="aw-demo-select">
            <span>Sort</span>
            <select
              value={sort}
              aria-label="Sort demo players"
              onChange={(event) => {
                setSort(event.target.value);
                track("sort");
              }}
            >
              {SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="aw-demo-teams" role="group" aria-label="Filter by team">
          <button
            type="button"
            className={team === "" ? "active" : ""}
            onClick={() => {
              setTeam("");
              track("team_filter");
            }}
          >
            All teams
          </button>
          {demoTeams.map((name) => (
            <button
              key={name}
              type="button"
              className={team === name ? "active" : ""}
              onClick={() => {
                setTeam(team === name ? "" : name);
                track("team_filter");
              }}
            >
              {name}
            </button>
          ))}
        </div>

        {leaders.length > 0 && (
          <div className="aw-demo-leaders">
            <span className="aw-demo-leaders-label">{activeSort?.label} leaders</span>
            <ol>
              {leaders.map((player) => (
                <li key={player.id}>
                  <span>{player.name}</span>
                  <strong>{readStat(player, sort)}</strong>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="aw-demo-body">
          <div className="aw-demo-grid">
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                selected={selected?.id === player.id}
                onSelect={(next) => {
                  setSelected(next);
                  track("open_player");
                }}
              />
            ))}
            {players.length === 0 && (
              <p className="aw-demo-empty">No players match “{search}”.</p>
            )}
          </div>

          {selected ? (
            <DemoDetail player={selected} onClose={() => setSelected(null)} />
          ) : (
            <aside className="aw-demo-detail aw-demo-detail-empty">
              <div className="aw-demo-standings">
                <h4>Standings</h4>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Team</th>
                      <th scope="col">W</th>
                      <th scope="col">L</th>
                      <th scope="col">PF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoStandings.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{row.wins}</td>
                        <td>{row.losses}</td>
                        <td>{row.pointsFor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="aw-demo-hint">Tap any player card to open their season stats.</p>
            </aside>
          )}
        </div>
      </div>
    </LeaguePreviewProvider>
  );
}
