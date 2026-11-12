/** Shared frontend helpers for permit selection, status handling, and formatting. */
import type {
  DeviceEntry,
  FavoriteItem,
  HomeAssistant,
  LocalizeTarget,
  PermitEntry,
  PermitOption,
  ZoneStatus,
  ZoneStatusResponse,
  ZoneStatusZone,
} from "./types";
import { localize } from "./translations";

/** Integration domain used for selectors, websocket calls, and device matching. */
export const DOMAIN = "city_visitor_parking";
/** Websocket command returning the status and zones of one permit. */
export const WS_GET_STATUS = "city_visitor_parking/status";
export const RESERVATION_STARTED_EVENT =
  "city-visitor-parking-reservation-started";
export const RESERVATION_ENDED_EVENT = "city-visitor-parking-reservation-ended";

/** Empty zone state used before a status payload has been loaded. */
export const EMPTY_ZONE_STATUS: ZoneStatus = {
  state: null,
  kind: null,
  start: null,
  end: null,
  remainingMinutes: null,
  balanceUnit: null,
};

/** Normalizes free-form text for case-insensitive matching. */
export const normalizeMatchValue = (value: string | undefined | null): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/** Strips non-alphanumeric characters for matching only, never for storage or display. */
export const normalizePlateValue = (value: string | undefined | null): string =>
  normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");

/** Builds lookup maps so favorite matching stays cheap during card interaction. */
export const createFavoriteIndex = (favorites: FavoriteItem[]) => {
  const byPlate = new Map<string, FavoriteItem>();
  const byPlateName = new Map<string, FavoriteItem>();
  const byValue = new Map<string, FavoriteItem>();
  for (const favorite of favorites) {
    const plateKey = normalizePlateValue(favorite.license_plate);
    if (plateKey) {
      byPlate.set(plateKey, favorite);
      const nameKey = normalizeMatchValue(favorite.name);
      if (nameKey) byPlateName.set(`${plateKey}|${nameKey}`, favorite);
    }
    const nameValueKey = normalizeMatchValue(favorite.name);
    if (nameValueKey) byValue.set(nameValueKey, favorite);
  }
  return { byPlate, byPlateName, byValue };
};

/** Clears transient favorite-action flags after a request or form reset. */
export const clearFavoriteTransientState = (context: {
  _pendingRemoveFavoriteId: string | null;
  _favoriteRemoveInFlight: boolean;
  _addFavoriteChecked: boolean;
  _suppressFavoriteClear: boolean;
}): void => {
  Object.assign(context, {
    _pendingRemoveFavoriteId: null,
    _favoriteRemoveInFlight: false,
    _addFavoriteChecked: false,
    _suppressFavoriteClear: false,
  });
};

/** Invalidates cached favorites and optionally resets retry/loading state. */
export const invalidateFavoritesCache = (
  context: {
    _favoritesLoadedFor: string | null;
    _favoritesRetryAfter: number;
    _favoritesError: string | null;
    _favoritesLoading: boolean;
  },
  options?: { resetRetryAfter?: boolean; clearLoading?: boolean },
): void => {
  Object.assign(context, { _favoritesLoadedFor: null, _favoritesError: null });
  if (options?.resetRetryAfter) context._favoritesRetryAfter = 0;
  if (options?.clearLoading) context._favoritesLoading = false;
};

/** Tracks whether permit defaults still need to be applied to the form. */
export const setPendingPermitDefaults = (
  context: {
    _pendingPermitDefaultsEntryId: string | null;
    _pendingPermitDefaultsForce: boolean;
  },
  entryId: string | null,
  force: boolean = false,
): void => {
  Object.assign(context, {
    _pendingPermitDefaultsEntryId: entryId,
    _pendingPermitDefaultsForce: force,
  });
};

/** Copies a normalized zone status payload into card instance state fields. */
export const applyZoneStatus = (
  context: {
    _zoneState: ZoneStatus["state"];
    _windowKind: ZoneStatus["kind"];
    _windowStartIso: string | null;
    _windowEndIso: string | null;
    _remainingMinutes: number | null;
    _balanceUnit: string | null;
  },
  status: ZoneStatus | null,
): void => {
  Object.assign(context, {
    _zoneState: status?.state ?? null,
    _windowKind: status?.kind ?? null,
    _windowStartIso: status?.start ?? null,
    _windowEndIso: status?.end ?? null,
    _remainingMinutes: status?.remainingMinutes ?? null,
    _balanceUnit: status?.balanceUnit ?? null,
  });
};

type ZoneWindowPayload = {
  state?: unknown;
  window_kind?: unknown;
  window_start?: unknown;
  window_end?: unknown;
};

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** Normalizes the state and window fields shared by status payloads and zones. */
const normalizeZoneWindow = (
  payload: ZoneWindowPayload | null | undefined,
): Pick<ZoneStatus, "state" | "kind" | "start" | "end"> => {
  const state =
    payload?.state === "chargeable" || payload?.state === "free"
      ? payload.state
      : null;
  const kind =
    payload?.window_kind === "current" || payload?.window_kind === "next"
      ? payload.window_kind
      : null;
  return {
    state,
    kind,
    start: kind ? nonEmptyString(payload?.window_start) : null,
    end: kind ? nonEmptyString(payload?.window_end) : null,
  };
};

/** Normalizes the top-level (default zone) part of a status payload. */
export const normalizeZoneStatus = (
  payload: ZoneStatusResponse | null | undefined,
): ZoneStatus => {
  const balance = payload?.remaining_balance;
  return {
    ...normalizeZoneWindow(payload),
    remainingMinutes:
      typeof balance === "number" && Number.isFinite(balance) ? balance : null,
    balanceUnit: nonEmptyString(payload?.balance_unit),
  };
};

/** Returns the usable zone entries of a status payload, default zone first. */
export const normalizeZones = (
  payload: ZoneStatusResponse | null | undefined,
): ZoneStatusZone[] =>
  Array.isArray(payload?.zones)
    ? payload.zones.filter((zone) => Boolean(nonEmptyString(zone?.zone_id)))
    : [];

/**
 * Replaces the state and window of a status with those of the selected zone.
 * Balance fields stay permit-wide. A status without state (not loaded or
 * failed) is returned unchanged so cached zone windows never outlive it.
 */
export const applyZoneToStatus = (
  status: ZoneStatus,
  zone: ZoneStatusZone | null,
): ZoneStatus =>
  zone && status.state !== null
    ? { ...status, ...normalizeZoneWindow(zone) }
    : status;

/**
 * Drops a configured `zone_id` once the permit changed or was cleared.
 * Zone ids are per permit, so the zone survives only when the new permit's
 * known zones list it.
 */
export const dropForeignZoneId = <
  T extends { config_entry_id?: string; zone_id?: string },
>(
  config: T,
  previousEntryId: string | undefined,
  zonesByEntryId: ReadonlyMap<string, readonly ZoneStatusZone[]>,
): T => {
  if (!config.zone_id || config.config_entry_id === previousEntryId) {
    return config;
  }
  const zones = config.config_entry_id
    ? zonesByEntryId.get(config.config_entry_id)
    : undefined;
  if (zones?.some((zone) => zone.zone_id === config.zone_id)) return config;
  const next = { ...config };
  delete next.zone_id;
  return next;
};

/** Minimum number of zones before a permit offers a zone choice. */
export const MIN_SELECTABLE_ZONES = 2;

/** Card options that decide which zone the new-reservation card uses. */
export type CardZoneOptions = {
  /** Whether the card shows its zone field (`show_zone`). */
  showZone: boolean;
  /** Preset zone from the card config (`zone_id`) for the configured permit. */
  configZoneId?: string | null;
  /** Zone the user picked in the card's zone field. */
  pickedZoneId?: string | null;
};

/**
 * Resolves the zone the new-reservation card uses for a permit.
 *
 * With the zone field shown, the user's pick wins over the configured preset;
 * with it hidden there is nothing to pick, so only the preset counts. Ids that
 * are not one of the permit's zones fall through to the first (default) zone.
 */
export const resolveCardZone = (
  zones: readonly ZoneStatusZone[],
  options: CardZoneOptions,
): ZoneStatusZone | null => {
  const find = (zoneId: string | null | undefined) =>
    zoneId ? zones.find((zone) => zone.zone_id === zoneId) : undefined;
  return (
    (options.showZone ? find(options.pickedZoneId) : undefined) ??
    find(options.configZoneId) ??
    zones[0] ??
    null
  );
};

/**
 * Decides which zone settings the new-reservation card editor shows.
 *
 * The zone picker needs a configured permit with a zone choice. The
 * `show_zone` toggle follows the configured permit, or, without one (the card
 * then shows a permit picker), any permit with a zone choice.
 */
export const getZoneEditorVisibility = (params: {
  permitConfigured: boolean;
  permitZoneCount: number;
  anyPermitHasZones: boolean;
}): { showZoneSelect: boolean; showZoneToggle: boolean } => {
  const permitHasZones =
    params.permitConfigured && params.permitZoneCount >= MIN_SELECTABLE_ZONES;
  return {
    showZoneSelect: permitHasZones,
    showZoneToggle: params.permitConfigured
      ? permitHasZones
      : params.anyPermitHasZones,
  };
};

/** Fetches the zones of one permit from the status websocket; empty on failure. */
export const fetchPermitZones = async (
  hass: HomeAssistant,
  entryId: string,
): Promise<ZoneStatusZone[]> => {
  try {
    return normalizeZones(
      await hass.callWS<ZoneStatusResponse>({
        type: WS_GET_STATUS,
        config_entry_id: entryId,
      }),
    );
  } catch {
    return [];
  }
};

/** Returns the zone label of a listed reservation: its name, else its id. */
export const formatReservationZone = (reservation: {
  zone_id?: string | null;
  zone_name?: string | null;
}): string | null =>
  nonEmptyString(reservation.zone_name) ?? nonEmptyString(reservation.zone_id);
/** Returns whether a config entry should be hidden from permit selection. */
export const isPermitEntryDisabled = (entry: PermitEntry): boolean =>
  Boolean(entry.disabled_by) ||
  (entry.state != null &&
    entry.state !== "loaded" &&
    entry.state !== "setup_in_progress");

/** Converts config entries into sorted Lovelace selector options. */
export const buildPermitOptions = (entries: PermitEntry[]): PermitOption[] =>
  entries
    .map((entry) => ({
      id: entry.entry_id,
      label: (entry.title || entry.entry_id || "").trim() || entry.entry_id,
      disabled: isPermitEntryDisabled(entry),
    }))
    .sort((first, second) => first.label.localeCompare(second.label));

/** Maps config entry ids to their display titles for device labeling. */
export const buildPermitTitleMap = (
  entries: PermitEntry[],
): Map<string, string> =>
  new Map(
    entries.map((entry) => [entry.entry_id, entry.title || entry.entry_id]),
  );

/** Fetches config entries for this integration through Home Assistant websocket API. */
export const fetchPermitEntries = async (
  hass: HomeAssistant,
): Promise<PermitEntry[]> =>
  hass.callWS<PermitEntry[]>({
    type: "config_entries/get",
    type_filter: ["device", "hub", "service"],
    domain: DOMAIN,
  });

/** Resolves a user-facing permit label for each device tied to a config entry. */
export const resolvePermitLabelsByDevice = (
  devices: DeviceEntry[],
  entryTitles: Map<string, string>,
): Map<string, string> => {
  const labels = new Map<string, string>();
  for (const device of devices) {
    const entryId = device.config_entry_id;
    if (!entryId) continue;
    labels.set(device.id, entryTitles.get(entryId) ?? entryId);
  }
  return labels;
};

/** Extracts the best available error message, falling back to a translation key. */
export const errorMessage = (
  err: unknown,
  fallbackKey: string,
  localizeFn: (key: string, ...args: Array<string | number>) => string,
): string => {
  for (const msg of [
    (err as { message?: unknown })?.message,
    (err as { data?: { message?: unknown } })?.data?.message,
  ]) {
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return localizeFn(fallbackKey);
};

/** Creates an error formatter bound to the current Home Assistant localization context. */
export const createErrorMessage =
  (
    getHass: () => LocalizeTarget | null | undefined,
  ): ((err: unknown, fallbackKey: string) => string) =>
  (err: unknown, fallbackKey: string) =>
    errorMessage(err, fallbackKey, (key) => localize(getHass(), key));

/** Pads a numeric value to two digits for date and time formatting. */
export const pad = (value: number | string): string =>
  String(value).padStart(2, "0");

/** Formats a `Date` as a local `YYYY-MM-DD` string. */
export const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Formats a `Date` as a local datetime string accepted by HA form inputs. */
export const formatDateTimeLocal = (date: Date): string =>
  `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Formats an optional ISO-like value for datetime-local input controls. */
export const formatOptionalDateTimeLocal = (
  value: string | undefined | null,
): string => {
  const date = parseDateTimeValue(value);
  return date ? formatDateTimeLocal(date) : "";
};

/** Parses a date-time string into a `Date`, returning `null` for invalid input. */
export const parseDateTimeValue = (
  value: string | undefined | null,
): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Safely reads the selected config entry id from a card config object. */
export const getConfigEntryId = (
  config: { config_entry_id?: string | null } | null | undefined,
): string | null => config?.config_entry_id ?? null;

/** Filters HA devices down to those owned by this integration domain. */
export const filterDomainDevices = (devices: DeviceEntry[]): DeviceEntry[] =>
  devices.filter((device) =>
    (device.identifiers ?? []).some(
      (identifier: [string, string]) => identifier[0] === DOMAIN,
    ),
  );

/** Reuses an in-flight async loader so duplicate requests share the same promise. */
export const makeDedupedLoader = <T>(
  getPromise: () => Promise<T> | null,
  setPromise: (p: Promise<T> | null) => void,
  factory: () => Promise<T>,
): Promise<T> => {
  const existing = getPromise();
  if (existing) return existing;
  const promise = factory().finally(() => setPromise(null));
  setPromise(promise);
  return promise;
};

/** Reads a selector value from a Home Assistant event with an element fallback. */
export const extractEventValue = (
  event: Event,
  fallbackElement?: (HTMLElement & { value?: string }) | null,
): string => {
  const detail = (event as CustomEvent<{ value?: string | null }>).detail;
  return detail != null && "value" in detail
    ? (detail.value ?? "")
    : (fallbackElement?.value ?? "");
};

/** Returns whether Home Assistant has finished starting up. */
export const isHassRunning = (
  hass: { config?: { state?: string } } | null | undefined,
): boolean => hass?.config?.state === "RUNNING";

/** Formats remaining permit balance as a badge label and matching icon. */
export const formatBalanceLabel = (
  remainingMinutes: number,
  balanceUnit: string | null,
  localize: (key: string) => string,
): { text: string; icon: string } => {
  const isMonetary =
    balanceUnit !== null && balanceUnit !== "TIMES" && balanceUnit !== "MINUTE";
  if (isMonetary) {
    const formatted = Number.isInteger(remainingMinutes)
      ? String(remainingMinutes)
      : remainingMinutes.toFixed(2);
    const currencySymbols: Record<string, string> = {
      EURO: "€",
      EUR: "€",
      GBP: "£",
      USD: "$",
    };
    const symbol = currencySymbols[balanceUnit ?? ""] ?? balanceUnit ?? "";
    return { text: `${symbol}${formatted}`, icon: "mdi:cash" };
  }
  if (balanceUnit === "TIMES") {
    return {
      text: String(Math.round(remainingMinutes)),
      icon: "mdi:ticket-outline",
    };
  }
  const totalMins = Math.round(remainingMinutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const h = localize("unit.hours");
  const m = localize("unit.minutes");
  const text =
    hours > 0 && mins > 0
      ? `${hours}${h} ${mins}${m}`
      : hours > 0
        ? `${hours}${h}`
        : `${mins}${m}`;
  return { text, icon: "mdi:progress-clock" };
};
