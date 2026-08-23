import { ChevronRight } from "lucide-react";
import { teamLogoUrl } from "../lib/teams";
import type { Player } from "../types";
import { TeamLogo } from "./TeamLogo";

interface Props {
  player: Player;
  selected: boolean;
  onSelect: (player: Player) => void;
  teamLogos?: Record<string, string>;
}

const miniStats = [
  ["REC", "rec"],
  ["REC TD", "recTD"],
  ["INT", "int"],
  ["SACK", "sack"]
] as const;

export function PlayerCard({ player, selected, onSelect, teamLogos }: Props) {
  const initials = player.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <button className={`player-card ${selected ? "selected" : ""}`} onClick={() => onSelect(player)}>
      <div className="player-card-top">
        <TeamLogo
          name={player.team || player.name}
          src={teamLogoUrl(player.team, teamLogos)}
          fallback={initials}
        />
        <div className="player-heading">
          <strong>{player.name}</strong>
          <span>{player.team ? `${player.team} · ` : ""}{player.stats.gms} games played</span>
        </div>
        <ChevronRight size={20} />
      </div>

      <div className="mini-grid">
        {miniStats.map(([label, key]) => (
          <div className="mini-stat" key={key}>
            <span>{label}</span>
            <strong>{player.stats[key]}</strong>
          </div>
        ))}
      </div>

      <div className="card-footer">
        <span>{player.derived.totalTouchdowns} total TD</span>
        <span>{player.derived.receptionsPerGame} REC / game</span>
      </div>
    </button>
  );
}
