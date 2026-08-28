import { toTradingCard } from "./cards";
import type { Player } from "../types";

function blankStats(): Player["stats"] {
  return {
    gms: 0,
    tpqb: 0,
    tpnqb: 0,
    paTD: 0,
    ruTD: 0,
    recTD: 0,
    retTD: 0,
    comp: 0,
    int: 0,
    sack: 0,
    deflag: 0,
    pa1PT: 0,
    ru1PT: 0,
    re1PT: 0,
    pa2PT: 0,
    rec: 0,
    ru2PT: 0,
    re2PT: 0,
    ret2PT: 0,
    safety: 0,
    ab: 0,
    r: 0,
    h: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    rbi: 0,
    bb: 0,
    so: 0,
    sb: 0,
    goals: 0,
    yellowCards: 0,
    redCards: 0
  };
}

/** Representative TUFF card for the marketing page — matches live card layout. */
export function marketingSampleCard() {
  const stats = blankStats();
  stats.gms = 9;
  stats.rec = 38;
  stats.recTD = 6;
  stats.re1PT = 4;
  stats.tpnqb = stats.recTD * 6 + stats.re1PT;
  stats.int = 3;
  stats.sack = 2;

  const player: Player = {
    id: "marketing-sample",
    name: "Carsson S.",
    team: "Menace",
    sourceId: "sample",
    stats,
    derived: {
      totalTouchdowns: stats.recTD,
      totalPoints: stats.tpnqb + stats.tpqb,
      receptionsPerGame: Number((stats.rec / stats.gms).toFixed(2)),
      receivingTouchdownsPerGame: Number((stats.recTD / stats.gms).toFixed(2))
    }
  };

  return toTradingCard(player, "2026", undefined, {
    number: "11",
    photoUrl: "/marketing/card-hero-sample.png"
  });
}
