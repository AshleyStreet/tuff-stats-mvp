import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Sits beside .tenants/ and .cache/ — bind-mount it on the instance too. */
export function leadsDir() {
  return path.resolve(process.env.LEADS_DIR || path.join(__dirname, "../../.leads"));
}

export type LeadStatus = "new" | "contacted" | "archived";

/** What probeSourceUrl found for the submitted stats URL. Never blocks the reply. */
export type LeadProbe = {
  ok: boolean;
  /** What they're running on — the question that decides how much work this is. */
  platform?: string;
  platformLabel?: string;
  detectedIds?: Record<string, string>;
  adapter?: string;
  sport?: string;
  siteName?: string;
  seasons?: number;
  tables?: number;
  lists?: number;
  sportspressLive?: boolean;
  teams?: number;
  warnings?: string[];
  error?: string;
};

export type Lead = {
  id: string;
  createdAt: string;
  league: string;
  sport: string;
  email: string;
  statsUrl?: string;
  notes?: string;
  status: LeadStatus;
  probe?: LeadProbe;
  probedAt?: string;
};

export class LeadError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "LeadError";
  }
}

const LIMITS = { league: 120, sport: 40, email: 160, statsUrl: 500, notes: 1200 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(raw: unknown, max: number) {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A public endpoint writes these, so treat every field as hostile: cap lengths,
 * check the address, and only keep an http(s) stats URL.
 */
export function parseLeadInput(body: unknown): Omit<Lead, "id" | "createdAt" | "status"> {
  const raw = (body ?? {}) as Record<string, unknown>;

  const league = clean(raw.league, LIMITS.league);
  if (!league) throw new LeadError(400, "Tell us which league or club this is for.");

  const email = clean(raw.email, LIMITS.email);
  if (!EMAIL_RE.test(email)) throw new LeadError(400, "That email address doesn't look right.");

  let statsUrl = clean(raw.statsUrl, LIMITS.statsUrl);
  if (statsUrl && !/^https?:\/\//i.test(statsUrl)) statsUrl = `https://${statsUrl}`;
  if (statsUrl) {
    try {
      new URL(statsUrl);
    } catch {
      statsUrl = "";
    }
  }

  return {
    league,
    sport: clean(raw.sport, LIMITS.sport) || "Not specified",
    email,
    statsUrl: statsUrl || undefined,
    notes: clean(raw.notes, LIMITS.notes) || undefined
  };
}

function leadFile(id: string) {
  return path.join(leadsDir(), `${id}.json`);
}

export function writeLead(lead: Lead) {
  const dir = leadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = leadFile(lead.id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(lead, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function createLead(input: Omit<Lead, "id" | "createdAt" | "status">): Lead {
  const lead: Lead = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new"
  };
  writeLead(lead);
  return lead;
}

export function readLead(id: string): Lead | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(leadFile(id), "utf8")) as Lead;
    return parsed?.id === id ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Newest first — the panel reads this straight through. */
export function listLeads(): Lead[] {
  const dir = leadsDir();
  if (!fs.existsSync(dir)) return [];
  const leads: Lead[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      leads.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Lead);
    } catch {
      /* skip unreadable lead files rather than failing the whole list */
    }
  }
  return leads.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function setLeadStatus(id: string, status: LeadStatus): Lead | undefined {
  const lead = readLead(id);
  if (!lead) return undefined;
  const next = { ...lead, status };
  writeLead(next);
  return next;
}

export function deleteLead(id: string): boolean {
  const file = leadFile(id);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

export function attachProbe(id: string, probe: LeadProbe) {
  const lead = readLead(id);
  if (!lead) return;
  writeLead({ ...lead, probe, probedAt: new Date().toISOString() });
}
