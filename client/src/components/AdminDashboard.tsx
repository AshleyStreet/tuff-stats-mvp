import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ExternalLink, Plus, Radar, Save } from "lucide-react";
import type { AdminTenant, LeagueBranding, LeagueCopy, SourceProbeResult } from "../league/types";
import { trackClick, trackEvent, trackExternalLink } from "../lib/analytics";

const TOKEN_KEY = "admin-token";

type Draft = {
  slug: string;
  name: string;
  shortName: string;
  publicSeason: string;
  hostnames: string;
  sourceUrl: string;
  adapter: "fixture" | "sportspress";
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
};

const emptyDraft: Draft = {
  slug: "",
  name: "",
  shortName: "",
  publicSeason: "2026",
  hostnames: "",
  sourceUrl: "",
  adapter: "fixture",
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
  whiteLabel: false
};

function tokenHeaders(token: string) {
  return { "Content-Type": "application/json", "x-admin-token": token };
}

function tenantOrigin(hostname: string) {
  const { protocol, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}/`;
}

function toDraft(tenant: AdminTenant): Draft {
  return {
    slug: tenant.slug,
    name: tenant.name,
    shortName: tenant.shortName,
    publicSeason: tenant.publicSeason,
    hostnames: tenant.hostnames.join("\n"),
    sourceUrl: tenant.sourceOrigin ?? "",
    adapter: tenant.adapter === "sportspress" ? "sportspress" : "fixture",
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
    whiteLabel: tenant.whiteLabel
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
    ...(creating && draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}),
    ...(creating && probe?.source ? { source: probe.source } : {}),
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

  const selected = useMemo(
    () => (selectedSlug && selectedSlug !== "new" ? tenants.find((item) => item.slug === selectedSlug) : undefined),
    [selectedSlug, tenants]
  );
  const creating = selectedSlug === "new";

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
              <button type="submit" className="admin-save" disabled={saving}>
                <Save size={16} /> {saving ? "Saving…" : "Save"}
              </button>
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
                      <option value="fixture">Fixture (demo data)</option>
                    </select>
                  </label>
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
                <input type="text" value={draft.primaryColor} onChange={(event) => setDraft({ ...draft, primaryColor: event.target.value })} />
              </label>
              <label className="field-label">
                Secondary color
                <input type="text" value={draft.secondaryColor} onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })} />
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
              Paste a league URL and click Detect source to auto-fill SportsPress settings, or pick fixture mode for a branded demo.
              This never writes back to a league’s own system.
              {selected?.builtIn ? " Built-in ingest URLs and adapter cannot be changed here." : ""}
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
