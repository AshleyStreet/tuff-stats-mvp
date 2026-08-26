import { ChevronRight } from "lucide-react";
import { MiniStatGrid } from "./StatGrid";
import { usePresentation } from "../league/LeagueProvider";
import { readStat } from "../league/readStat";
import { teamLogoUrl } from "../lib/teams";
import type { Player } from "../types";
import { TeamLogo } from "./TeamLogo";

interface Props {
  player: Player;
  selected: boolean;
  onSelect: (player: Player) => void;
  teamLogos?: Record<string, string>;
}

export function PlayerCard({ player, selected, onSelect, teamLogos }: Props) {
  const presentation = usePresentation();
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
          <span>{player.team ? `${player.team} · ` : ""}{readStat(player, "gms")} games played</span>
        </div>
        <ChevronRight size={20} />
      </div>

      <MiniStatGrid columns={presentation.playerCardMini} source={player} />

      <div className="card-footer">
        {presentation.playerCardFooter.map((column) => (
          <span key={column.key}>
            {readStat(player, column.key)} {column.short}
          </span>
        ))}
      </div>
    </button>
  );
}
