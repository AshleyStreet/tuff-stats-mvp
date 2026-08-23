import { useEffect, useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { getPlayers } from "./api";
import { PlayerCard } from "./components/PlayerCard";
import { PlayerDetail } from "./components/PlayerDetail";
import type { Player, PlayersResponse, StatKey } from "./types";

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
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [sort, setSort] = useState<StatKey | "totalPoints">("totalPoints");
  const [selected, setSelected] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true);
      getPlayers(search, sort, team)
        .then((result) => {
          setData(result);
          setError(null);
          if (selected) {
            setSelected(result.players.find((p) => p.id === selected.id) ?? null);
          }
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [search, sort, team]);

  const leaders = useMemo(() => data?.players.slice(0, 5) ?? [], [data]);
  const teams = data?.meta.teams ?? [];
  const sortLabel = sorts.find((item) => item.key === sort)?.label ?? "Leaders";
  const statValue = (player: Player) => sort === "totalPoints" ? player.derived.totalPoints : player.stats[sort];
  const filterLabel = team || (search ? `“${search}”` : "all teams");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div><strong>TUFF</strong><span>TORONTO FLAG FOOTBALL</span></div>
        </div>
        <nav><a className="active">Players</a></nav>
        <div className="season-pill">2026 SEASON</div>
      </header>

      <div className="page-grid">
        <aside className="sidebar">
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
              <button className="leader-row" key={player.id} onClick={() => setSelected(player)}>
                <span className="leader-rank">{index + 1}</span>
                <span className="leader-name">{player.name}</span>
                <strong>{statValue(player)}</strong>
              </button>
            ))}
          </div>
        </aside>

        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">2026 REGULAR SEASON</div>
              <h1>Player stats</h1>
              <p>{data?.meta.total ?? 0} players · {filterLabel} · sorted by {sortLabel.toLowerCase()}</p>
            </div>
            {data && <span className="source-badge">Live · {data.meta.source === "sportspress" ? "SportsPress API" : "TUFF table"}</span>}
          </div>

          {error && <div className="error-card"><strong>Couldn’t load TUFF.</strong><span>{error}</span></div>}

          {loading && (
            <div className="loading" role="status" aria-live="polite">
              <div className="football-spinner" aria-hidden="true">
                <div className="football">
                  <span className="football-stripe football-stripe-left" />
                  <span className="football-stripe football-stripe-right" />
                  <span className="football-laces" />
                </div>
              </div>
              <span>{data ? "Updating players…" : "Loading league stats…"}</span>
            </div>
          )}

          {!loading && (
            <div className="player-grid">
              {data?.players.map((player) => (
                <PlayerCard key={player.id} player={player} selected={selected?.id === player.id} onSelect={setSelected} />
              ))}
            </div>
          )}

          {!loading && data?.players.length === 0 && (
            <div className="empty">
              No players match{search ? ` “${search}”` : ""}{team ? `${search ? " on" : ""} ${team}` : ""}.
            </div>
          )}
        </main>

        {selected && <PlayerDetail player={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
