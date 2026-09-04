import type { Lead } from "./store.js";

/**
 * Emails a new lead to whoever runs sales. Uses Resend's HTTP API directly —
 * one fetch, no new dependency. Unconfigured is a supported state: leads are
 * still stored and visible in the admin panel, we just don't push them.
 */
const ENDPOINT = "https://api.resend.com/emails";

export function notifyConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && notifyTo());
}

function notifyTo() {
  return process.env.LEADS_NOTIFY_TO?.trim() || "info@afterwhistle.ca";
}

function notifyFrom() {
  // Must be on a domain verified with Resend, or the send is rejected.
  return process.env.LEADS_NOTIFY_FROM?.trim() || "Afterwhistle <leads@afterwhistle.ca>";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function probeLine(lead: Lead): string {
  const p = lead.probe;
  if (!p) return "<p><em>Source not probed yet.</em></p>";
  if (!p.ok) return `<p><strong>Could not read that URL.</strong> ${escapeHtml(p.error ?? "")}</p>`;
  const bits = [
    p.platformLabel ? `platform: <strong>${escapeHtml(p.platformLabel)}</strong>` : "",
    p.detectedIds ? escapeHtml(Object.entries(p.detectedIds).map(([k, v]) => `${k}=${v}`).join(" ")) : "",
    p.sport ? `sport: ${escapeHtml(p.sport)}` : "",
    p.seasons != null ? `${p.seasons} seasons` : "",
    p.tables != null ? `${p.tables} tables` : "",
    p.lists != null ? `${p.lists} lists` : "",
    p.teams ? `${p.teams} teams` : ""
  ].filter(Boolean);
  return `<p><strong>We can read this.</strong><br>${bits.join(" &middot; ")}</p>`;
}

export async function notifyNewLead(lead: Lead): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };

  const subject = `New league: ${lead.league}${lead.probe?.adapter ? ` (${lead.probe.adapter})` : ""}`;
  const html = `
    <h2>${escapeHtml(lead.league)}</h2>
    <p>
      ${escapeHtml(lead.sport)}<br>
      <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>
    </p>
    ${lead.statsUrl ? `<p>Stats live at:<br><a href="${escapeHtml(lead.statsUrl)}">${escapeHtml(lead.statsUrl)}</a></p>` : "<p>No stats URL given.</p>"}
    ${probeLine(lead)}
    ${lead.notes ? `<p><strong>They said:</strong><br>${escapeHtml(lead.notes)}</p>` : ""}
    <hr>
    <p style="color:#667">Submitted ${escapeHtml(lead.createdAt)} — also in the admin panel under Leads.</p>
  `;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: notifyFrom(),
        to: [notifyTo()],
        reply_to: lead.email,
        subject,
        html
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return { sent: false, reason: `Resend returned ${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "send failed" };
  }
}
