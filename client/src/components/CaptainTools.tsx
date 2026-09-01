import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, Pin, Printer, RotateCcw, Search, X } from "lucide-react";
import { getPlayers, getSeasons, peekSeasonPlayers } from "../api";
import { BrandMark } from "../league/BrandMark";
import { useLeague, usePresentation } from "../league/LeagueProvider";
import { cardTitleLine, DEFAULT_PHOTO_POSITION, normalizeJersey, toTradingCard, type PhotoPosition } from "../lib/cards";
import {
  addSlot,
  canAddSlot,
  canRemoveSlot,
  defaultSlots,
  emptySlots,
  removeSlot,
  resolveLineItems,
  type PlayerOverrides,
  type SlotKey,
  type SlotOverride,
  type StatSlot
} from "../lib/cardStats";
import { cardDownloadName, downloadCardPng } from "../lib/cardExport";
import { readCardPhoto } from "../lib/cardPhoto";
import {
  CARD_TEMPLATES,
  cardTemplate,
  slotsForTemplate,
  type CardTemplateId
} from "../lib/cardTemplates";
import {
  loadCaptainSession,
  normalizePhotoPosition,
  saveCaptainSession,
  type TeamCardColors
} from "../lib/captainSession";
import { filterAndSortPlayers } from "../lib/query";
import { trackClick, trackDrawerClose, trackEvent, trackFilter, trackPageView } from "../lib/analytics";
import { useDebouncedSearchTrack } from "../lib/useDebouncedSearchTrack";
import { usePrintCards } from "../lib/usePrintCards";
import type { Player, PlayersResponse, SeasonInfo } from "../types";
import { PhotoPositionStage } from "./PhotoPositionStage";
import { PrintSheet } from "./PrintSheet";
import { TradingCard } from "./TradingCard";

const DEFAULT_TEAM_COLORS: TeamCardColors = {
  background: "#141414",
  border: "#e31b23"
};

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
  const [team, setTeam] = useState(stored.teamFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<StatSlot[]>(stored.slots);
  const [overrides, setOverrides] = useState<Record<string, PlayerOverrides>>(stored.overrides);
  const [defaultNote, setDefaultNote] = useState(stored.defaultNote);
  const [notes, setNotes] = useState<Record<string, string>>(stored.notes);
  const [photos, setPhotos] = useState<Record<string, string>>(stored.photos);
  const [photoPositions, setPhotoPositions] = useState<Record<string, PhotoPosition>>(stored.photoPositions);
  const [template, setTemplate] = useState<CardTemplateId>(stored.template);
  const [pinned, setPinned] = useState<string[]>(stored.pinned);
  const [pinnedOnly, setPinnedOnly] = useState(stored.pinnedOnly);
  const [teamColors, setTeamColors] = useState<Record<string, TeamCardColors>>(stored.teamColors);
  const [numbers, setNumbers] = useState<Record<string, string>>(stored.numbers);
  const [showTitleLine, setShowTitleLine] = useState(stored.showTitleLine);
  const [colorTeam, setColorTeam] = useState(stored.teamFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const exportCardRef = useRef<HTMLDivElement>(null);
  const { printCards, requestPrint } = usePrintCards();
  const printCtx = { league: league.slug, season, tab: "captain_tools" };
  const activeTemplate = cardTemplate(template);

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
    const result = saveCaptainSession(
      {
        slots,
        overrides,
        defaultNote,
        notes,
        photos,
        photoPositions,
        template,
        pinned,
        pinnedOnly,
        teamFilter: team,
        teamColors,
        numbers,
        showTitleLine
      },
      league.slug
    );
    if (result === "photos-skipped" && Object.keys(photos).length) {
      setPhotoError("Photos are too large to keep in this tab. They'll stay until you refresh.");
    }
  }, [
    slots,
    overrides,
    defaultNote,
    notes,
    photos,
    photoPositions,
    template,
    pinned,
    pinnedOnly,
    team,
    teamColors,
    numbers,
    showTitleLine,
    league.slug
  ]);

  useEffect(() => {
    if (!colorTeam && team) setColorTeam(team);
  }, [team, colorTeam]);

  useEffect(() => {
    if (colorTeam) return;
    const first = data?.meta.teams?.[0];
    if (first) setColorTeam(first);
  }, [colorTeam, data?.meta.teams]);

  const players = useMemo(() => {
    const filtered = filterAndSortPlayers(data?.players ?? [], {
      search,
      team,
      sort: presentation.sortOptions[0]?.key ?? "totalPoints"
    });
    const pinnedSet = new Set(pinned);
    const visible = pinnedOnly ? filtered.filter((player) => pinnedSet.has(player.id)) : filtered;
    return visible.slice().sort((a, b) => Number(pinnedSet.has(b.id)) - Number(pinnedSet.has(a.id)));
  }, [data?.players, search, team, presentation.sortOptions, pinned, pinnedOnly]);

  const selected = players.find((player) => player.id === selectedId) ?? null;
  const selectedPinned = selected ? pinned.includes(selected.id) : false;

  function cardFor(player: Player) {
    const personal = (notes[player.id] ?? "").trim() || defaultNote.trim();
    const colors = player.team ? teamColors[player.team] : undefined;
    return toTradingCard(player, season, data?.meta.teamLogos, {
      number: numbers[player.id],
      lineItems: resolveLineItems(player, slots, overrides[player.id], presentation.cardOptions),
      note: personal,
      titleLine: showTitleLine ? cardTitleLine(player.team, season) : undefined,
      photoUrl: photos[player.id],
      photoPosition: photos[player.id]
        ? normalizePhotoPosition(photoPositions[player.id] ?? DEFAULT_PHOTO_POSITION)
        : undefined,
      template,
      theme: colors
        ? { background: colors.background, border: colors.border }
        : undefined
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

  function applyTemplate(next: CardTemplateId) {
    setTemplate(next);
    setSlots(slotsForTemplate(next, presentation));
    trackEvent("captain_template_change", { league: league.slug, template: next });
  }

  function addColumn() {
    if (!canAddSlot(slots)) return;
    setSlots((current) => addSlot(current));
    trackEvent("captain_slot_add", { league: league.slug, slot_count: slots.length + 1 });
  }

  function removeColumn() {
    if (!canRemoveSlot(slots)) return;
    const lastIndex = slots.length - 1;
    setSlots((current) => removeSlot(current));
    setOverrides((current) => {
      let changed = false;
      const next: Record<string, PlayerOverrides> = {};
      for (const [playerId, playerOverrides] of Object.entries(current)) {
        if (!(lastIndex in playerOverrides)) {
          next[playerId] = playerOverrides;
          continue;
        }
        changed = true;
        const { [lastIndex]: _drop, ...rest } = playerOverrides;
        if (Object.keys(rest).length) next[playerId] = rest;
      }
      return changed ? next : current;
    });
    trackEvent("captain_slot_remove", { league: league.slug, slot_count: lastIndex });
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
    setPhotos((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
    setPhotoPositions((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
    setNumbers((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
    setPhotoError(null);
  }

  function clearPlayerEdits() {
    setOverrides({});
    setNotes({});
    setPhotos({});
    setPhotoPositions({});
    setNumbers({});
    setPhotoError(null);
  }

  function removePhoto(playerId: string) {
    setPhotos((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
    setPhotoPositions((current) => {
      const { [playerId]: _drop, ...rest } = current;
      return rest;
    });
    setPhotoError(null);
    trackEvent("captain_photo_clear", { league: league.slug, player_id: playerId });
  }

  function setPhotoPosition(playerId: string, position: PhotoPosition) {
    setPhotoPositions((current) => ({ ...current, [playerId]: normalizePhotoPosition(position) }));
  }

  async function onPhotoFile(playerId: string, file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const dataUrl = await readCardPhoto(file);
      setPhotos((current) => ({ ...current, [playerId]: dataUrl }));
      setPhotoPositions((current) => ({
        ...current,
        [playerId]: current[playerId] ?? { ...DEFAULT_PHOTO_POSITION }
      }));
      trackEvent("captain_photo_set", { league: league.slug, player_id: playerId });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't add that photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function togglePin(playerId: string) {
    setPinned((current) => {
      const exists = current.includes(playerId);
      trackEvent("captain_pin_toggle", {
        league: league.slug,
        player_id: playerId,
        action: exists ? "unpin" : "pin"
      });
      return exists ? current.filter((id) => id !== playerId) : [...current, playerId];
    });
  }

  function updateTeamColor(teamName: string, patch: Partial<TeamCardColors>) {
    setTeamColors((current) => {
      const existing = current[teamName] ?? DEFAULT_TEAM_COLORS;
      return {
        ...current,
        [teamName]: {
          background: patch.background ?? existing.background,
          border: patch.border ?? existing.border
        }
      };
    });
  }

  function resetTeamColor(teamName: string) {
    setTeamColors((current) => {
      const { [teamName]: _drop, ...rest } = current;
      return rest;
    });
  }

  function toggleCard(player: Player) {
    const opening = player.id !== selectedId;
    trackEvent("captain_card_select", {
      league: league.slug,
      player_id: player.id,
      action: opening ? "open" : "close"
    });
    setExportError(null);
    setSelectedId(opening ? player.id : null);
  }

  function closeEditor() {
    trackDrawerClose("captain_editor", { league: league.slug, player_id: selectedId ?? "" });
    setExportError(null);
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

  function setJersey(playerId: string, value: string) {
    const jersey = normalizeJersey(value);
    setNumbers((current) => {
      if (!jersey) {
        const { [playerId]: _drop, ...rest } = current;
        return rest;
      }
      return { ...current, [playerId]: jersey };
    });
  }

  async function downloadSelectedPng(player: Player) {
    const cardNode = exportCardRef.current?.querySelector<HTMLElement>(".trading-card");
    if (!cardNode) {
      setExportError("Couldn't find that card to download.");
      return;
    }
    setExportBusy(true);
    setExportError(null);
    try {
      const card = cardFor(player);
      await downloadCardPng(cardNode, cardDownloadName(card));
      trackEvent("captain_card_png", { league: league.slug, player_id: player.id, season });
    } catch (err) {
      setExportError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't download that card as a PNG. Try again, or remove the photo if it still fails."
      );
    } finally {
      setExportBusy(false);
    }
  }

  const colorTarget = colorTeam || team;
  const activeTeamColors = colorTarget ? teamColors[colorTarget] ?? DEFAULT_TEAM_COLORS : DEFAULT_TEAM_COLORS;

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
                const next = event.target.value;
                trackFilter("team", next || "all", { league: league.slug, tab: "captain_tools", season });
                setTeam(next);
                if (next) setColorTeam(next);
              }}
            >
              <option value="">All teams</option>
              {(data?.meta.teams ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <label className="captain-check">
              <input
                type="checkbox"
                checked={pinnedOnly}
                onChange={(event) => {
                  setPinnedOnly(event.target.checked);
                  trackFilter("pinned_only", event.target.checked ? "on" : "off", {
                    league: league.slug,
                    tab: "captain_tools",
                    season
                  });
                }}
              />
              Pinned only{pinned.length ? ` (${pinned.length})` : ""}
            </label>

            <div className="eyebrow" style={{ marginTop: 28 }}>
              CARD TEMPLATE
            </div>
            <p className="captain-hint">
              Applies to every card this session. Sets the layout and starter columns — add or remove columns anytime.
            </p>
            <div className="captain-template-list">
              {CARD_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`captain-template${template === item.id ? " active" : ""}`}
                  onClick={() => applyTemplate(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </button>
              ))}
            </div>

            <div className="eyebrow" style={{ marginTop: 28 }}>
              TEAM LOOK
            </div>
            <p className="captain-hint">Background and border colors for a team’s cards.</p>
            <label className="field-label">Team</label>
            <select value={colorTeam} onChange={(event) => setColorTeam(event.target.value)}>
              <option value="" disabled>
                Choose a team
              </option>
              {(data?.meta.teams ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {colorTarget ? (
              <>
                <div className="captain-color-row">
                  <label>
                    Background
                    <input
                      type="color"
                      value={activeTeamColors.background}
                      onChange={(event) => updateTeamColor(colorTarget, { background: event.target.value })}
                    />
                  </label>
                  <label>
                    Border
                    <input
                      type="color"
                      value={activeTeamColors.border}
                      onChange={(event) => updateTeamColor(colorTarget, { border: event.target.value })}
                    />
                  </label>
                </div>
                {teamColors[colorTarget] ? (
                  <button type="button" className="text-action" onClick={() => resetTeamColor(colorTarget)}>
                    Reset {colorTarget} colors
                  </button>
                ) : null}
              </>
            ) : null}

            <div className="eyebrow" style={{ marginTop: 28 }}>
              STAT SLOTS
            </div>
            <p className="captain-hint">
              {`${slots.length} column${slots.length === 1 ? "" : "s"} on the card.`} Pick SportsPress stats or Custom
              write-ins. Empty custom columns stay off the card.
            </p>
            {slots.map((slot, index) => (
              <div className="captain-slot" key={`slot-${index}`}>
                <label>
                  Column {index + 1}
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
              <button type="button" className="text-action" disabled={!canAddSlot(slots)} onClick={addColumn}>
                Add column
              </button>
              <button type="button" className="text-action" disabled={!canRemoveSlot(slots)} onClick={removeColumn}>
                Remove column
              </button>
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
                  setSlots(emptySlots(slots.length));
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
            <label className="captain-check">
              <input
                type="checkbox"
                checked={showTitleLine}
                onChange={(event) => {
                  setShowTitleLine(event.target.checked);
                  trackEvent("captain_title_line", {
                    league: league.slug,
                    enabled: event.target.checked ? "on" : "off"
                  });
                }}
              />
              Team · season on cards
            </label>
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
                  {pinnedOnly ? " · pinned" : ""}
                  {search ? ` · “${search}”` : ""} · {activeTemplate.label} · 9 per page · session only
                </p>
              </div>
              <div className="heading-actions">
                {(Object.keys(overrides).length > 0 ||
                  Object.keys(notes).length > 0 ||
                  Object.keys(photos).length > 0 ||
                  Object.keys(numbers).length > 0) && (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => {
                      trackEvent("captain_edits_clear", { league: league.slug, scope: "all" });
                      clearPlayerEdits();
                    }}
                  >
                    Clear player edits
                  </button>
                )}
                {players.length > 0 && (
                  <button
                    type="button"
                    className="print-action"
                    onClick={() => requestPrint(players.map(cardFor), { ...printCtx, source: "captain_bulk" })}
                  >
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
                {players.map((player) => {
                  const isPinned = pinned.includes(player.id);
                  return (
                    <div key={player.id} className={`captain-card-wrap${isPinned ? " is-pinned" : ""}`}>
                      <button
                        type="button"
                        className={`captain-pin-btn${isPinned ? " active" : ""}`}
                        aria-label={isPinned ? `Unpin ${player.name}` : `Pin ${player.name}`}
                        aria-pressed={isPinned}
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePin(player.id);
                        }}
                      >
                        <Pin size={14} />
                      </button>
                      <TradingCard
                        card={cardFor(player)}
                        selected={selected?.id === player.id}
                        onSelect={() => toggleCard(player)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {!loading && players.length === 0 && (
              <div className="empty">
                {pinnedOnly
                  ? "No pinned players match this filter. Pin cards from the grid or editor."
                  : `No players match${search ? ` “${search}”` : ""}${
                      team ? `${search ? " on" : ""} ${team}` : ""
                    } in ${season}.`}
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
                Leave a field blank to keep the preset. Photo and edits stay in this tab only.
              </p>
              <div ref={exportCardRef}>
                <PhotoPositionStage
                  enabled={Boolean(photos[selected.id])}
                  position={normalizePhotoPosition(photoPositions[selected.id] ?? DEFAULT_PHOTO_POSITION)}
                  onChange={(position) => setPhotoPosition(selected.id, position)}
                >
                  <TradingCard card={cardFor(selected)} />
                </PhotoPositionStage>
              </div>
              <div className="captain-photo-actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={`text-action${selectedPinned ? " is-active" : ""}`}
                  onClick={() => togglePin(selected.id)}
                >
                  <Pin size={14} />
                  {selectedPinned ? "Unpin player" : "Pin player"}
                </button>
              </div>
              <label className="field-label">Player photo</label>
              <p className="captain-hint">JPEG, PNG, or WebP. Drag the preview to reframe the face.</p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onPhotoFile(selected.id, file);
                }}
              />
              <div className="captain-photo-actions">
                <button
                  type="button"
                  className="text-action"
                  disabled={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <ImagePlus size={14} />
                  {photoBusy ? "Adding…" : photos[selected.id] ? "Change photo" : "Add photo"}
                </button>
                {photos[selected.id] ? (
                  <button type="button" className="text-action" onClick={() => removePhoto(selected.id)}>
                    Remove photo
                  </button>
                ) : null}
              </div>
              {photoError ? <p className="captain-hint captain-photo-error">{photoError}</p> : null}
              <label className="field-label">Jersey number</label>
              <p className="captain-hint">Shows as the badge in the top-left. Digits only, up to 3.</p>
              <input
                className="captain-jersey-input"
                inputMode="numeric"
                maxLength={3}
                value={numbers[selected.id] ?? ""}
                placeholder="—"
                aria-label={`Jersey number for ${selected.name}`}
                onChange={(event) => setJersey(selected.id, event.target.value)}
              />
              <label className="field-label">Personal note</label>
              <textarea
                className="captain-note-input"
                rows={3}
                maxLength={80}
                value={notes[selected.id] ?? ""}
                placeholder={defaultNote.trim() || "Write something personal, or leave blank to handwrite"}
                onChange={(event) => setPlayerNote(selected.id, event.target.value)}
              />
              {slots.map((_slot, index) => {
                const live = resolveLineItems(selected, slots, {}, presentation.cardOptions)[index];
                const override = overrides[selected.id]?.[index];
                return (
                  <div className="captain-edit-row" key={`edit-${selected.id}-${index}`}>
                    <span>Col {index + 1}</span>
                    <input
                      value={override?.label ?? ""}
                      maxLength={8}
                      placeholder={live?.label || "Label"}
                      onChange={(event) =>
                        setOverride(selected.id, index, { label: event.target.value, value: override?.value ?? "" })
                      }
                    />
                    <input
                      value={override?.value ?? ""}
                      maxLength={16}
                      placeholder={live?.value || "Value"}
                      onChange={(event) =>
                        setOverride(selected.id, index, { label: override?.label ?? "", value: event.target.value })
                      }
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
              {exportError ? <p className="captain-hint captain-photo-error">{exportError}</p> : null}
              <div className="captain-export-actions">
                <button
                  type="button"
                  className="print-action detail-print"
                  disabled={exportBusy}
                  onClick={() => void downloadSelectedPng(selected)}
                >
                  <Download size={14} /> {exportBusy ? "Saving…" : "Download PNG"}
                </button>
                <button
                  type="button"
                  className="print-action detail-print"
                  onClick={() => requestPrint([cardFor(selected)], { ...printCtx, source: "captain_single" })}
                >
                  <Printer size={14} /> Print this card
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
      <PrintSheet cards={printCards ?? []} />
    </>
  );
}
