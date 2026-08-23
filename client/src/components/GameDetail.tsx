import { useEffect, useState } from "react";
import { ExternalLink, Trophy, X } from "lucide-react";
import { getGame } from "../api";
import type { BoxScorePlayer, BoxScoreSide, GameDetail, Player, ScheduleGame } from "../types";

interface Props {
  game: ScheduleGame;
  season: string;
  players: Player[];
  onClose: () => void;
  onSelectPlayer?: (player: Player) => void;
}

const columns = [
  { key: "rec", label: "Rec" },
  { key: "recTD", label: "RecTD" },
  { key: "paTD", label: "PaTD" },
  { key: "int", label: "INT" },
  { key: "sack", label: "Sack" }
] as const;

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

function sumSide(side: BoxScoreSide) {
  return {
    rec: side.players.reduce((sum, player) => sum + player.stats.rec, 0),
    recTD: side.players.reduce((sum, player) => sum + player.stats.recTD, 0),
    paTD: side.players.reduce((sum, player) => sum + player.stats.paTD, 0),
    int: side.players.reduce((sum, player) => sum + player.stats.int, 0),
    sack: side.players.reduce((sum, player) => sum + player.stats.sack, 0)
  };
}

function BoxRow({
  player,
  match,
  onSelect
}: {
  player: BoxScorePlayer;
  match?: Player;
  onSelect?: (player: Player) => void;
}) {
  const cells = (
    <>
      <span className="box-num">{player.number ? `#${player.number}` : "—"}</span>
      <span className="box-name">{player.name}</span>
      {columns.map((column) => (
        <span key={column.key}>{player.stats[column.key]}</span>
      ))}
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
          <div>
            <span>{home.name}</span>
            <strong className={home.outcome === "win" ? "winner-score" : ""}>
              {game.status === "final" ? home.score ?? "—" : "—"}
            </strong>
          </div>
          <div>
            <span>{away.name}</span>
            <strong className={away.outcome === "win" ? "winner-score" : ""}>
              {game.status === "final" ? away.score ?? "—" : "—"}
            </strong>
          </div>
        </div>
      )}

      {loading && <div className="profile-loading">Loading box score…</div>}
      {error && <div className="profile-error">{error}</div>}

      {!loading && !error && sides.every((side) => side.players.length === 0) && (
        <div className="profile-loading">No box score posted for this game yet.</div>
      )}

      {sides.map((side) => {
        if (!side.players.length) return null;
        const totals = sumSide(side);
        return (
          <section key={side.id}>
            <h3>
              <Trophy size={17} /> {side.name}
            </h3>
            <div className="box-table">
              <div className="box-row box-head">
                <span className="box-num">#</span>
                <span className="box-name">Player</span>
                {columns.map((column) => (
                  <span key={column.key}>{column.label}</span>
                ))}
              </div>
              {side.players.map((player) => (
                <BoxRow
                  key={player.sourceId}
                  player={player}
                  match={playerBySourceId.get(player.sourceId)}
                  onSelect={onSelectPlayer}
                />
              ))}
              <div className="box-row box-total">
                <span className="box-num" />
                <span className="box-name">Team</span>
                <span>{totals.rec}</span>
                <span>{totals.recTD}</span>
                <span>{totals.paTD}</span>
                <span>{totals.int}</span>
                <span>{totals.sack}</span>
              </div>
            </div>
          </section>
        );
      })}

      {(detail?.game.link || game.link) && (
        <a className="source-link" href={detail?.game.link ?? game.link} target="_blank" rel="noreferrer">
          Open original TUFF recap <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}
