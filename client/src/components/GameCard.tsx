import type { ScheduleGame } from "../types";

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

export function GameCard({ game }: { game: ScheduleGame }) {
  const [home, away] = game.teams;
  if (!home || !away) return null;

  return (
    <article className={`game-card ${game.status}`}>
      <div className="game-meta">
        <span>{formatGameWhen(game.date)}</span>
        {game.venue ? <span>{game.venue}</span> : null}
        <span className="game-status">{game.status === "final" ? "Final" : game.status === "upcoming" ? "Upcoming" : "TBD"}</span>
      </div>
      <div className="game-matchup">
        <div className={`game-side${home.outcome === "win" ? " winner" : ""}`}>
          <strong>{home.name}</strong>
          <span className="game-score">{game.status === "final" ? home.score ?? "—" : ""}</span>
        </div>
        <div className={`game-side${away.outcome === "win" ? " winner" : ""}`}>
          <strong>{away.name}</strong>
          <span className="game-score">{game.status === "final" ? away.score ?? "—" : ""}</span>
        </div>
      </div>
      {game.link ? (
        <a className="game-link" href={game.link} target="_blank" rel="noreferrer">
          Details
        </a>
      ) : null}
    </article>
  );
}
