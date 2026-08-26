import { useEffect, useState, type CSSProperties } from "react";
import { ExternalLink, X } from "lucide-react";
import { getGame } from "../api";
import { useLeague, usePresentation } from "../league/LeagueProvider";
import { readStat } from "../league/readStat";
import type { StatColumn } from "../league/types";
import type { BoxScorePlayer, BoxScoreSide, GameDetail, Player, ScheduleGame } from "../types";
import { TeamLogo } from "./TeamLogo";

interface Props {
  game: ScheduleGame;
  season: string;
  players: Player[];
  onClose: () => void;
  onSelectPlayer?: (player: Player) => void;
}

function formatGameWhen(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatBoxStat(value: number) {
  if (!value) return <span className="box-zero" />;
  return value;
}

function sumSide(side: BoxScoreSide, columns: StatColumn[]) {
  const totals: Record<string, number> = {};
  for (const column of columns) totals[column.key] = 0;
  for (const player of side.players) {
    for (const column of columns) {
      totals[column.key] += readStat(player, column.key);
    }
  }
  return totals;
}

function BoxStatCells({
  columns,
  values
}: {
  columns: StatColumn[];
  values: (column: StatColumn) => number;
}) {
  return (
    <div className="box-stats">
      {columns.map((column) => (
        <span key={column.key} className="box-stat" title={column.label}>
          <span className="box-stat-label">{column.short}</span>
          {formatBoxStat(values(column))}
        </span>
      ))}
    </div>
  );
}

function BoxRow({
  player,
  columns,
  match,
  onSelect
}: {
  player: BoxScorePlayer;
  columns: StatColumn[];
  match?: Player;
  onSelect?: (player: Player) => void;
}) {
  const cells = (
    <>
      <span className="box-num">{player.number ? `#${player.number}` : "—"}</span>
      <span className="box-name">{player.name}</span>
      <BoxStatCells columns={columns} values={(column) => readStat(player, column.key)} />
    </>
  );

  if (match && onSelect) {
    return (
      <button type="button" className="box-row" onClick={() => onSelect(match)}>
        {cells}
      </button>
    );
  }

  return <div className="box-row">{cells}</div>;
}

export function GameDetail({ game, season, players, onClose, onSelectPlayer }: Props) {
  const league = useLeague();
  const columns = usePresentation().boxScoreColumns;
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    getGame(game.id, season)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
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
  }, [game.id, season]);

  const sides = detail?.sides.length ? detail.sides : game.teams.map((side) => ({ ...side, players: [] }));
  const [home, away] = sides;
  const playerBySourceId = new Map(
    players.filter((player) => player.sourceId).map((player) => [player.sourceId as string, player])
  );
  const boxTableStyle = { "--box-stat-cols": columns.length } as CSSProperties;

  return (
    <aside className="detail-panel">
      <button className="icon-button close" onClick={onClose} aria-label="Close box score">
        <X size={20} />
      </button>

      <div className="detail-hero game-detail-hero">
        <div>
          <div className="eyebrow">{game.status === "final" ? "FINAL" : game.status === "upcoming" ? "UPCOMING" : "GAME"}</div>
          <h2>{home && away ? `${home.name} vs ${away.name}` : game.title}</h2>
          <p>
            {formatGameWhen(game.date)}
            {game.venue ? ` · ${game.venue}` : ""}
          </p>
        </div>
      </div>

      {home && away && (
        <div className="hero-kpis game-scoreboard">
          {[home, away].map((side) => (
            <div key={side.id} className={side.outcome === "win" ? "winner-side" : ""}>
              <span className="scoreboard-team">
                <TeamLogo name={side.name} src={side.logoUrl} className="team-logo-md" />
                {side.name}
              </span>
              <strong className={side.outcome === "win" ? "winner-score" : ""}>
                {game.status === "final" ? side.score ?? "—" : "—"}
              </strong>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="profile-loading">Loading box score…</div>}
      {error && <div className="profile-error">{error}</div>}

      {!loading && !error && sides.every((side) => side.players.length === 0) && (
        <div className="profile-loading">No box score posted for this game yet.</div>
      )}

      {sides.map((side) => {
        if (!side.players.length) return null;
        const totals = sumSide(side, columns);
        return (
          <section key={side.id}>
            <h3>
              <TeamLogo name={side.name} src={side.logoUrl} className="team-logo-sm" /> {side.name}
            </h3>
            <div className="box-table" style={boxTableStyle}>
              {side.players.map((player) => (
                <BoxRow
                  key={player.sourceId}
                  player={player}
                  columns={columns}
                  match={playerBySourceId.get(player.sourceId)}
                  onSelect={onSelectPlayer}
                />
              ))}
              <div className="box-row box-total">
                <span className="box-num" />
                <span className="box-name">Team</span>
                <BoxStatCells columns={columns} values={(column) => totals[column.key] ?? 0} />
              </div>
            </div>
          </section>
        );
      })}

      {(detail?.game.link || game.link) && (
        <a className="source-link" href={detail?.game.link ?? game.link} target="_blank" rel="noreferrer">
          {league.copy.recapLinkLabel} <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}
