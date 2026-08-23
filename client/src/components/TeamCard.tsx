import { ChevronRight, Users } from "lucide-react";
import { formatRecord, type TeamSummary } from "../lib/teams";

interface Props {
  team: TeamSummary;
  selected?: boolean;
  onSelect: (teamName: string) => void;
}

export function TeamCard({ team, selected, onSelect }: Props) {
  const mark = team.name.slice(0, 2).toUpperCase();
  const record = formatRecord(team.standing);

  return (
    <button
      className={`player-card team-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(team.name)}
    >
      <div className="player-card-top">
        <div className="avatar team-avatar">{mark}</div>
        <div className="player-heading">
          <strong>{team.name}</strong>
          <span>
            {record ? `${record} · ` : ""}
            <Users size={11} className="inline-icon" /> {team.playerCount} players
            {team.topScorer ? ` · lead ${team.topScorer.name}` : ""}
          </span>
        </div>
        <ChevronRight size={20} />
      </div>

      <div className="mini-grid">
        <div className="mini-stat"><span>W</span><strong>{team.standing?.wins ?? "—"}</strong></div>
        <div className="mini-stat"><span>L</span><strong>{team.standing?.losses ?? "—"}</strong></div>
        <div className="mini-stat"><span>T</span><strong>{team.standing?.ties ?? "—"}</strong></div>
        <div className="mini-stat"><span>PF</span><strong>{team.standing?.pointsFor ?? team.derived.totalPoints}</strong></div>
      </div>

      <div className="card-footer">
        <span>{team.standing?.streak ? `Streak ${team.standing.streak}` : `${team.derived.totalTouchdowns} player TD`}</span>
        <span>{team.standing ? `SP ${team.standing.standingsPoints}` : `${team.stats.rec} REC`}</span>
      </div>
    </button>
  );
}
