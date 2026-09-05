/**
 * Qualify an eSportsDesk league before you approach it.
 *
 *   npm run prospect --prefix server -- 4997             # check every division
 *   npm run prospect --prefix server -- 4997:18050      # pin one league
 *   npm run prospect --prefix server -- 4997:18050 4626 3266   # several at once
 *
 * Ids come off any league URL: .../standings.cfm?leagueID=8641&clientID=3266
 *
 * Reads only public pages, one league at a time with a pause between — this is
 * for qualifying a handful of prospects, not crawling the platform.
 */
import {
  discoverEsportsdeskLeagues,
  inspectEsportsdeskLeague,
  type EsportsdeskInspection
} from "../src/adapters/esportsdesk/index.js";

const PAUSE_MS = 900;

/**
 * `4997` is a client on its own; `4997:18050` pins a league. Two bare numbers
 * used to be read as one client-and-league pair, which silently qualified the
 * wrong league — so a league now has to be attached with a colon.
 */
function pairsFrom(argv: string[]): Array<{ clientId: string; leagueId?: string }> {
  const pairs: Array<{ clientId: string; leagueId?: string }> = [];
  for (const arg of argv) {
    const match = /^(\d+)(?::(\d+))?$/.exec(arg.trim());
    if (!match) continue;
    pairs.push({ clientId: match[1]!, leagueId: match[2] });
  }
  return pairs;
}

function verdict(report: EsportsdeskInspection) {
  if (!report.ok) return "NOT READABLE";
  if (report.players > 0 && report.standings.length > 0) return "FULL BOARD";
  if (report.standings.length > 0) return "STANDINGS ONLY";
  return "PARTIAL";
}

function seasonState(report: EsportsdeskInspection) {
  if (!report.gamesPlayed) return "unknown";
  return report.gamesPlayed >= 9 ? `likely wrapped (${report.gamesPlayed} games)` : `mid-season (${report.gamesPlayed} games)`;
}

function render(report: EsportsdeskInspection) {
  const title = report.leagueName ?? `client ${report.clientId}`;
  console.log(`\n${"─".repeat(64)}`);
  console.log(`${title}`);
  console.log(`  ids       : clientID=${report.clientId}${report.leagueId ? ` leagueID=${report.leagueId}` : ""}`);
  console.log(`  verdict   : ${verdict(report)}`);
  console.log(`  teams     : ${report.standings.length}`);
  console.log(`  players   : ${report.players}${report.players === 20 ? "+ (first page; more behind pagination)" : ""}`);
  console.log(`  season    : ${seasonState(report)}`);
  if (report.topScorer) {
    console.log(`  top scorer: ${report.topScorer.name}${report.topScorer.team ? ` (${report.topScorer.team})` : ""} — ${report.topScorer.points} pts`);
  }
  if (report.standings.length) {
    const top = report.standings.slice(0, 3)
      .map((row) => `${row.name} ${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`)
      .join(" · ");
    console.log(`  standings : ${top}`);
  }
  if (report.headline) console.log(`\n  Use in the email:\n    "${report.headline}"`);
  for (const note of report.notes) console.log(`  note      : ${note}`);
}

async function main() {
  const pairs = pairsFrom(process.argv.slice(2));
  if (!pairs.length) {
    console.error("Usage: npm run prospect --prefix server -- <clientID>[:<leagueID>] …");
    process.exit(1);
  }

  const summary: Array<{ name: string; verdict: string; teams: number; players: number }> = [];

  for (const [index, pair] of pairs.entries()) {
    // Without an explicit leagueID, check every division this client runs and
    // keep the richest — the first id found is often an off-season division.
    let candidates = pair.leagueId ? [{ leagueId: pair.leagueId, label: "" }] : [];
    if (!candidates.length) {
      candidates = await discoverEsportsdeskLeagues(pair.clientId);
      if (candidates.length > 1) {
        console.log(`\nclient ${pair.clientId}: ${candidates.length} divisions — ${candidates.map((c) => `${c.label} (${c.leagueId})`).join(", ")}`);
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }

    let best: EsportsdeskInspection | undefined;
    for (const candidate of candidates.slice(0, 6)) {
      const report = await inspectEsportsdeskLeague(pair.clientId, candidate.leagueId);
      const score = (r: EsportsdeskInspection) => r.players * 10 + r.standings.length + r.gamesPlayed;
      if (!best || score(report) > score(best)) best = report;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }

    const report = best ?? (await inspectEsportsdeskLeague(pair.clientId, pair.leagueId));
    render(report);
    summary.push({
      name: report.leagueName ?? `client ${report.clientId}`,
      verdict: verdict(report),
      teams: report.standings.length,
      players: report.players
    });
    if (index < pairs.length - 1) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  if (summary.length > 1) {
    console.log(`\n${"═".repeat(64)}\nSUMMARY`);
    for (const row of summary) {
      console.log(`  ${row.verdict.padEnd(15)} ${String(row.teams).padStart(2)} teams  ${String(row.players).padStart(3)} players  ${row.name}`);
    }
  }
  console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
