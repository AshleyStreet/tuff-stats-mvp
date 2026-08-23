import { ExternalLink, Shield, Trophy, X, Zap } from "lucide-react";
import type { Player } from "../types";

interface Props {
  player: Player;
  onClose: () => void;
}

const Row = ({ label, value }: { label: string; value: number }) => (
  <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>
);

export function PlayerDetail({ player, onClose }: Props) {
  return (
    <aside className="detail-panel">
      <button className="icon-button close" onClick={onClose} aria-label="Close player details"><X size={20} /></button>
      <div className="detail-hero">
        <div className="avatar large">{player.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
        <div>
          <div className="eyebrow">PLAYER PROFILE</div>
          <h2>{player.name}</h2>
          <p>{player.team ? `${player.team} · ` : ""}{player.stats.gms} games played · {player.derived.totalPoints} total points</p>
        </div>
      </div>

      <div className="hero-kpis">
        <div><span>RECEPTIONS</span><strong>{player.stats.rec}</strong></div>
        <div><span>REC TD</span><strong>{player.stats.recTD}</strong></div>
        <div><span>INT</span><strong>{player.stats.int}</strong></div>
      </div>

      <section>
        <h3><Zap size={17} /> Offense</h3>
        <Row label="Passing TDs" value={player.stats.paTD} />
        <Row label="Rushing TDs" value={player.stats.ruTD} />
        <Row label="Receiving TDs" value={player.stats.recTD} />
        <Row label="Return TDs" value={player.stats.retTD} />
        <Row label="Completions" value={player.stats.comp} />
        <Row label="Attempts" value={player.stats.att} />
        <Row label="Receptions" value={player.stats.rec} />
      </section>

      <section>
        <h3><Shield size={17} /> Defense</h3>
        <Row label="Interceptions" value={player.stats.int} />
        <Row label="Sacks" value={player.stats.sack} />
        <Row label="Safeties" value={player.stats.safety} />
      </section>

      <section>
        <h3><Trophy size={17} /> Conversions</h3>
        <Row label="1PT Passing" value={player.stats.pa1PT} />
        <Row label="1PT Rushing" value={player.stats.ru1PT} />
        <Row label="1PT Receiving" value={player.stats.re1PT} />
        <Row label="2PT Passing" value={player.stats.pa2PT} />
        <Row label="2PT Rushing" value={player.stats.ru2PT} />
        <Row label="2PT Receiving" value={player.stats.re2PT} />
        <Row label="2PT Return" value={player.stats.ret2PT} />
      </section>

      {player.profileUrl && (
        <a className="source-link" href={player.profileUrl} target="_blank" rel="noreferrer">
          Open original TUFF profile <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}
