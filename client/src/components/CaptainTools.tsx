import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer, RotateCcw, Search, X } from "lucide-react";
import { getPlayers, getSeasons, peekSeasonPlayers } from "../api";
import { BrandMark } from "../league/BrandMark";
import { useLeague, usePresentation } from "../league/LeagueProvider";
import { toTradingCard } from "../lib/cards";
import {
  defaultSlots,
  emptySlots,
  resolveLineItems,
  SLOT_COUNT,
  type PlayerOverrides,
  type SlotKey,
  type SlotOverride,
  type StatSlot
} from "../lib/cardStats";
import { loadCaptainSession, saveCaptainSession } from "../lib/captainSession";
import { filterAndSortPlayers } from "../lib/query";
import { trackClick, trackDrawerClose, trackEvent, trackFilter, trackPageView } from "../lib/analytics";
import { useDebouncedSearchTrack } from "../lib/useDebouncedSearchTrack";
import { usePrintCards } from "../lib/usePrintCards";
import type { Player, PlayersResponse, SeasonInfo } from "../types";
import { PrintSheet } from "./PrintSheet";
import { TradingCard } from "./TradingCard";

function goLeague() {
  trackClick("league_stats", { from: "captain_tools" });
  window.location.assign("/");
}

export function CaptainTools() {
  const league = useLeague();
  const presentation = usePresentation();
  const stored = useMemo(() => loadCaptainSession(league.slug), [league.slug]);
  const [data, setData] = useState<PlayersResponse | null>(null);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [season, setSeason] = useState(league.publicSeason);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<StatSlot[]>(stored.slots);
  const [overrides, setOverrides] = useState<Record<string, PlayerOverrides>>(stored.overrides);
  const [defaultNote, setDefaultNote] = useState(stored.defaultNote);
  const [notes, setNotes] = useState<Record<string, string>>(stored.notes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { printCards, requestPrint } = usePrintCards();
  const printCtx = { league: league.slug, season, tab: "captain_tools" };

  useDebouncedSearchTrack(search, league.slug, "captain_tools", season, Boolean(search.trim()));

  useEffect(() => {
    trackPageView("/captain-tools", `${league.name} · Captain tools`);
  }, [league.name]);

  useEffect(() => {
    getSeasons()
      .then((result) => {
        setSeasons(result.seasons);
        setSeason((current) =>
          result.seasons.some((item) => item.year === current) ? current : result.defaultSeason
        );
      })
      .catch(() => {
        setSeasons([{ year: league.publicSeason, label: `${league.publicSeason} Season`, slug: "" }]);
      });
  }, [league.publicSeason, league.slug]);

  useEffect(() => {
    let cancelled = false;
    const cached = peekSeasonPlayers(season);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }

    getPlayers(season)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load players");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [season, league.slug]);

  useEffect(() => {
    saveCaptainSession({ slots, overrides, defaultNote, notes }, league.slug);
  }, [slots, overrides, defaultNote, notes, league.slug]);

  const players = useMemo(
    () =>
      filterAndSortPlayers(data?.players ?? [], {
        search,
        team,
        sort: presentation.sortOptions[0]?.key ?? "totalPoints"
      }),
    [data?.players, search, team, presentation.sortOptions]
  );

  const selected = players.find((player) => player.id === selectedId) ?? null;

  function cardFor(player: Player) {
    const personal = (notes[player.id] ?? "").trim() || defaultNote.trim();
    return toTradingCard(player, season, data?.meta.teamLogos, {
      lineItems: resolveLineItems(player, slots, overrides[player.id], presentation.cardOptions),
      note: personal
    });
  }

  function updateSlot(index: number, patch: Partial<StatSlot>) {
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function setSlotKey(index: number, key: SlotKey) {
    updateSlot(index, {
      key,
      customLabel: key === "custom" ? slots[index]?.customLabel ?? "" : "",
      customValue: key === "custom" ? slots[index]?.customValue ?? "" : ""
    });
  }

  function setOverride(playerId: string, index: number, patch: SlotOverride) {
    setOverrides((current) => {
      const existing = { ...(current[playerId] ?? {}) };
      const merged = { ...existing[index], ...patch };
      const label = merged.label ?? "";
      const value = merged.value ?? "";
      if (!label.trim() && value === "") {
        delete existing[index];
      } else {
        existing[index] = { label, value };
      }
      if (!Object.keys(existing).length) {
        const { [playerId]: _drop, ...rest } = current;
        return rest;
      }
      return { ...current, [playerId]: existing };
    });
  }

  function clearPlayer(playerId: string) {
    setOverrides((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
    setNotes((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
  }

  function clearPlayerEdits() {
    setOverrides({});
    setNotes({});
  }

  function toggleCard(player: Player) {
    const opening = player.id !== selectedId;
    trackEvent("captain_card_select", {
      league: league.slug,
      player_id: player.id,
      action: opening ? "open" : "close"
    });
    setSelectedId(opening ? player.id : null);
  }

  function closeEditor() {
    trackDrawerClose("captain_editor", { league: league.slug, player_id: selectedId ?? "" });
    setSelectedId(null);
  }

  function setPlayerNote(playerId: string, value: string) {
    setNotes((current) => {
      if (!value.trim()) {
        const { [playerId]: _drop, ...rest } = current;
        return rest;
      }
      return { ...current, [playerId]: value };
    });
  }

  return (
    <>
      <div className={`app-shell captain-tools${selected ? " detail-open" : ""}`}>
        <header className="topbar">
          <BrandMark subtitle="CAPTAIN TOOLS · SESSION ONLY" />
          <nav>
            <button type="button" onClick={goLeague}>
              League stats
            </button>
            <button type="button" className="active">
              Cards
            </button>
          </nav>
          <label className="season-pill">
            <span className="season-pill-label">Season</span>
            <select
              value={season}
              onChange={(event) => {
                trackFilter("season", event.target.value, { league: league.slug, tab: "captain_tools", season });
                setSeason(event.target.value);
              }}
            >
              {(seasons.length ? seasons : [{ year: season, label: `${season} Season` }]).map((item) => (
                <option key={item.year} value={item.year}>
                  {item.year}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="page-grid">
          <aside className="sidebar">
            <div className="eyebrow">ROSTER</div>
            <label className="search-box">
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players…" />
            </label>
            <label className="field-label">Team</label>
            <select
              value={team}
              onChange={(event) => {
                trackFilter("team", event.target.value || "all", { league: league.slug, tab: "captain_tools", season });
                setTeam(event.target.value);
              }}
            >
              <option value="">All teams</option>
              {(data?.meta.teams ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <div className="eyebrow" style={{ marginTop: 28 }}>
              STAT SLOTS
            </div>
            <p className="captain-hint">
              Pick five SportsPress stats, or Custom to type a label and number. Click a card to override one player.
              Closes with this tab.
            </p>
            {slots.map((slot, index) => (
              <div className="captain-slot" key={`slot-${index}`}>
                <label>
                  Slot {index + 1}
                  <select
                    value={slot.key}
                    onChange={(event) => {
                      const key = event.target.value as SlotKey;
                      trackEvent("captain_slot_change", { league: league.slug, slot_index: index + 1, stat_key: key });
                      setSlotKey(index, key);
                    }}
                  >
                    <option value="custom">Custom / write-in</option>
                    {presentation.cardOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.short} · {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {slot.key === "custom" ? (
                  <div className="captain-custom-row">
                    <input
                      value={slot.customLabel}
                      maxLength={8}
                      placeholder="Label"
                      onChange={(event) => updateSlot(index, { customLabel: event.target.value })}
                    />
                    <input
                      value={slot.customValue}
                      maxLength={16}
                      placeholder="Value"
                      onChange={(event) => updateSlot(index, { customValue: event.target.value })}
                    />
                  </div>
                ) : null}
              </div>
            ))}
            <div className="captain-slot-actions">
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  trackEvent("captain_slots_reset", { league: league.slug, mode: "default" });
                  setSlots(defaultSlots(presentation.cardDefaults));
                }}
              >
                <RotateCcw size={14} /> Default stats
              </button>
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  trackEvent("captain_slots_reset", { league: league.slug, mode: "blank" });
                  setSlots(emptySlots());
                }}
              >
                Blank write-in
              </button>
            </div>

            <label className="field-label">Personal line</label>
            <p className="captain-hint">
              Shown on every card unless you write something else for one player. Leave empty for handwriting room.
            </p>
            <textarea
              className="captain-note-input"
              rows={2}
              maxLength={80}
              value={defaultNote}
              placeholder="e.g. Heart of the Yetis"
              onChange={(event) => setDefaultNote(event.target.value)}
            />
          </aside>

          <main>
            <div className="page-heading">
              <div>
                <button type="button" className="back-link" onClick={goLeague}>
                  <ArrowLeft size={15} /> League stats
                </button>
                <h1>Print shop</h1>
                <p>
                  {players.length} cards
                  {team ? ` · ${team}` : ""}
                  {search ? ` · “${search}”` : ""} · 9 per page · session only
                </p>
              </div>
              <div className="heading-actions">
                {(Object.keys(overrides).length > 0 || Object.keys(notes).length > 0) && (
                  <button type="button" className="text-action" onClick={() => {
                    trackEvent("captain_edits_clear", { league: league.slug, scope: "all" });
                    clearPlayerEdits();
                  }}>
                    Clear player edits
                  </button>
                )}
                {players.length > 0 && (
                  <button type="button" className="print-action" onClick={() => requestPrint(players.map(cardFor), { ...printCtx, source: "captain_bulk" })}>
                    <Printer size={15} />
                    Print {players.length === 1 ? "1 card" : `${players.length} cards`}
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="error-card">
                <strong>{league.copy.loadErrorTitle}</strong>
                <span>{error}</span>
              </div>
            )}
            {loading && <div className="loading">Loading {season}…</div>}
            {!loading && (
              <div className="trading-card-grid">
                {players.map((player) => (
                  <TradingCard
                    key={player.id}
                    card={cardFor(player)}
                    selected={selected?.id === player.id}
                    onSelect={() => toggleCard(player)}
                  />
                ))}
              </div>
            )}
            {!loading && players.length === 0 && (
              <div className="empty">
                No players match{search ? ` “${search}”` : ""}
                {team ? `${search ? " on" : ""} ${team}` : ""} in {season}.
              </div>
            )}
          </main>

          {selected && (
            <aside className="detail-panel captain-editor">
              <button type="button" className="icon-button close" onClick={closeEditor} aria-label="Close">
                <X size={20} />
              </button>
              <div className="eyebrow">Write-in</div>
              <h2>{selected.name}</h2>
              <p className="captain-hint">
                Leave a field blank to keep the preset. These edits stay in this tab only.
              </p>
              <TradingCard card={cardFor(selected)} />
              <label className="field-label">Personal note</label>
              <textarea
                className="captain-note-input"
                rows={3}
                maxLength={80}
                value={notes[selected.id] ?? ""}
                placeholder={defaultNote.trim() || "Write something personal, or leave blank to handwrite"}
                onChange={(event) => setPlayerNote(selected.id, event.target.value)}
              />
              {Array.from({ length: SLOT_COUNT }, (_, index) => {
                const live = resolveLineItems(selected, slots, {}, presentation.cardOptions)[index];
                const override = overrides[selected.id]?.[index];
                return (
                  <div className="captain-edit-row" key={`edit-${selected.id}-${index}`}>
                    <span>Slot {index + 1}</span>
                    <input
                      value={override?.label ?? ""}
                      maxLength={8}
                      placeholder={live?.label || "Label"}
                      onChange={(event) => setOverride(selected.id, index, { label: event.target.value, value: override?.value ?? "" })}
                    />
                    <input
                      value={override?.value ?? ""}
                      maxLength={16}
                      placeholder={live?.value || "Value"}
                      onChange={(event) => setOverride(selected.id, index, { label: override?.label ?? "", value: event.target.value })}
                    />
                  </div>
                );
              })}
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  trackEvent("captain_edits_clear", { league: league.slug, scope: "player", player_id: selected.id });
                  clearPlayer(selected.id);
                }}
              >
                <RotateCcw size={14} /> Reset this player
              </button>
              <button
                type="button"
                className="print-action detail-print"
                onClick={() => requestPrint([cardFor(selected)], { ...printCtx, source: "captain_single" })}
              >
                <Printer size={14} /> Print this card
              </button>
            </aside>
          )}
        </div>
      </div>
      <PrintSheet cards={printCards ?? []} />
    </>
  );
}
