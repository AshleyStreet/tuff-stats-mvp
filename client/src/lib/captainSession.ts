import { defaultSlots, type PlayerOverrides, type StatSlot } from "./cardStats";

const LEGACY_STORAGE_KEY = "tuff-captain-tools";

export function captainStorageKey(slug: string) {
  return `captain-tools:${slug}`;
}

export type CaptainSession = {
  slots: StatSlot[];
  overrides: Record<string, PlayerOverrides>;
  defaultNote: string;
  notes: Record<string, string>;
  photos: Record<string, string>;
};

function isPhotoMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string" && item.startsWith("data:image/"));
}

function isSlot(value: unknown): value is StatSlot {
  if (!value || typeof value !== "object") return false;
  const slot = value as StatSlot;
  return typeof slot.key === "string" && typeof slot.customLabel === "string" && typeof slot.customValue === "string";
}

function migrateSlot(slot: StatSlot): StatSlot {
  if ((slot.key as string) === "att") return { ...slot, key: "deflag" };
  return slot;
}

export function emptyCaptainSession(): CaptainSession {
  return { slots: defaultSlots(), overrides: {}, defaultNote: "", notes: {}, photos: {} };
}

export function loadCaptainSession(slug = "tuff"): CaptainSession {
  try {
    const key = captainStorageKey(slug);
    const raw = sessionStorage.getItem(key) ?? (slug === "tuff" ? sessionStorage.getItem(LEGACY_STORAGE_KEY) : null);
    if (!raw) return emptyCaptainSession();
    const parsed = JSON.parse(raw) as Partial<CaptainSession>;
    const slots = Array.isArray(parsed.slots) ? parsed.slots.filter(isSlot).map(migrateSlot) : [];
    return {
      slots: slots.length === 5 ? slots : defaultSlots(),
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      defaultNote: typeof parsed.defaultNote === "string" ? parsed.defaultNote : "",
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      photos: isPhotoMap(parsed.photos) ? parsed.photos : {}
    };
  } catch {
    return emptyCaptainSession();
  }
}

export function saveCaptainSession(session: CaptainSession, slug = "tuff"): "ok" | "photos-skipped" {
  const key = captainStorageKey(slug);
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
    return "ok";
  } catch {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...session, photos: {} }));
      return "photos-skipped";
    } catch {
      return "photos-skipped";
    }
  }
}
