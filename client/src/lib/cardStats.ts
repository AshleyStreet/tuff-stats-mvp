import type { Player, StatKey } from "../types";
import type { CardStatLine } from "./cards";

export const SLOT_COUNT = 5;

export type DerivedSlotKey = "totalPoints" | "totalTouchdowns" | "recPerGame" | "recTdPerGame";
export type LiveSlotKey = StatKey | DerivedSlotKey;
export type SlotKey = LiveSlotKey | "custom";

export type StatSlot = {
  key: SlotKey;
  customLabel: string;
  customValue: string;
};

export type SlotOverride = {
  label?: string;
  value?: string;
};

export type PlayerOverrides = Partial<Record<number, SlotOverride>>;

export const CARD_STAT_OPTIONS: { key: LiveSlotKey; label: string; short: string }[] = [
  { key: "totalPoints", label: "Total points", short: "PTS" },
  { key: "totalTouchdowns", label: "Total TDs", short: "TD" },
  { key: "rec", label: "Receptions", short: "REC" },
  { key: "recTD", label: "Receiving TDs", short: "RTD" },
  { key: "int", label: "Interceptions", short: "INT" },
  { key: "sack", label: "Sacks", short: "SACK" },
  { key: "comp", label: "Completions", short: "CMP" },
  { key: "att", label: "Pass attempts", short: "ATT" },
  { key: "paTD", label: "Passing TDs", short: "PTD" },
  { key: "ruTD", label: "Rushing TDs", short: "RUSH" },
  { key: "retTD", label: "Return TDs", short: "RET" },
  { key: "gms", label: "Games played", short: "GP" },
  { key: "tpqb", label: "Points as QB", short: "QB" },
  { key: "tpnqb", label: "Points as non-QB", short: "NQ" },
  { key: "pa1PT", label: "Passing 1-pt", short: "P1" },
  { key: "ru1PT", label: "Rushing 1-pt", short: "R1" },
  { key: "re1PT", label: "Receiving 1-pt", short: "C1" },
  { key: "pa2PT", label: "Passing 2-pt", short: "P2" },
  { key: "ru2PT", label: "Rushing 2-pt", short: "R2" },
  { key: "re2PT", label: "Receiving 2-pt", short: "C2" },
  { key: "ret2PT", label: "Return 2-pt", short: "T2" },
  { key: "safety", label: "Safeties", short: "SFT" },
  { key: "recPerGame", label: "Receptions / game", short: "R/G" },
  { key: "recTdPerGame", label: "Rec TDs / game", short: "TD/G" }
];

const optionByKey = new Map(CARD_STAT_OPTIONS.map((item) => [item.key, item]));

export const DEFAULT_SLOTS: StatSlot[] = [
  { key: "totalPoints", customLabel: "", customValue: "" },
  { key: "totalTouchdowns", customLabel: "", customValue: "" },
  { key: "rec", customLabel: "", customValue: "" },
  { key: "int", customLabel: "", customValue: "" },
  { key: "sack", customLabel: "", customValue: "" }
];

export function emptySlots(): StatSlot[] {
  return Array.from({ length: SLOT_COUNT }, () => ({
    key: "custom",
    customLabel: "",
    customValue: ""
  }));
}

export function defaultSlots(): StatSlot[] {
  return DEFAULT_SLOTS.map((slot) => ({ ...slot }));
}

export function liveValue(player: Player, key: LiveSlotKey): string {
  switch (key) {
    case "totalPoints":
      return String(player.derived.totalPoints);
    case "totalTouchdowns":
      return String(player.derived.totalTouchdowns);
    case "recPerGame":
      return String(player.derived.receptionsPerGame);
    case "recTdPerGame":
      return String(player.derived.receivingTouchdownsPerGame);
    default:
      return String(player.stats[key] ?? 0);
  }
}

export function slotLabel(slot: StatSlot): string {
  if (slot.key === "custom") return slot.customLabel.trim();
  return optionByKey.get(slot.key)?.short ?? slot.key;
}

export function slotValue(player: Player, slot: StatSlot): string {
  if (slot.key === "custom") return slot.customValue;
  return liveValue(player, slot.key);
}

export function resolveLineItems(
  player: Player,
  slots: StatSlot[],
  overrides: PlayerOverrides = {}
): CardStatLine[] {
  return slots.slice(0, SLOT_COUNT).map((slot, index) => {
    const override = overrides[index];
    const label = override?.label?.trim() ? override.label : slotLabel(slot);
    const value = override?.value != null && override.value !== "" ? override.value : slotValue(player, slot);
    return { label, value };
  });
}
