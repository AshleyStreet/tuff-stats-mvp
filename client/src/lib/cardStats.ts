import { CARD_FACE_SLOTS, type CardStatLine } from "./cards";
import { flagFootballPresentation } from "../league/flagFootball";
import { readStat } from "../league/readStat";
import type { StatColumn } from "../league/types";
import type { Player } from "../types";

export const SLOT_COUNT = CARD_FACE_SLOTS;

export type SlotKey = string;
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

export const CARD_STAT_OPTIONS: StatColumn[] = flagFootballPresentation.cardOptions;

export const DEFAULT_SLOTS: StatSlot[] = flagFootballPresentation.cardDefaults.map((column) => ({
  key: column.key,
  customLabel: "",
  customValue: ""
}));

export function emptySlots(): StatSlot[] {
  return Array.from({ length: SLOT_COUNT }, () => ({
    key: "custom",
    customLabel: "",
    customValue: ""
  }));
}

export function defaultSlots(columns: StatColumn[] = flagFootballPresentation.cardDefaults): StatSlot[] {
  const keys = columns.map((column) => column.key);
  while (keys.length < SLOT_COUNT) keys.push("custom");
  return keys.slice(0, SLOT_COUNT).map((key) => ({
    key,
    customLabel: "",
    customValue: ""
  }));
}

export function liveValue(player: Player, key: string): string {
  if (key === "custom") return "";
  return String(readStat(player, key));
}

export function slotLabel(slot: StatSlot, options: StatColumn[] = CARD_STAT_OPTIONS): string {
  if (slot.key === "custom") return slot.customLabel.trim();
  return options.find((item) => item.key === slot.key)?.short ?? slot.key;
}

export function slotValue(player: Player, slot: StatSlot): string {
  if (slot.key === "custom") return slot.customValue;
  return liveValue(player, slot.key);
}

export function resolveLineItems(
  player: Player,
  slots: StatSlot[],
  overrides: PlayerOverrides = {},
  options: StatColumn[] = CARD_STAT_OPTIONS
): CardStatLine[] {
  return slots.slice(0, SLOT_COUNT).map((slot, index) => {
    const override = overrides[index];
    const label = override?.label?.trim() ? override.label : slotLabel(slot, options);
    const value = override?.value != null && override.value !== "" ? override.value : slotValue(player, slot);
    return { label, value };
  });
}
