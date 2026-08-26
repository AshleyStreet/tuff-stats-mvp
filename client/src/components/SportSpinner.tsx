import { useLeague } from "../league/LeagueProvider";

export function SportSpinner() {
  const kind = useLeague().sportIcon || "football";
  const visual = kind === "softball" || kind === "soccer" ? "football" : kind;
  return (
    <div className={`${visual}-spinner`} aria-hidden="true">
      <div className={visual}>
        <span className={`${visual}-stripe ${visual}-stripe-left`} />
        <span className={`${visual}-stripe ${visual}-stripe-right`} />
        <span className={`${visual}-laces`} />
      </div>
    </div>
  );
}
