import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Shield, Trophy, X, Zap } from "lucide-react";
import { getPlayerGameLog, getPlayerProfile, peekPlayerProfile } from "../api";
import { teamLogoUrl } from "../lib/teams";
import type { Player, PlayerGameLog, PlayerProfile, ScheduleGame, SeasonAppearance } from "../types";
import { CareerChart } from "./CareerChart";
import { TeamLogo } from "./TeamLogo";

interface Props {
  player: Player;
  activeSeason: string;
  teamLogos?: Record<string, string>;
  onClose: () => void;
  onSelectSeason?: (season: string) => void;
  onSelectGame?: (game: ScheduleGame) => void;
}

const Row = ({ label, value }: { label: string; value: number }) => (
  <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>
);

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function formatGameDay(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatResult(outcome?: string, score?: number, oppScore?: number) {
  const mark = outcome === "win" ? "W" : outcome === "loss" ? "L" : outcome === "draw" || outcome === "tie" ? "T" : "";
  if (typeof score === "number" && typeof oppScore === "number") {
    return `${mark ? `${mark} ` : ""}${score}–${oppScore}`;
  }
  return mark || "—";
}

export function PlayerDetail({ player, activeSeason, teamLogos, onClose, onSelectSeason, onSelectGame }: Props) {
  const cached = peekPlayerProfile(player.id);
  const [profile, setProfile] = useState<PlayerProfile | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(activeSeason);

  useEffect(() => {
    let cancelled = false;
    const existing = peekPlayerProfile(player.id);
    if (existing) {
      setProfile(existing);
      setLoading(false);
      setError(null);
      const preferred =
        existing.seasons.find((season) => season.season === activeSeason)?.season ??
        existing.seasons[0]?.season ??
        activeSeason;
      setSelectedSeason(preferred);
      return;
    }

    setLoading(true);
    setError(null);
    setProfile(null);
    getPlayerProfile(player.id)
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        const preferred =
          result.seasons.find((season) => season.season === activeSeason)?.season ??
          result.seasons[0]?.season ??
          activeSeason;
        setSelectedSeason(preferred);
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
    // Only refetch when the player changes — season clicks must not reload career.
  }, [player.id]);

  useEffect(() => {
    if (!profile) return;
    const match = profile.seasons.find((season) => season.season === activeSeason);
    if (match) setSelectedSeason(match.season);
  }, [activeSeason, profile]);

  const seasonView: SeasonAppearance | null = useMemo(() => {
    if (!profile) {
      return {
        season: activeSeason,
        team: player.team,
        stats: player.stats,
        derived: player.derived
      };
    }
    return profile.seasons.find((season) => season.season === selectedSeason) ?? profile.seasons[0] ?? null;
  }, [profile, selectedSeason, activeSeason, player]);

  const career = profile?.career;
  const displayName = profile?.name ?? player.name;
  const teamLabel = profile?.currentTeam ?? player.team;
  const linkedCount = profile?.linkedSourceIds?.length ?? 0;
  const [gameLog, setGameLog] = useState<PlayerGameLog | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  useEffect(() => {
    const year = seasonView?.season ?? selectedSeason ?? activeSeason;
    if (!player.id || !year) return;
    let cancelled = false;
    setGameLog(null);
    setLogLoading(true);
    setLogError(null);
    getPlayerGameLog(player.id, year)
      .then((result) => {
        if (cancelled) return;
        setGameLog(result);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setGameLog(null);
          setLogError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id, seasonView?.season, selectedSeason, activeSeason]);

  return (
    <aside className="detail-panel">
      <button className="icon-button close" onClick={onClose} aria-label="Close player details"><X size={20} /></button>

      <div className="detail-hero">
        <TeamLogo
          name={teamLabel || displayName}
          src={teamLogoUrl(seasonView?.team ?? teamLabel, teamLogos)}
          className="avatar large team-avatar"
          fallback={initials(displayName)}
        />
        <div>
          <div className="eyebrow">PLAYER PROFILE</div>
          <h2>
            {displayName}
            {profile?.number ? <span className="jersey-number">#{profile.number}</span> : null}
          </h2>
          <p>
            {teamLabel ? `${teamLabel} · ` : ""}
            {career
              ? `${career.seasonsPlayed} season${career.seasonsPlayed === 1 ? "" : "s"} · ${career.derived.totalPoints} career pts`
              : `${player.stats.gms} games · ${player.derived.totalPoints} pts`}
          </p>
        </div>
      </div>

      {loading && <div className="profile-loading">Loading career…</div>}
      {error && <div className="profile-error">{error}</div>}

      {career && (
        <div className="hero-kpis">
          <div><span>CAREER PTS</span><strong>{career.derived.totalPoints}</strong></div>
          <div><span>CAREER TD</span><strong>{career.derived.totalTouchdowns}</strong></div>
          <div><span>GAMES</span><strong>{career.stats.gms}</strong></div>
        </div>
      )}

      {!career && !loading && (
        <div className="hero-kpis">
          <div><span>RECEPTIONS</span><strong>{player.stats.rec}</strong></div>
          <div><span>REC TD</span><strong>{player.stats.recTD}</strong></div>
          <div><span>INT</span><strong>{player.stats.int}</strong></div>
        </div>
      )}

      {profile && profile.seasons.length > 1 && (
        <CareerChart seasons={profile.seasons} selectedSeason={selectedSeason} />
      )}

      {profile && profile.teams.length > 0 && (
        <section>
          <h3><Trophy size={17} /> Teams</h3>
          <div className="team-chips">
            {profile.teams.map((team) => (
              <span className={`team-chip${team === profile.currentTeam ? " current" : ""}`} key={team}>
                <TeamLogo name={team} src={teamLogoUrl(team, teamLogos)} className="team-logo-xs" />
                {team}
              </span>
            ))}
          </div>
        </section>
      )}

      {profile && profile.seasons.length > 0 && (
        <section>
          <h3><CalendarDays size={17} /> Career by season</h3>
          {linkedCount > 0 && (
            <p className="career-note">
              Includes {linkedCount} linked roster id{linkedCount === 1 ? "" : "s"} matched by jersey or team continuity.
            </p>
          )}
          <div className="season-table">
            <div className="season-table-head">
              <span>Year</span><span>Team</span><span>G</span><span>Pts</span><span>TD</span>
            </div>
            {profile.seasons.map((row) => (
              <button
                key={`${row.season}-${row.sourceId ?? "primary"}`}
                className={`season-table-row${row.season === selectedSeason ? " active" : ""}`}
                onClick={() => {
                  setSelectedSeason(row.season);
                  onSelectSeason?.(row.season);
                }}
              >
                <span>{row.season}{row.linked ? "*" : ""}</span>
                <span>{row.team ?? "—"}</span>
                <span>{row.stats.gms}</span>
                <span>{row.derived.totalPoints}</span>
                <span>{row.derived.totalTouchdowns}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {seasonView && (
        <>
          <div className="season-detail-label">{seasonView.season} season detail</div>
          <div className="hero-kpis compact">
            <div><span>REC</span><strong>{seasonView.stats.rec}</strong></div>
            <div><span>REC TD</span><strong>{seasonView.stats.recTD}</strong></div>
            <div><span>INT</span><strong>{seasonView.stats.int}</strong></div>
          </div>

          <section>
            <h3><CalendarDays size={17} /> Game log</h3>
            {logLoading && <div className="profile-loading">Loading game log…</div>}
            {logError && <div className="profile-error">{logError}</div>}
            {!logLoading && !logError && (!gameLog || gameLog.games.length === 0) && (
              <div className="profile-loading">No game log posted for this season yet.</div>
            )}
            {gameLog && gameLog.games.length > 0 && (
              <div className="log-table">
                <div className="log-row log-head">
                  <span>Date</span>
                  <span>Opp</span>
                  <span>Res</span>
                  <span>Rec</span>
                  <span>RecTD</span>
                  <span>PaTD</span>
                  <span>INT</span>
                  <span>Sack</span>
                </div>
                {gameLog.games.map((row) => {
                  const cells = (
                    <>
                      <span>{formatGameDay(row.game.date)}</span>
                      <span className="log-opp">{row.opponent}</span>
                      <span className={row.outcome === "win" ? "winner-score" : ""}>
                        {formatResult(row.outcome, row.score, row.oppScore)}
                      </span>
                      <span>{row.stats.rec}</span>
                      <span>{row.stats.recTD}</span>
                      <span>{row.stats.paTD}</span>
                      <span>{row.stats.int}</span>
                      <span>{row.stats.sack}</span>
                    </>
                  );
                  if (onSelectGame) {
                    return (
                      <button
                        type="button"
                        className="log-row"
                        key={row.game.id}
                        onClick={() => onSelectGame(row.game)}
                      >
                        {cells}
                      </button>
                    );
                  }
                  return (
                    <div className="log-row" key={row.game.id}>
                      {cells}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3><Zap size={17} /> Offense</h3>
            <Row label="Passing TDs" value={seasonView.stats.paTD} />
            <Row label="Rushing TDs" value={seasonView.stats.ruTD} />
            <Row label="Receiving TDs" value={seasonView.stats.recTD} />
            <Row label="Return TDs" value={seasonView.stats.retTD} />
            <Row label="Completions" value={seasonView.stats.comp} />
            <Row label="Attempts" value={seasonView.stats.att} />
            <Row label="Receptions" value={seasonView.stats.rec} />
          </section>

          <section>
            <h3><Shield size={17} /> Defense</h3>
            <Row label="Interceptions" value={seasonView.stats.int} />
            <Row label="Sacks" value={seasonView.stats.sack} />
            <Row label="Safeties" value={seasonView.stats.safety} />
          </section>

          <section>
            <h3><Trophy size={17} /> Conversions</h3>
            <Row label="1PT Passing" value={seasonView.stats.pa1PT} />
            <Row label="1PT Rushing" value={seasonView.stats.ru1PT} />
            <Row label="1PT Receiving" value={seasonView.stats.re1PT} />
            <Row label="2PT Passing" value={seasonView.stats.pa2PT} />
            <Row label="2PT Rushing" value={seasonView.stats.ru2PT} />
            <Row label="2PT Receiving" value={seasonView.stats.re2PT} />
            <Row label="2PT Return" value={seasonView.stats.ret2PT} />
          </section>
        </>
      )}

      {(profile?.profileUrl || player.profileUrl) && (
        <a className="source-link" href={profile?.profileUrl ?? player.profileUrl} target="_blank" rel="noreferrer">
          Open original TUFF profile <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}
