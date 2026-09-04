import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ExternalLink, Plus, Radar, RefreshCw, Save, Trash2 } from "lucide-react";
import type {
  AdminTenant,
  AdminTenantStatus,
  DeleteTenantResult,
  LeagueBranding,
  LeagueCopy,
  SourceProbeResult
} from "../league/types";
import { trackClick, trackEvent, trackExternalLink } from "../lib/analytics";

const TOKEN_KEY = "admin-token";
/** Mirrors the format server/src/leagues/store.ts's HOST_RE enforces. */
const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const HEX6_RE = /^#[0-9a-f]{6}$/i;

type Draft = {
  slug: string;
  name: string;
  shortName: string;
  publicSeason: string;
  hostnames: string;
  sourceUrl: string;
  adapter: "fixture" | "sportspress" | "csv";
  csvPlayersUrl: string;
  csvStandingsUrl: string;
  csvScheduleUrl: string;
  sport: string;
  logo: string;
  logoAlt: string;
  primaryColor: string;
  secondaryColor: string;
  documentTitle: string;
  tagline: string;
  loadErrorTitle: string;
  profileLinkLabel: string;
  recapLinkLabel: string;
  htmlSourceLabel: string;
  franchiseTeamNames: string;
  whiteLabel: boolean;
  /** Write-only: never populated from the server. Blank + unchecked clear = leave unchanged. */
  refreshToken: string;
  clearRefreshToken: boolean;
};

const emptyDraft: Draft = {
  slug: "",
  name: "",
  shortName: "",
  publicSeason: "2026",
  hostnames: "",
  sourceUrl: "",
  adapter: "fixture",
  csvPlayersUrl: "",
  csvStandingsUrl: "",
  csvScheduleUrl: "",
  sport: "flag-football",
  logo: "/harbor-logo.svg",
  logoAlt: "",
  primaryColor: "#0e7c7b",
  secondaryColor: "#e8c547",
  documentTitle: "",
  tagline: "",
  loadErrorTitle: "",
  profileLinkLabel: "",
  recapLinkLabel: "",
  htmlSourceLabel: "",
  franchiseTeamNames: "",
  whiteLabel: false,
  refreshToken: "",
  clearRefreshToken: false
};

function tokenHeaders(token: string) {
  return { "Content-Type": "application/json", "x-admin-token": token };
}

function tenantOrigin(hostname: string) {
  const { protocol, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}/`;
}

function hostnameLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeColorValue(hex: string): string {
  return HEX6_RE.test(hex.trim()) ? hex.trim() : "#000000";
}

function slugifyTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Builds the LeagueSourceConfig shape the server expects for adapter: "csv" — most fields are unused by that adapter but required by the shared type. */
function buildCsvSource(draft: Draft) {
  const teams = draft.franchiseTeamNames
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    origin: "",
    statsUrl: "",
    userAgent: `${draft.slug.trim() || "csv"}-csv/0.1`,
    defaultStatsListSuffix: "stats",
    statsListTokens: [],
    excludeStatsSlugs: [],
    standings: {
      modernFromYear: Number(draft.publicSeason.trim()) || new Date().getFullYear(),
      modern: [],
      legacy: []
    },
    modernTeamSlugs: teams.map(slugifyTeam),
    franchiseTeamNames: teams,
    csv: {
      playersUrl: draft.csvPlayersUrl.trim(),
      standingsUrl: draft.csvStandingsUrl.trim() || undefined,
      scheduleUrl: draft.csvScheduleUrl.trim() || undefined
    }
  };
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function toDraft(tenant: AdminTenant): Draft {
  return {
    slug: tenant.slug,
    name: tenant.name,
    shortName: tenant.shortName,
    publicSeason: tenant.publicSeason,
    hostnames: tenant.hostnames.join("\n"),
    sourceUrl: tenant.sourceOrigin ?? "",
    adapter: tenant.adapter === "sportspress" ? "sportspress" : tenant.adapter === "csv" ? "csv" : "fixture",
    csvPlayersUrl: "",
    csvStandingsUrl: "",
    csvScheduleUrl: "",
    sport: tenant.sport,
    logo: tenant.branding.logo,
    logoAlt: tenant.branding.logoAlt,
    primaryColor: tenant.branding.primaryColor,
    secondaryColor: tenant.branding.secondaryColor,
    documentTitle: tenant.copy.documentTitle,
    tagline: tenant.copy.tagline,
    loadErrorTitle: tenant.copy.loadErrorTitle,
    profileLinkLabel: tenant.copy.profileLinkLabel,
    recapLinkLabel: tenant.copy.recapLinkLabel,
    htmlSourceLabel: tenant.copy.htmlSourceLabel,
    franchiseTeamNames: tenant.franchiseTeamNames.join(", "),
    whiteLabel: tenant.whiteLabel,
    refreshToken: "",
    clearRefreshToken: false
  };
}

function payloadFromDraft(
  draft: Draft,
  creating: boolean,
  probe?: SourceProbeResult | null
) {
  const branding: LeagueBranding = {
    logo: draft.logo.trim(),
    logoAlt: draft.logoAlt.trim() || draft.name.trim(),
    primaryColor: draft.primaryColor.trim(),
    secondaryColor: draft.secondaryColor.trim()
  };
  const copy: LeagueCopy = {
    documentTitle: draft.documentTitle.trim() || `${draft.shortName.trim()} Stats · Flag Football`,
    tagline: draft.tagline.trim() || draft.name.trim().toUpperCase(),
    loadErrorTitle: draft.loadErrorTitle.trim() || `Couldn’t load ${draft.shortName.trim()}.`,
    profileLinkLabel: draft.profileLinkLabel.trim() || `Open original ${draft.shortName.trim()} profile`,
    recapLinkLabel: draft.recapLinkLabel.trim() || `Open original ${draft.shortName.trim()} recap`,
    htmlSourceLabel: draft.htmlSourceLabel.trim() || `${draft.shortName.trim()} table`
  };
  return {
    ...(creating ? { slug: draft.slug.trim().toLowerCase() } : {}),
    name: draft.name.trim(),
    shortName: draft.shortName.trim(),
    publicSeason: draft.publicSeason.trim(),
    hostnames: draft.hostnames
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
    branding,
    copy,
    adapter: draft.adapter,
    sport: draft.sport,
    whiteLabel: draft.whiteLabel,
    // Omit the key entirely when neither field was touched, so saving doesn't
    // accidentally clear an existing token the admin never meant to change.
    ...(draft.clearRefreshToken
      ? { refreshToken: "" }
      : draft.refreshToken.trim()
        ? { refreshToken: draft.refreshToken.trim() }
        : {}),
    ...(creating && draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}),
    ...(creating && draft.adapter === "csv"
      ? draft.csvPlayersUrl.trim()
        ? { source: buildCsvSource(draft) }
        : {}
      : creating && probe?.source
        ? { source: probe.source }
        : {}),
    ...(creating || draft.franchiseTeamNames.trim()
      ? { franchiseTeamNames: draft.franchiseTeamNames.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) }
      : {})
  };
}

function goLeague() {
  trackClick("league_stats", { from: "admin" });
  window.location.assign("/");
}

export function AdminDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<SourceProbeResult | null>(null);
  const [status, setStatus] = useState<AdminTenantStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selected = useMemo(
    () => (selectedSlug && selectedSlug !== "new" ? tenants.find((item) => item.slug === selectedSlug) : undefined),
    [selectedSlug, tenants]
  );
  const creating = selectedSlug === "new";

  const draftHostnames = useMemo(() => hostnameLines(draft.hostnames), [draft.hostnames]);
  const invalidHostnames = useMemo(
    () => draftHostnames.filter((host) => !HOSTNAME_RE.test(host)),
    [draftHostnames]
  );
  const hasAfterwhistleAlias = useMemo(
    () => draftHostnames.some((host) => host.toLowerCase().endsWith(".afterwhistle.ca")),
    [draftHostnames]
  );

  function addAfterwhistleAlias() {
    const slug = draft.slug.trim().toLowerCase();
    if (!slug) return;
    const next = draft.hostnames.trim() ? `${draft.hostnames.trim()}\n${slug}.afterwhistle.ca` : `${slug}.afterwhistle.ca`;
    setDraft({ ...draft, hostnames: next });
  }

  async function loadTenants(nextToken = token) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/tenants", { headers: tokenHeaders(nextToken) });
      if (response.status === 503) {
        setConfigured(false);
        setTenants([]);
        return;
      }
      setConfigured(true);
      if (response.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken("");
        setTenants([]);
        setError("That token was not accepted.");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not load tenants");
      }
      const body = (await response.json()) as { tenants: AdminTenant[] };
      setTenants(body.tenants);
      if (!selectedSlug && body.tenants[0]) {
        setSelectedSlug(body.tenants[0].slug);
        setDraft(toDraft(body.tenants[0]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenants");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void loadTenants(token);
    else void fetch("/api/admin/tenants").then((response) => {
      if (response.status === 503) setConfigured(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStatus(slug: string) {
    setStatusLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${slug}/status`, { headers: tokenHeaders(token) });
      setStatus(response.ok ? ((await response.json()) as AdminTenantStatus) : null);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !selectedSlug || selectedSlug === "new") {
      setStatus(null);
      return;
    }
    void loadStatus(selectedSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug, token]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    const next = tokenInput.trim();
    sessionStorage.setItem(TOKEN_KEY, next);
    setToken(next);
    trackEvent("admin_sign_in", { success: true });
    void loadTenants(next);
  }

  function selectTenant(tenant: AdminTenant) {
    trackEvent("admin_tenant_select", { tenant_slug: tenant.slug });
    setSelectedSlug(tenant.slug);
    setDraft(toDraft(tenant));
    setNotice(null);
    setError(null);
  }

  function startCreate() {
    trackEvent("admin_tenant_create_start", {});
    setSelectedSlug("new");
    setDraft({
      ...emptyDraft,
      hostnames: ""
    });
    setProbe(null);
    setNotice(null);
    setError(null);
  }

  async function detectSource() {
    const url = draft.sourceUrl.trim();
    if (!url) {
      setError("Enter a league website URL first.");
      return;
    }
    setProbing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/probe", {
        method: "POST",
        headers: tokenHeaders(token),
        body: JSON.stringify({ url })
      });
      const body = (await response.json().catch(() => null)) as { probe?: SourceProbeResult; error?: string } | null;
      if (!response.ok || !body?.probe) throw new Error(body?.error ?? "Could not probe that URL");
      const result = body.probe;
      setProbe(result);
      trackEvent("admin_probe", {
        success: true,
        adapter: result.adapter,
        sportspress_live: result.sportspressLive
      });
      setDraft((current) => ({
        ...current,
        slug: current.slug.trim() || result.suggestedSlug,
        name: result.suggestedName,
        shortName: result.suggestedShortName,
        publicSeason: result.publicSeason,
        hostnames: result.hostnames.join("\n"),
        adapter: result.adapter,
        sport: result.sport,
        franchiseTeamNames: result.franchiseTeamNames.join(", ")
      }));
      setNotice(
        result.sportspressLive
          ? `Detected live SportsPress (${result.seasons.length} seasons, ${result.tables.length} tables).`
          : result.sportspress
            ? "SportsPress found but no live data yet — fixture mode unless you force SportsPress."
            : "No SportsPress detected — fixture demo tenant."
      );
    } catch (err) {
      trackEvent("admin_probe", { success: false });
      setError(err instanceof Error ? err.message : "Probe failed");
    } finally {
      setProbing(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = payloadFromDraft(draft, creating, probe);
      if (creating && !payload.hostnames?.length && draft.slug.trim()) {
        payload.hostnames = [`${draft.slug.trim().toLowerCase()}.localhost`];
      }
      const response = await fetch(creating ? "/api/admin/tenants" : `/api/admin/tenants/${selectedSlug}`, {
        method: creating ? "POST" : "PUT",
        headers: tokenHeaders(token),
        body: JSON.stringify(payload)
      });
      const body = (await response.json().catch(() => null)) as { tenant?: AdminTenant; error?: string } | null;
      if (!response.ok || !body?.tenant) throw new Error(body?.error ?? "Save failed");
      const saved = body.tenant;
      setTenants((current) => {
        const without = current.filter((item) => item.slug !== saved.slug);
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedSlug(saved.slug);
      setDraft(toDraft(saved));
      trackEvent("admin_tenant_save", { tenant_slug: saved.slug, creating });
      setNotice("Saved. Open the tenant host to see it live.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function forceRefresh() {
    if (!selectedSlug || creating) return;
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      // A tenant with its own refresh token rejects the platform sign-in token — use whatever's
      // typed in the refresh-token field above if present, so this doubles as a way to test it.
      const refreshAuth = draft.refreshToken.trim() || token;
      const response = await fetch(`/api/admin/tenants/${selectedSlug}/refresh`, {
        method: "POST",
        headers: tokenHeaders(refreshAuth)
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; refreshed?: string[]; failed?: string[]; error?: string }
        | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "Refresh failed");
      trackEvent("admin_tenant_refresh", { tenant_slug: selectedSlug });
      setNotice(
        body.refreshed?.length
          ? `Refreshed: ${body.refreshed.join(", ")}${body.failed?.length ? ` (failed: ${body.failed.join(", ")})` : ""}`
          : "Refresh ran, but no seasons changed."
      );
      await loadStatus(selectedSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function deleteOrReset() {
    if (!selectedSlug || creating || !selected) return;
    const builtIn = selected.builtIn;
    const confirmed = window.confirm(
      builtIn
        ? `Reset ${selected.name} to its built-in defaults? Custom branding, hostnames, and refresh token will be cleared.`
        : `Delete ${selected.name}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/tenants/${selectedSlug}`, {
        method: "DELETE",
        headers: tokenHeaders(token)
      });
      const body = (await response.json().catch(() => null)) as DeleteTenantResult | { error?: string } | null;
      if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? "Delete failed");
      const result = body as DeleteTenantResult;
      trackEvent("admin_tenant_delete", { tenant_slug: selectedSlug, reset: result.reset });

      if (result.tenant) {
        const updated = result.tenant;
        setTenants((current) => current.map((item) => (item.slug === updated.slug ? updated : item)));
        setDraft(toDraft(updated));
        setNotice(result.reset ? "Reset to built-in defaults." : "No customizations to reset.");
      } else {
        const remaining = tenants.filter((item) => item.slug !== selectedSlug);
        setTenants(remaining);
        if (remaining[0]) {
          setSelectedSlug(remaining[0].slug);
          setDraft(toDraft(remaining[0]));
        } else {
          setSelectedSlug(null);
          setDraft(emptyDraft);
        }
        setNotice("Tenant deleted.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const previewStyle = {
    ["--red" as string]: draft.primaryColor || "#0e7c7b",
    ["--gold" as string]: draft.secondaryColor || "#e8c547"
  };

  if (!configured) {
    return (
      <div className="app-shell admin-shell">
        <header className="topbar">
          <div className="brand">
            <div>
              <strong>ADMIN</strong>
              <span>TENANT DASHBOARD</span>
            </div>
          </div>
          <nav>
            <button type="button" onClick={goLeague}>
              League stats
            </button>
            <button type="button" className="active">
              Admin
            </button>
          </nav>
        </header>
        <main className="admin-main">
          <div className="empty-state">
            <h1>Admin is not configured</h1>
            <p>Set ADMIN_TOKEN on the server, then reload this page.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="app-shell admin-shell">
        <header className="topbar">
          <div className="brand">
            <div>
              <strong>ADMIN</strong>
              <span>TENANT DASHBOARD</span>
            </div>
          </div>
          <nav>
            <button type="button" onClick={goLeague}>
              League stats
            </button>
            <button type="button" className="active">
              Admin
            </button>
          </nav>
        </header>
        <main className="admin-main">
          <form className="admin-login" onSubmit={signIn}>
            <h1>Sign in</h1>
            <p>Use the server ADMIN_TOKEN. It is stored in this tab only.</p>
            {error ? <p className="admin-error">{error}</p> : null}
            <label className="field-label">
              Admin token
              <input
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="admin-save">
              Continue
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell admin-shell">
      <header className="topbar">
        <div className="brand">
          <div>
            <strong>ADMIN</strong>
            <span>BRANDING · TENANTS</span>
          </div>
        </div>
        <nav>
          <button type="button" onClick={goLeague}>
            <ArrowLeft size={16} /> League stats
          </button>
          <button type="button" className="active">
            Admin
          </button>
        </nav>
      </header>

      <div className="page-grid admin-grid">
        <aside className="sidebar">
          <div className="eyebrow">TENANTS</div>
          {loading ? <p className="captain-hint">Loading…</p> : null}
          {tenants.map((tenant) => (
            <button
              key={tenant.slug}
              type="button"
              className={`admin-tenant-btn${tenant.slug === selectedSlug ? " active" : ""}`}
              onClick={() => selectTenant(tenant)}
            >
              <strong>{tenant.shortName}</strong>
              <span>{tenant.builtIn ? "Built-in" : "Created"} · {tenant.adapter}</span>
            </button>
          ))}
          <button type="button" className="admin-new" onClick={startCreate}>
            <Plus size={16} /> New tenant
          </button>
        </aside>

        <main>
          <form className="admin-form" onSubmit={save}>
            <div className="section-head">
              <div>
                <p className="eyebrow">{creating ? "CREATE" : selected?.builtIn ? "BUILT-IN" : "CREATED"}</p>
                <h1>{creating ? "New tenant" : draft.name || "Tenant"}</h1>
              </div>
              <div className="admin-section-actions">
                {!creating && selected ? (
                  <button
                    type="button"
                    className="admin-danger"
                    onClick={() => void deleteOrReset()}
                    disabled={deleting}
                  >
                    <Trash2 size={16} /> {deleting ? "Working…" : selected.builtIn ? "Reset to defaults" : "Delete tenant"}
                  </button>
                ) : null}
                <button type="submit" className="admin-save" disabled={saving}>
                  <Save size={16} /> {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {error ? <p className="admin-error">{error}</p> : null}
            {notice ? <p className="admin-notice">{notice}</p> : null}

            <div className="admin-preview" style={previewStyle}>
              <div className="brand">
                {draft.logo ? <img className="brand-logo" src={draft.logo} alt={draft.logoAlt || draft.name} /> : null}
                <div>
                  <strong>{draft.shortName || "SHORT"}</strong>
                  <span>{draft.tagline || "TAGLINE"}</span>
                </div>
              </div>
              {draft.hostnames.trim() ? (
                <a
                  className="admin-open"
                  href={tenantOrigin(draft.hostnames.split(/[\n,]/)[0]!.trim())}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackExternalLink("admin_tenant", { tenant_slug: draft.slug || selectedSlug || "" })
                  }
                >
                  Open this host <ExternalLink size={14} />
                </a>
              ) : null}
            </div>

            {!creating && selected ? (
              <div className="admin-status">
                <div className="admin-status-head">
                  <strong>Status</strong>
                  <button
                    type="button"
                    className="admin-refresh"
                    onClick={() => void forceRefresh()}
                    disabled={refreshing}
                  >
                    <RefreshCw size={14} className={refreshing ? "spin" : undefined} />
                    {refreshing ? "Refreshing…" : "Force refresh"}
                  </button>
                </div>
                {statusLoading ? (
                  <p className="captain-hint">Loading status…</p>
                ) : status ? (
                  <>
                    <div className="admin-status-row">
                      <span className={`admin-status-pill admin-status-${status.warm.status}`}>{status.warm.status}</span>
                      <span>{status.cache.seasonsCached} season(s) cached</span>
                      <span>{status.cache.profilesCached} profile(s) cached</span>
                    </div>
                    {status.cache.seasons.length ? (
                      <ul className="admin-status-seasons">
                        {[...status.cache.seasons]
                          .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
                          .slice(0, 3)
                          .map((season) => (
                            <li key={season.year}>
                              {season.year} · {season.playerCount} players · fetched {relativeTime(season.fetchedAt)}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <p className="captain-hint">Status unavailable.</p>
                )}
                <p className="captain-hint">Uses the refresh token above if set, otherwise your sign-in token.</p>
              </div>
            ) : null}

            <div className="admin-fields">
              {creating ? (
                <>
                  <label className="field-label admin-span">
                    Source website URL
                    <div className="admin-probe-row">
                      <input
                        value={draft.sourceUrl}
                        onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
                        placeholder="https://bushleaguetoronto.ca"
                      />
                      <button type="button" className="admin-save" onClick={() => void detectSource()} disabled={probing}>
                        <Radar size={16} /> {probing ? "Detecting…" : "Detect source"}
                      </button>
                    </div>
                  </label>
                  {probe ? (
                    <div className="admin-probe-summary admin-span">
                      <strong>{probe.sportspressLive ? "SportsPress live" : probe.sportspress ? "SportsPress empty" : "No SportsPress"}</strong>
                      <span>
                        {probe.origin} · {probe.seasons.length} seasons · {probe.tables.length} tables · {probe.lists.length} lists
                      </span>
                      {probe.warnings.map((warning) => (
                        <span key={warning} className="admin-probe-warning">
                          {warning}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <label className="field-label">
                    Adapter
                    <select
                      value={draft.adapter}
                      onChange={(event) =>
                        setDraft({ ...draft, adapter: event.target.value as Draft["adapter"] })
                      }
                    >
                      <option value="sportspress">SportsPress (live ingest)</option>
                      <option value="csv">CSV (spreadsheet ingest)</option>
                      <option value="fixture">Fixture (demo data)</option>
                    </select>
                  </label>
                  {draft.adapter === "csv" ? (
                    <>
                      <label className="field-label admin-span">
                        Players CSV URL
                        <input
                          value={draft.csvPlayersUrl}
                          onChange={(event) => setDraft({ ...draft, csvPlayersUrl: event.target.value })}
                          placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"
                          required
                        />
                      </label>
                      <label className="field-label admin-span">
                        Standings CSV URL (optional)
                        <input
                          value={draft.csvStandingsUrl}
                          onChange={(event) => setDraft({ ...draft, csvStandingsUrl: event.target.value })}
                          placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"
                        />
                      </label>
                      <label className="field-label admin-span">
                        Schedule CSV URL (optional)
                        <input
                          value={draft.csvScheduleUrl}
                          onChange={(event) => setDraft({ ...draft, csvScheduleUrl: event.target.value })}
                          placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"
                        />
                      </label>
                      <p className="captain-hint admin-span">
                        Each URL is a published spreadsheet export (Google Sheets: File → Share → Publish to web →
                        CSV). One row per season — add a "season" column to hold multiple years in one sheet.
                      </p>
                    </>
                  ) : null}
                  <label className="field-label">
                    Sport
                    <select value={draft.sport} onChange={(event) => setDraft({ ...draft, sport: event.target.value })}>
                      <option value="flag-football">Flag football</option>
                      <option value="softball">Softball</option>
                      <option value="soccer">Soccer</option>
                    </select>
                  </label>
                </>
              ) : selected?.sourceOrigin ? (
                <p className="captain-hint admin-span">
                  Ingest origin: {selected.sourceOrigin} · {selected.adapter}
                </p>
              ) : null}
              <label className="field-label">
                Slug
                <input
                  value={draft.slug}
                  disabled={!creating}
                  onChange={(event) => {
                    const slug = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                    setDraft((current) => ({
                      ...current,
                      slug,
                      hostnames: current.hostnames.trim() ? current.hostnames : slug ? `${slug}.localhost` : ""
                    }));
                  }}
                  placeholder="river"
                  required={creating}
                />
              </label>
              <label className="field-label">
                Name
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
              </label>
              <label className="field-label">
                Short name
                <input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} required />
              </label>
              <label className="field-label">
                Public season
                <input value={draft.publicSeason} onChange={(event) => setDraft({ ...draft, publicSeason: event.target.value })} />
              </label>
              <label className="field-label admin-span">
                Hostnames (one per line)
                <textarea
                  rows={3}
                  value={draft.hostnames}
                  onChange={(event) => setDraft({ ...draft, hostnames: event.target.value })}
                  placeholder="river.localhost"
                />
              </label>
              {invalidHostnames.length ? (
                <p className="admin-hostname-hint admin-span admin-error">
                  Not a valid hostname: {invalidHostnames.join(", ")}
                </p>
              ) : null}
              {draft.slug.trim() && !hasAfterwhistleAlias ? (
                <button type="button" className="admin-hostname-suggest admin-span" onClick={addAfterwhistleAlias}>
                  + Add {draft.slug.trim()}.afterwhistle.ca
                </button>
              ) : null}
              <label className="field-label">
                Logo URL
                <input value={draft.logo} onChange={(event) => setDraft({ ...draft, logo: event.target.value })} />
              </label>
              <label className="field-label">
                Logo alt
                <input value={draft.logoAlt} onChange={(event) => setDraft({ ...draft, logoAlt: event.target.value })} />
              </label>
              <label className="field-label">
                Primary color
                <div className="admin-color-row">
                  <input
                    type="color"
                    value={safeColorValue(draft.primaryColor)}
                    onChange={(event) => setDraft({ ...draft, primaryColor: event.target.value })}
                  />
                  <input
                    type="text"
                    value={draft.primaryColor}
                    onChange={(event) => setDraft({ ...draft, primaryColor: event.target.value })}
                  />
                </div>
              </label>
              <label className="field-label">
                Secondary color
                <div className="admin-color-row">
                  <input
                    type="color"
                    value={safeColorValue(draft.secondaryColor)}
                    onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })}
                  />
                  <input
                    type="text"
                    value={draft.secondaryColor}
                    onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })}
                  />
                </div>
              </label>
              <label className="field-label admin-span">
                Document title
                <input value={draft.documentTitle} onChange={(event) => setDraft({ ...draft, documentTitle: event.target.value })} />
              </label>
              <label className="field-label admin-span">
                Tagline
                <input value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} />
              </label>
              <label className="captain-check admin-span">
                <input
                  type="checkbox"
                  checked={draft.whiteLabel}
                  onChange={(event) => setDraft({ ...draft, whiteLabel: event.target.checked })}
                />
                White label (Club plan) — hides the "Stats by Afterwhistle" footer badge
              </label>
              <label className="field-label admin-span">
                Refresh token
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.refreshToken}
                  disabled={draft.clearRefreshToken}
                  onChange={(event) => setDraft({ ...draft, refreshToken: event.target.value })}
                  placeholder={
                    !creating && selected?.hasRefreshToken
                      ? "Configured — leave blank to keep it unchanged"
                      : "Leave blank to allow the platform admin token to refresh this tenant"
                  }
                />
              </label>
              {!creating && selected?.hasRefreshToken ? (
                <label className="captain-check admin-span">
                  <input
                    type="checkbox"
                    checked={draft.clearRefreshToken}
                    onChange={(event) =>
                      setDraft({ ...draft, clearRefreshToken: event.target.checked, refreshToken: "" })
                    }
                  />
                  Remove this tenant's refresh token (the platform admin token will refresh it again)
                </label>
              ) : null}
              {(creating || selected?.builtIn === false) && (
                <label className="field-label admin-span">
                  Team names (comma-separated)
                  <input
                    value={draft.franchiseTeamNames}
                    onChange={(event) => setDraft({ ...draft, franchiseTeamNames: event.target.value })}
                    placeholder="Eagles, Foxes"
                  />
                </label>
              )}
            </div>
            <p className="captain-hint">
              Paste a league URL and click Detect source to auto-fill SportsPress settings, or pick CSV / fixture mode for a spreadsheet-backed or branded demo tenant.
              This never writes back to a league’s own system.
              {selected?.builtIn ? " Built-in ingest URLs and adapter cannot be changed here." : ""}
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
