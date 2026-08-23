import { ChevronRight } from "lucide-react";
import type { Player } from "../types";

interface Props {
  player: Player;
  selected: boolean;
  onSelect: (player: Player) => void;
}

const miniStats = [
  ["REC", "rec"],
  ["REC TD", "recTD"],
  ["INT", "int"],
  ["SACK", "sack"]
] as const;

export function PlayerCard({ player, selected, onSelect }: Props) {
  const initials = player.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <button className={`player-card ${selected ? "selected" : ""}`} onClick={() => onSelect(player)}>
      <div className="player-card-top">
        <div className="avatar">{initials}</div>
        <div className="player-heading">
          <strong>{player.name}</strong>
          <span>{player.stats.gms} games played</span>
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
