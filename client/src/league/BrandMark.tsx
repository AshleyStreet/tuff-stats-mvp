import { useLeague } from "./LeagueProvider";

export function BrandMark({ subtitle }: { subtitle?: string }) {
  const league = useLeague();
  return (
    <div className="brand">
      <img className="brand-logo" src={league.branding.logo} alt={league.branding.logoAlt} />
      <div>
        <strong>{league.shortName}</strong>
        <span>{subtitle ?? league.copy.tagline}</span>
      </div>
    </div>
  );
}
