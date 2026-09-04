import { useEffect, useMemo, useState } from "react";
import { Mail, RefreshCw, Trash2 } from "lucide-react";

export type LeadProbe = {
  ok: boolean;
  platform?: string;
  platformLabel?: string;
  detectedIds?: Record<string, string>;
  sport?: string;
  seasons?: number;
  tables?: number;
  lists?: number;
  teams?: number;
  sportspressLive?: boolean;
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
  status: "new" | "contacted" | "archived";
  probe?: LeadProbe;
  probedAt?: string;
};

const STATUSES = ["new", "contacted", "archived"] as const;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Reads as "how much work is this league" at a glance. */
function platformClass(probe?: LeadProbe) {
  if (!probe) return "admin-lead-pill";
  if (!probe.ok || probe.platform === "unknown") return "admin-lead-pill is-unknown";
  return "admin-lead-pill is-known";
}

export function AdminLeads({ token }: { token: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-admin-token": token }),
    [token]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/leads", { headers });
      if (!response.ok) throw new Error("Could not load leads");
      const body = (await response.json()) as { leads: Lead[]; emailConfigured: boolean };
      setLeads(body.leads);
      setEmailConfigured(body.emailConfigured);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function setStatus(id: string, status: Lead["status"]) {
    setLeads((current) => current.map((l) => (l.id === id ? { ...l, status } : l)));
    await fetch(`/api/admin/leads/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ status })
    }).catch(() => undefined);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    setLeads((current) => current.filter((l) => l.id !== id));
    await fetch(`/api/admin/leads/${id}`, { method: "DELETE", headers }).catch(() => undefined);
  }

  const shown = filter === "open" ? leads.filter((l) => l.status !== "archived") : leads;
  const newCount = leads.filter((l) => l.status === "new").length;

  return (
    <div className="admin-leads">
      <div className="section-head">
        <div>
          <p className="eyebrow">INBOUND</p>
          <h1>Leads {newCount ? <span className="admin-lead-count">{newCount} new</span> : null}</h1>
        </div>
        <div className="admin-section-actions">
          <select
            className="admin-lead-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as "open" | "all")}
          >
            <option value="open">Open</option>
            <option value="all">All</option>
          </select>
          <button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : undefined} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {!emailConfigured ? (
        <p className="captain-hint">
          Email notifications are off — set RESEND_API_KEY on the server to get these in your inbox.
          Leads are still captured here.
        </p>
      ) : null}

      {!shown.length && !loading ? (
        <p className="captain-hint">No leads yet. They arrive from the form on the marketing site.</p>
      ) : null}

      <div className="admin-lead-list">
        {shown.map((lead) => (
          <article key={lead.id} className={`admin-lead${lead.status === "new" ? " is-new" : ""}`}>
            <div className="admin-lead-top">
              <div>
                <h2>{lead.league}</h2>
                <p className="admin-lead-meta">
                  {lead.sport} · {relativeTime(lead.createdAt)}
                </p>
              </div>
              <span className={platformClass(lead.probe)}>
                {lead.probe ? lead.probe.platformLabel ?? "Checked" : "Not checked"}
              </span>
            </div>

            {lead.probe?.ok && (lead.probe.seasons || lead.probe.tables || lead.probe.teams) ? (
              <p className="admin-lead-probe">
                {[
                  lead.probe.sport ? lead.probe.sport : "",
                  lead.probe.seasons ? `${lead.probe.seasons} seasons` : "",
                  lead.probe.tables ? `${lead.probe.tables} tables` : "",
                  lead.probe.lists ? `${lead.probe.lists} lists` : "",
                  lead.probe.teams ? `${lead.probe.teams} teams` : ""
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}

            {lead.probe?.detectedIds ? (
              <p className="admin-lead-ids">
                {Object.entries(lead.probe.detectedIds)
                  .map(([key, value]) => `${key}=${value}`)
                  .join("  ")}
              </p>
            ) : null}

            {lead.statsUrl ? (
              <a className="admin-lead-url" href={lead.statsUrl} target="_blank" rel="noreferrer">
                {lead.statsUrl}
              </a>
            ) : (
              <p className="captain-hint">No stats URL given.</p>
            )}

            {lead.notes ? <p className="admin-lead-notes">“{lead.notes}”</p> : null}

            <div className="admin-lead-actions">
              <a className="admin-lead-mail" href={`mailto:${lead.email}?subject=${encodeURIComponent(`${lead.league} on Afterwhistle`)}`}>
                <Mail size={14} /> {lead.email}
              </a>
              <div className="admin-lead-status">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={lead.status === status ? "active" : undefined}
                    onClick={() => void setStatus(lead.id, status)}
                  >
                    {status}
                  </button>
                ))}
                <button type="button" className="admin-lead-del" onClick={() => void remove(lead.id)} aria-label="Delete lead">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
