import { DEFAULT_PHOTO_POSITION, normalizeJersey, type PhotoPosition } from "./cards";
import { defaultSlots, type PlayerOverrides, type StatSlot } from "./cardStats";
import { isCardTemplateId, type CardTemplateId } from "./cardTemplates";

const LEGACY_STORAGE_KEY = "tuff-captain-tools";

export function captainStorageKey(slug: string) {
  return `captain-tools:${slug}`;
}

export type TeamCardColors = {
  background: string;
  border: string;
};

export type CaptainSession = {
  slots: StatSlot[];
  overrides: Record<string, PlayerOverrides>;
  defaultNote: string;
  notes: Record<string, string>;
  photos: Record<string, string>;
  photoPositions: Record<string, PhotoPosition>;
  template: CardTemplateId;
  pinned: string[];
  pinnedOnly: boolean;
  teamFilter: string;
  teamColors: Record<string, TeamCardColors>;
  numbers: Record<string, string>;
  showTitleLine: boolean;
};

function isPhotoMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string" && item.startsWith("data:image/"));
}

function isPhotoPosition(value: unknown): value is PhotoPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as PhotoPosition;
  return (
    typeof position.x === "number" &&
    typeof position.y === "number" &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

function isPhotoPositionMap(value: unknown): value is Record<string, PhotoPosition> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(isPhotoPosition);
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function normalizeNumberMap(value: unknown): Record<string, string> {
  if (!isStringMap(value)) return {};
  const next: Record<string, string> = {};
  for (const [playerId, raw] of Object.entries(value)) {
    const jersey = normalizeJersey(raw);
    if (jersey) next[playerId] = jersey;
  }
  return next;
}

function isTeamColorsMap(value: unknown): value is Record<string, TeamCardColors> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => {
    if (!item || typeof item !== "object") return false;
    const colors = item as TeamCardColors;
    return typeof colors.background === "string" && typeof colors.border === "string";
  });
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
  return {
    slots: defaultSlots(),
    overrides: {},
    defaultNote: "",
    notes: {},
    photos: {},
    photoPositions: {},
    template: "classic",
    pinned: [],
    pinnedOnly: false,
    teamFilter: "",
    teamColors: {},
    numbers: {},
    showTitleLine: true
  };
}

export function normalizePhotoPosition(position?: PhotoPosition | null): PhotoPosition {
  if (!position) return { ...DEFAULT_PHOTO_POSITION };
  return {
    x: Math.min(100, Math.max(0, position.x)),
    y: Math.min(100, Math.max(0, position.y))
  };
}

export function loadCaptainSession(slug = "tuff"): CaptainSession {
  try {
    const key = captainStorageKey(slug);
    const raw = sessionStorage.getItem(key) ?? (slug === "tuff" ? sessionStorage.getItem(LEGACY_STORAGE_KEY) : null);
    if (!raw) return emptyCaptainSession();
    const parsed = JSON.parse(raw) as Partial<CaptainSession>;
    const slots = Array.isArray(parsed.slots) ? parsed.slots.filter(isSlot).map(migrateSlot) : [];
    const pinned = Array.isArray(parsed.pinned)
      ? parsed.pinned.filter((id): id is string => typeof id === "string")
      : [];
    return {
      slots: slots.length >= 1 && slots.length <= 5 ? slots : defaultSlots(),
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      defaultNote: typeof parsed.defaultNote === "string" ? parsed.defaultNote : "",
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      photos: isPhotoMap(parsed.photos) ? parsed.photos : {},
      photoPositions: isPhotoPositionMap(parsed.photoPositions) ? parsed.photoPositions : {},
      template: isCardTemplateId(parsed.template) ? parsed.template : "classic",
      pinned,
      pinnedOnly: Boolean(parsed.pinnedOnly),
      teamFilter: typeof parsed.teamFilter === "string" ? parsed.teamFilter : "",
      teamColors: isTeamColorsMap(parsed.teamColors) ? parsed.teamColors : {},
      numbers: normalizeNumberMap(parsed.numbers),
      showTitleLine: parsed.showTitleLine !== false
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
      sessionStorage.setItem(key, JSON.stringify({ ...session, photos: {}, photoPositions: {} }));
      return "photos-skipped";
    } catch {
      return "photos-skipped";
    }
  }
}
