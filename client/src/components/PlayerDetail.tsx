import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Printer, Shield, Trophy, X, Zap } from "lucide-react";
import { getPlayerGameLog, getPlayerProfile, peekPlayerProfile } from "../api";
import { toTradingCard, type TradingCardData } from "../lib/cards";
import { useLeague, usePresentation } from "../league/LeagueProvider";
import { readStat } from "../league/readStat";
import { teamLogoUrl } from "../lib/teams";
import type { Player, PlayerGameLog, PlayerProfile, ScheduleGame, SeasonAppearance } from "../types";
import { CareerChart } from "./CareerChart";
import { KpiRow } from "./StatGrid";
import { TeamLogo } from "./TeamLogo";

interface Props {
  player: Player;
  activeSeason: string;
  teamLogos?: Record<string, string>;
  onClose: () => void;
  onSelectSeason?: (season: string) => void;
  onSelectGame?: (game: ScheduleGame) => void;
  onPrintCard?: (card: TradingCardData) => void;
}

const groupIcons = {
  zap: Zap,
  shield: Shield,
  trophy: Trophy
} as const;

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

export function PlayerDetail({ player, activeSeason, teamLogos, onClose, onSelectSeason, onSelectGame, onPrintCard }: Props) {
  const league = useLeague();
  const presentation = usePresentation();
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
              ? `${career.seasonsPlayed} season${career.seasonsPlayed === 1 ? "" : "s"} · ${readStat(career, "totalPoints")} career pts`
              : `${readStat(player, "gms")} games · ${readStat(player, "totalPoints")} pts`}
          </p>
          {onPrintCard && seasonView && (
            <button
              type="button"
              className="print-action detail-print"
              onClick={() =>
                onPrintCard(
                  toTradingCard(player, seasonView.season, teamLogos, {
                    name: displayName,
                    team: seasonView.team ?? teamLabel,
                    number: profile?.number,
                    stats: seasonView.stats,
                    derived: seasonView.derived
                  })
                )
              }
            >
              <Printer size={14} /> Print card
            </button>
          )}
        </div>
      </div>

      {loading && <div className="profile-loading">Loading career…</div>}
      {error && <div className="profile-error">{error}</div>}

      {career && <KpiRow columns={presentation.careerKpis} source={career} />}

      {!career && !loading && <KpiRow columns={presentation.heroKpis} source={player} />}

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
              <span>Year</span><span>Team</span>
              {presentation.seasonTableColumns.map((column) => (
                <span key={column.key}>{column.short}</span>
              ))}
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
                {presentation.seasonTableColumns.map((column) => (
                  <span key={column.key}>{readStat(row, column.key)}</span>
                ))}
              </button>
            ))}
          </div>
        </section>
      )}

      {seasonView && (
        <>
          <div className="season-detail-label">{seasonView.season} season detail</div>
          <KpiRow columns={presentation.heroKpis} source={seasonView} compact />

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
                  {presentation.gameLogColumns.map((column) => (
                    <span key={column.key}>{column.short}</span>
                  ))}
                </div>
                {gameLog.games.map((row) => {
                  const cells = (
                    <>
                      <span>{formatGameDay(row.game.date)}</span>
                      <span className="log-opp">{row.opponent}</span>
                      <span className={row.outcome === "win" ? "winner-score" : ""}>
                        {formatResult(row.outcome, row.score, row.oppScore)}
                      </span>
                      {presentation.gameLogColumns.map((column) => (
                        <span key={column.key}>{readStat(row, column.key)}</span>
                      ))}
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

          {presentation.detailGroups.map((group) => {
            const Icon = groupIcons[group.icon ?? "trophy"];
            return (
              <section key={group.id}>
                <h3><Icon size={17} /> {group.title}</h3>
                {group.columns.map((column) => (
                  <Row key={column.key} label={column.label} value={readStat(seasonView, column.key)} />
                ))}
              </section>
            );
          })}
        </>
      )}

      {(profile?.profileUrl || player.profileUrl) && (
        <a className="source-link" href={profile?.profileUrl ?? player.profileUrl} target="_blank" rel="noreferrer">
          {league.copy.profileLinkLabel} <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}
