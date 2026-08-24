import { defaultSlots, type PlayerOverrides, type StatSlot } from "./cardStats";

const STORAGE_KEY = "tuff-captain-tools";

export type CaptainSession = {
  slots: StatSlot[];
  overrides: Record<string, PlayerOverrides>;
  defaultNote: string;
  notes: Record<string, string>;
};

function isSlot(value: unknown): value is StatSlot {
  if (!value || typeof value !== "object") return false;
  const slot = value as StatSlot;
  return typeof slot.key === "string" && typeof slot.customLabel === "string" && typeof slot.customValue === "string";
}

export function emptyCaptainSession(): CaptainSession {
  return { slots: defaultSlots(), overrides: {}, defaultNote: "", notes: {} };
}

export function loadCaptainSession(): CaptainSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCaptainSession();
    const parsed = JSON.parse(raw) as Partial<CaptainSession>;
    const slots = Array.isArray(parsed.slots) ? parsed.slots.filter(isSlot) : [];
    return {
      slots: slots.length === 5 ? slots : defaultSlots(),
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      defaultNote: typeof parsed.defaultNote === "string" ? parsed.defaultNote : "",
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {}
    };
  } catch {
    return emptyCaptainSession();
  }
}

export function saveCaptainSession(session: CaptainSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* private mode / quota — keep working in memory */
  }
}
