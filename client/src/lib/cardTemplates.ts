import type { StatPresentation } from "../league/types";
import { SLOT_COUNT, type StatSlot } from "./cardStats";

export const CARD_TEMPLATE_IDS = ["classic", "tall", "defense"] as const;
export type CardTemplateId = (typeof CARD_TEMPLATE_IDS)[number];

export type CardTemplate = {
  id: CardTemplateId;
  label: string;
  hint: string;
  /** Suggested starter column count when the template is applied. */
  starterCount: number;
};

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "classic",
    label: "Classic",
    hint: "Balanced photo layout · starts with 3 columns",
    starterCount: 3
  },
  {
    id: "tall",
    label: "Tall photo",
    hint: "Bigger hero layout · starts with 2 columns",
    starterCount: 2
  },
  {
    id: "defense",
    label: "Defense-heavy",
    hint: "Cooler look · defense starter columns",
    starterCount: 5
  }
];

export function isCardTemplateId(value: unknown): value is CardTemplateId {
  return typeof value === "string" && (CARD_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function cardTemplate(id: CardTemplateId): CardTemplate {
  return CARD_TEMPLATES.find((item) => item.id === id) ?? CARD_TEMPLATES[0];
}

function slotsFromKeys(keys: string[]): StatSlot[] {
  const next = keys.filter(Boolean).slice(0, SLOT_COUNT);
  if (!next.length) next.push("custom");
  return next.map((key) => ({ key, customLabel: "", customValue: "" }));
}

export function slotsForTemplate(id: CardTemplateId, presentation: StatPresentation): StatSlot[] {
  if (id === "tall") {
    return slotsFromKeys(presentation.cardDefaults.slice(0, 2).map((column) => column.key));
  }
  if (id === "defense") {
    const defense = presentation.detailGroups.find((group) => group.id === "defense");
    const keys = (defense?.columns.length ? defense.columns : presentation.cardDefaults).map((column) => column.key);
    return slotsFromKeys(keys);
  }
  return slotsFromKeys(presentation.cardDefaults.slice(0, 3).map((column) => column.key));
}
