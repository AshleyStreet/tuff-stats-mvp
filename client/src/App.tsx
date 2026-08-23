import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Trophy } from "lucide-react";
import { formatUpdatedAt, getPlayers, getSchedule, getSeasons, peekSeasonPlayers } from "./api";
import { GameCard } from "./components/GameCard";
import { GameDetail } from "./components/GameDetail";
import { PlayerCard } from "./components/PlayerCard";
import { PlayerDetail } from "./components/PlayerDetail";
import { TeamCard } from "./components/TeamCard";
import { TeamLogo } from "./components/TeamLogo";
import { filterAndSortPlayers } from "./lib/query";
import { filterScheduleGames, partitionSchedule } from "./lib/schedule";
import { buildTeamSummaries, withCanonicalTeams } from "./lib/teams";
import type { Player, PlayersResponse, ScheduleGame, ScheduleResponse, SeasonInfo, StatKey } from "./types";

type Tab = "players" | "teams" | "schedule";
type ScheduleView = "all" | "results" | "upcoming";

const sorts: { key: StatKey | "totalPoints"; label: string }[] = [
  { key: "totalPoints", label: "Total Points" },
  { key: "recTD", label: "Receiving TDs" },
  { key: "rec", label: "Receptions" },
  { key: "int", label: "Interceptions" },
  { key: "sack", label: "Sacks" },
  { key: "paTD", label: "Passing TDs" },
  { key: "gms", label: "Games Played" }
];

export default function App() {
  const [data, setData] = useState<PlayersResponse | null>(null);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [season, setSeason] = useState("2026");
  const [tab, setTab] = useState<Tab>("players");
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [sort, setSort] = useState<StatKey | "totalPoints">("totalPoints");
  const [selected, setSelected] = useState<Player | null>(null);
  const [selectedGame, setSelectedGame] = useState<ScheduleGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [scheduleView, setScheduleView] = useState<ScheduleView>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    getSeasons()
      .then((result) => {
        setSeasons(result.seasons);
        setSeason((current) =>
          result.seasons.some((item) => item.year === current) ? current : result.defaultSeason
        );
      })
      .catch(() => {
        setSeasons([{ year: "2026", label: "2026 Season", slug: "2026-tuff-stats" }]);
      });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = peekSeasonPlayers(season);
    if (cached?.meta.standings?.length) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    getPlayers(season)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setSelected((current) => {
          if (!current) return null;
          return (
            result.players.find((player) =>
              player.sourceId && current.sourceId
                ? player.sourceId === current.sourceId
                : player.id === current.id
            ) ?? current
          );
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [season]);

  useEffect(() => {
    if (tab !== "schedule") return;
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    getSchedule(season)
      .then((result) => {
        if (cancelled) return;
        setSchedule(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setScheduleError(err.message);
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [season, tab]);

  useEffect(() => {
    if (tab !== "schedule") setSelectedGame(null);
  }, [tab]);

  const rosterPlayers = useMemo(
    () => withCanonicalTeams(data?.players ?? [], data?.meta.standings ?? []),
    [data?.players, data?.meta.standings]
  );

  const teamSummaries = useMemo(
    () => buildTeamSummaries(rosterPlayers, data?.meta.standings ?? [], data?.meta.teamLogos ?? {}),
    [rosterPlayers, data?.meta.standings, data?.meta.teamLogos]
  );

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || tab !== "teams" || activeTeam) return teamSummaries;
    return teamSummaries.filter((item) => item.name.toLowerCase().includes(q));
  }, [teamSummaries, search, tab, activeTeam]);

  const rosterTeam = tab === "teams" ? activeTeam ?? "" : team;

  const players = useMemo(
    () =>
      filterAndSortPlayers(rosterPlayers, {
        search: tab === "players" || activeTeam ? search : "",
        team: rosterTeam,
        sort
      }),
    [rosterPlayers, search, rosterTeam, sort, tab, activeTeam]
  );

  const leaders = useMemo(() => players.slice(0, 5), [players]);
  const teams = useMemo(
    () => [...new Set(teamSummaries.map((item) => item.name))].sort((a, b) => a.localeCompare(b)),
    [teamSummaries]
  );
  const sortLabel = sorts.find((item) => item.key === sort)?.label ?? "Leaders";
  const seasonLabel = data?.meta.seasonLabel ?? `${season} Season`;
  const statValue = (player: Player) => (sort === "totalPoints" ? player.derived.totalPoints : player.stats[sort]);
  const updatedLabel = formatUpdatedAt(data?.meta.fetchedAt, now);
  const sourceLabel = data?.meta.source === "sportspress" ? "SportsPress" : "TUFF table";
  const activeTeamSummary = activeTeam ? teamSummaries.find((item) => item.name === activeTeam) : null;

  const filteredGames = useMemo(() => {
    const games = filterScheduleGames(schedule?.games ?? [], team, search);
    const parts = partitionSchedule(games);
    if (scheduleView === "results") return parts.finals;
    if (scheduleView === "upcoming") return parts.upcoming;
    return [...parts.upcoming, ...parts.finals, ...parts.other];
  }, [schedule?.games, team, search, scheduleView]);

  const scheduleParts = useMemo(
    () => partitionSchedule(filterScheduleGames(schedule?.games ?? [], team, search)),
    [schedule?.games, team, search]
  );

  function openGame(game: ScheduleGame) {
    setSelected(null);
    setSelectedGame(game);
  }

  function openGameFromProfile(game: ScheduleGame) {
    setSelectedGame(game);
  }

  function openPlayer(player: Player) {
    setSelectedGame(null);
    setSelected(player);
  }

  function goPlayers() {
    setTab("players");
    setActiveTeam(null);
  }

  function goTeams() {
    setTab("teams");
    setTeam("");
    setActiveTeam(null);
    setSearch("");
  }

  function goSchedule() {
    setTab("schedule");
    setActiveTeam(null);
    setSearch("");
    setSelected(null);
  }

  function openTeam(name: string) {
    setTab("teams");
    setActiveTeam(name);
    setSearch("");
    setSelected(null);
    setSelectedGame(null);
  }

  return (
    <div className={`app-shell${selected || selectedGame ? " detail-open" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-logo"
            src="https://www.playtuff.ca/wp-content/uploads/2022/03/TUFF_logo_v2.png"
            alt="Toronto United Flag Football"
          />
          <div>
            <strong>TUFF</strong>
            <span>TORONTO UNITED FLAG FOOTBALL</span>
          </div>
        </div>
        <nav>
          <button type="button" className={tab === "players" && !activeTeam ? "active" : ""} onClick={goPlayers}>
            Players
          </button>
          <button type="button" className={tab === "teams" ? "active" : ""} onClick={goTeams}>
            Teams
          </button>
          <button type="button" className={tab === "schedule" ? "active" : ""} onClick={goSchedule}>
            Schedule
          </button>
        </nav>
        <label className="season-pill">
          <span className="season-pill-label">Season</span>
          <select
            value={season}
            onChange={(event) => {
              setSeason(event.target.value);
              setTeam("");
              setActiveTeam(null);
              setSelected(null);
              setSelectedGame(null);
            }}
            aria-label="Select season"
          >
            {(seasons.length ? seasons : [{ year: season, label: `${season} Season`, slug: "" }]).map((item) => (
              <option key={item.year} value={item.year}>{item.year}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="mobile-tabs" role="tablist" aria-label="Views">
        <button type="button" className={tab === "players" ? "active" : ""} onClick={goPlayers}>Players</button>
        <button type="button" className={tab === "teams" ? "active" : ""} onClick={goTeams}>Teams</button>
        <button type="button" className={tab === "schedule" ? "active" : ""} onClick={goSchedule}>Schedule</button>
      </div>

      <div className="page-grid">
        <aside className="sidebar">
          {tab === "players" && (
            <>
              <div className="eyebrow">FIND A PLAYER</div>
              <label className="search-box">
                <Search size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players…" />
              </label>

              <label className="field-label">TEAM</label>
              <select value={team} onChange={(event) => setTeam(event.target.value)}>
                <option value="">All teams</option>
                {teams.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>

              <label className="field-label">SORT BY</label>
              <select value={sort} onChange={(event) => setSort(event.target.value as StatKey | "totalPoints")}>
                {sorts.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>

              <div className="leaders-block">
                <h3><Trophy size={16} /> Quick leaders</h3>
                <span className="leader-category">{sortLabel}{team ? ` · ${team}` : ""}</span>
                {leaders.map((player, index) => (
                  <button className="leader-row" key={player.id} onClick={() => openPlayer(player)}>
                    <span className="leader-rank">{index + 1}</span>
                    <span className="leader-name">{player.name}</span>
                    <strong>{statValue(player)}</strong>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "teams" && !activeTeam && (
            <>
              <div className="eyebrow">FIND A TEAM</div>
              <label className="search-box">
                <Search size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teams…" />
              </label>
              <div className="leaders-block">
                <h3><Trophy size={16} /> Team standings</h3>
                <span className="leader-category">By wins</span>
                {filteredTeams.slice(0, 8).map((item, index) => (
                  <button className="leader-row" key={item.name} onClick={() => openTeam(item.name)}>
                    <span className="leader-rank">{index + 1}</span>
                    <span className="leader-name">
                      <TeamLogo name={item.name} src={item.logoUrl} className="team-logo-xs" />
                      {item.name}
                    </span>
                    <strong>
                      {item.standing
                        ? `${item.standing.wins}-${item.standing.losses}${item.standing.ties ? `-${item.standing.ties}` : ""}`
                        : item.derived.totalPoints}
                    </strong>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "teams" && activeTeam && (
            <>
              <div className="eyebrow">ROSTER FILTERS</div>
              <label className="search-box">
                <Search size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roster…" />
              </label>
              <label className="field-label">SORT BY</label>
              <select value={sort} onChange={(event) => setSort(event.target.value as StatKey | "totalPoints")}>
                {sorts.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <div className="leaders-block">
                <h3><Trophy size={16} /> Team leaders</h3>
                <span className="leader-category">{activeTeam}</span>
                {leaders.map((player, index) => (
                  <button className="leader-row" key={player.id} onClick={() => openPlayer(player)}>
                    <span className="leader-rank">{index + 1}</span>
                    <span className="leader-name">{player.name}</span>
                    <strong>{statValue(player)}</strong>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "schedule" && (
            <>
              <div className="eyebrow">FIND A GAME</div>
              <label className="search-box">
                <Search size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search matchups…" />
              </label>
              <label className="field-label">TEAM</label>
              <select value={team} onChange={(event) => setTeam(event.target.value)}>
                <option value="">All teams</option>
                {teams.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <label className="field-label">SHOW</label>
              <select value={scheduleView} onChange={(event) => setScheduleView(event.target.value as ScheduleView)}>
                <option value="all">Upcoming + results</option>
                <option value="upcoming">Upcoming only</option>
                <option value="results">Results only</option>
              </select>
              <div className="leaders-block">
                <h3><Trophy size={16} /> Snapshot</h3>
                <span className="leader-category">{seasonLabel}</span>
                <div className="schedule-snapshot">
                  <div><span>Upcoming</span><strong>{scheduleParts.upcoming.length}</strong></div>
                  <div><span>Finals</span><strong>{scheduleParts.finals.length}</strong></div>
                </div>
              </div>
            </>
          )}
        </aside>

        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{seasonLabel.toUpperCase()}</div>
              {tab === "players" && (
                <>
                  <h1>League board</h1>
                  <p>
                    {players.length} players · {team || (search ? `“${search}”` : "all teams")} · sorted by{" "}
                    {sortLabel.toLowerCase()}
                  </p>
                </>
              )}
              {tab === "teams" && !activeTeam && (
                <>
                  <h1>Teams</h1>
                  <p>
                    {filteredTeams.length} teams · {seasonLabel} · ranked by wins
                  </p>
                </>
              )}
              {tab === "teams" && activeTeam && (
                <>
                  <button type="button" className="back-link" onClick={() => setActiveTeam(null)}>
                    <ArrowLeft size={15} /> All teams
                  </button>
                  <h1 className="team-page-title">
                    <TeamLogo name={activeTeam} src={activeTeamSummary?.logoUrl} />
                    {activeTeam}
                  </h1>
                  <p>
                    {players.length} players
                    {activeTeamSummary?.standing
                      ? ` · ${activeTeamSummary.standing.wins}-${activeTeamSummary.standing.losses}${activeTeamSummary.standing.ties ? `-${activeTeamSummary.standing.ties}` : ""}`
                      : ""}
                    {activeTeamSummary
                      ? ` · ${activeTeamSummary.derived.totalPoints} player pts · ${activeTeamSummary.derived.totalTouchdowns} TD`
                      : ""}
                    {" · "}sorted by {sortLabel.toLowerCase()}
                  </p>
                </>
              )}
              {tab === "schedule" && (
                <>
                  <h1>Schedule</h1>
                  <p>
                    {filteredGames.length} games
                    {team ? ` · ${team}` : ""}
                    {scheduleView === "results" ? " · results" : scheduleView === "upcoming" ? " · upcoming" : " · upcoming + results"}
                  </p>
                </>
              )}
            </div>
            {(data || schedule) && (
              <span className="source-badge">
                {tab === "schedule"
                  ? `${formatUpdatedAt(schedule?.meta.fetchedAt, now) ? `Updated ${formatUpdatedAt(schedule?.meta.fetchedAt, now)}` : "Live"} · SportsPress`
                  : `${updatedLabel ? `Updated ${updatedLabel}` : "Live"} · ${sourceLabel}`}
              </span>
            )}
          </div>

          {error && tab !== "schedule" && <div className="error-card"><strong>Couldn’t load TUFF.</strong><span>{error}</span></div>}
          {scheduleError && tab === "schedule" && (
            <div className="error-card"><strong>Couldn’t load schedule.</strong><span>{scheduleError}</span></div>
          )}

          {((loading && tab !== "schedule") || (scheduleLoading && tab === "schedule")) && (
            <div className="loading" role="status" aria-live="polite">
              <div className="football-spinner" aria-hidden="true">
                <div className="football">
                  <span className="football-stripe football-stripe-left" />
                  <span className="football-stripe football-stripe-right" />
                  <span className="football-laces" />
                </div>
              </div>
              <span>{tab === "schedule" ? `Loading ${season} schedule…` : data ? `Loading ${season}…` : "Loading league stats…"}</span>
            </div>
          )}

          {!loading && tab === "teams" && !activeTeam && (
            <div className="player-grid">
              {filteredTeams.map((item) => (
                <TeamCard key={item.name} team={item} onSelect={openTeam} />
              ))}
            </div>
          )}

          {!loading && tab === "teams" && !activeTeam && filteredTeams.length === 0 && (
            <div className="empty">
              No teams match{search ? ` “${search}”` : ""} in {season}.
            </div>
          )}

          {!loading && (tab === "players" || activeTeam) && (
            <div className="player-grid">
              {players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={selected?.id === player.id}
                  onSelect={openPlayer}
                  teamLogos={data?.meta.teamLogos}
                />
              ))}
            </div>
          )}

          {!loading && (tab === "players" || activeTeam) && players.length === 0 && (
            <div className="empty">
              No players match{search ? ` “${search}”` : ""}
              {rosterTeam ? `${search ? " on" : ""} ${rosterTeam}` : ""} in {season}.
            </div>
          )}

          {!scheduleLoading && tab === "schedule" && (
            <div className="schedule-list">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  selected={selectedGame?.id === game.id}
                  onSelect={openGame}
                />
              ))}
            </div>
          )}

          {!scheduleLoading && tab === "schedule" && filteredGames.length === 0 && (
            <div className="empty">
              No games match{search ? ` “${search}”` : ""}{team ? `${search ? " for" : ""} ${team}` : ""} in {season}.
            </div>
          )}
        </main>

        {selectedGame && (
          <GameDetail
            game={selectedGame}
            season={season}
            players={rosterPlayers}
            onClose={() => setSelectedGame(null)}
            onSelectPlayer={openPlayer}
          />
        )}

        {selected && !selectedGame && (
          <PlayerDetail
            player={selected}
            activeSeason={season}
            teamLogos={data?.meta.teamLogos}
            onClose={() => setSelected(null)}
            onSelectSeason={(year) => {
              setSeason(year);
              setTeam("");
              setActiveTeam(null);
              setSelectedGame(null);
            }}
            onSelectGame={openGameFromProfile}
          />
        )}
      </div>
    </div>
  );
}
