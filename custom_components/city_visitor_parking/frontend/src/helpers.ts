/** Shared frontend helpers for permit selection, status handling, and formatting. */
import type {
  DeviceEntry,
  FavoriteItem,
  HomeAssistant,
  LocalizeTarget,
  PermitEntry,
  PermitOption,
  ReservationsResponse,
  ZoneStatus,
  ZoneStatusResponse,
  ParkingAreaStatus,
} from "./types";
import { localize } from "./translations";

/** Integration domain used for selectors, websocket calls, and device matching. */
export const DOMAIN = "city_visitor_parking";
/** Websocket command returning the status and parking areas of one permit. */
export const WS_GET_STATUS = "city_visitor_parking/status";
/** Websocket command returning the reservations held by the coordinator. */
export const WS_LIST_RESERVATIONS = "city_visitor_parking/reservations";
export const RESERVATION_STARTED_EVENT =
  "city-visitor-parking-reservation-started";
export const RESERVATION_ENDED_EVENT = "city-visitor-parking-reservation-ended";

/** Empty parking area state used before a status payload has been loaded. */
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

/** Copies a normalized parking area status payload into card instance state fields. */
export const applyZoneStatus = (
  context: {
    _paidState: ZoneStatus["state"];
    _windowKind: ZoneStatus["kind"];
    _windowStartIso: string | null;
    _windowEndIso: string | null;
    _remainingMinutes: number | null;
    _balanceUnit: string | null;
  },
  status: ZoneStatus | null,
): void => {
  Object.assign(context, {
    _paidState: status?.state ?? null,
    _windowKind: status?.kind ?? null,
    _windowStartIso: status?.start ?? null,
    _windowEndIso: status?.end ?? null,
    _remainingMinutes: status?.remainingMinutes ?? null,
    _balanceUnit: status?.balanceUnit ?? null,
  });
};

type ParkingAreaPaidWindowPayload = {
  state?: unknown;
  window_kind?: unknown;
  window_start?: unknown;
  window_end?: unknown;
};

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** Normalizes the state and window fields shared by status payloads and parking areas. */
const normalizeParkingAreaPaidWindow = (
  payload: ParkingAreaPaidWindowPayload | null | undefined,
): Pick<ZoneStatus, "state" | "kind" | "start" | "end"> => {
  const state =
    payload?.state === "paid" || payload?.state === "free"
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

/** Normalizes the top-level (default parking area) part of a status payload. */
export const normalizeZoneStatus = (
  payload: ZoneStatusResponse | null | undefined,
): ZoneStatus => {
  const balance = payload?.remaining_balance;
  return {
    ...normalizeParkingAreaPaidWindow(payload),
    remainingMinutes:
      typeof balance === "number" && Number.isFinite(balance) ? balance : null,
    balanceUnit: nonEmptyString(payload?.balance_unit),
  };
};

/** Returns the usable parking area entries of a status payload, default parking area first. */
export const normalizeParkingAreas = (
  payload: ZoneStatusResponse | null | undefined,
): ParkingAreaStatus[] =>
  Array.isArray(payload?.parking_areas)
    ? payload.parking_areas.filter((parkingArea) =>
        Boolean(nonEmptyString(parkingArea?.parking_area_id)),
      )
    : [];

/**
 * Replaces the state and window of a status with those of the selected parking area.
 * Balance fields stay permit-wide. A status without state (not loaded or
 * failed) is returned unchanged so cached parking area windows never outlive it.
 */
export const applyParkingAreaToStatus = (
  status: ZoneStatus,
  parkingArea: ParkingAreaStatus | null,
): ZoneStatus =>
  parkingArea && status.state !== null
    ? { ...status, ...normalizeParkingAreaPaidWindow(parkingArea) }
    : status;

/**
 * Drops a configured `parking_area_id` once the permit changed or was cleared.
 * Parking area ids are per permit, so the parking area survives only when the new permit's
 * known parking areas list it.
 */
export const dropForeignParkingAreaId = <
  T extends { config_entry_id?: string; parking_area_id?: string },
>(
  config: T,
  previousEntryId: string | undefined,
  parkingAreasByEntryId: ReadonlyMap<string, readonly ParkingAreaStatus[]>,
): T => {
  if (!config.parking_area_id || config.config_entry_id === previousEntryId) {
    return config;
  }
  const parkingAreas = config.config_entry_id
    ? parkingAreasByEntryId.get(config.config_entry_id)
    : undefined;
  if (
    parkingAreas?.some(
      (parkingArea) => parkingArea.parking_area_id === config.parking_area_id,
    )
  )
    return config;
  const next = { ...config };
  delete next.parking_area_id;
  return next;
};

/** Minimum number of parking areas before a permit offers a parking area choice. */
export const MIN_SELECTABLE_PARKING_AREAS = 2;

/** Card options that decide which parking area the new-reservation card uses. */
export type CardParkingAreaOptions = {
  /** Whether the card shows its parking area field (`show_parking_area`). */
  showParkingArea: boolean;
  /** Preset parking area from the card config (`parking_area_id`) for the configured permit. */
  configParkingAreaId?: string | null;
  /** Parking area the user picked in the card's parking area field. */
  pickedParkingAreaId?: string | null;
};

/**
 * Resolves the parking area the new-reservation card uses for a permit.
 *
 * With the parking area field shown, the user's pick wins over the configured preset;
 * with it hidden there is nothing to pick, so only the preset counts. Ids that
 * are not one of the permit's parking areas fall through to the first (default) parking area.
 */
export const resolveCardParkingArea = (
  parkingAreas: readonly ParkingAreaStatus[],
  options: CardParkingAreaOptions,
): ParkingAreaStatus | null => {
  const find = (parkingAreaId: string | null | undefined) =>
    parkingAreaId
      ? parkingAreas.find(
          (parkingArea) => parkingArea.parking_area_id === parkingAreaId,
        )
      : undefined;
  return (
    (options.showParkingArea ? find(options.pickedParkingAreaId) : undefined) ??
    find(options.configParkingAreaId) ??
    parkingAreas[0] ??
    null
  );
};

/**
 * Decides which parking area settings the new-reservation card editor shows.
 *
 * The parking area picker needs a configured permit with a parking area choice. The
 * `show_parking_area` toggle follows the configured permit, or, without one (the card
 * then shows a permit picker), any permit with a parking area choice.
 */
export const getParkingAreaEditorVisibility = (params: {
  permitConfigured: boolean;
  permitParkingAreaCount: number;
  anyPermitHasParkingAreas: boolean;
}): { showParkingAreaSelect: boolean; showParkingAreaToggle: boolean } => {
  const permitHasParkingAreas =
    params.permitConfigured &&
    params.permitParkingAreaCount >= MIN_SELECTABLE_PARKING_AREAS;
  return {
    showParkingAreaSelect: permitHasParkingAreas,
    showParkingAreaToggle: params.permitConfigured
      ? permitHasParkingAreas
      : params.anyPermitHasParkingAreas,
  };
};

/**
 * Loads the reservations of one integration device.
 *
 * With `fresh`, the `list_reservations` service fetches from the provider, so
 * changes made outside Home Assistant (the municipality app or website) show
 * up. Without it, the websocket command returns the coordinator data without
 * a provider fetch. Use that right after a write from a card: the write
 * services refresh the coordinator before they return, so the data is current.
 */
export const fetchReservations = async (
  hass: HomeAssistant,
  device: DeviceEntry,
  fresh: boolean,
): Promise<ReservationsResponse> => {
  if (!fresh && device.config_entry_id) {
    return hass.callWS<ReservationsResponse>({
      type: WS_LIST_RESERVATIONS,
      config_entry_id: device.config_entry_id,
    });
  }
  const result = await hass.callWS<
    ReservationsResponse | { response: ReservationsResponse }
  >({
    type: "call_service",
    domain: DOMAIN,
    service: "list_reservations",
    return_response: true,
    service_data: { device_id: device.id },
  });
  return "response" in result ? result.response : result;
};

/** Fetches the parking areas of one permit from the status websocket; empty on failure. */
export const fetchPermitParkingAreas = async (
  hass: HomeAssistant,
  entryId: string,
): Promise<ParkingAreaStatus[]> => {
  try {
    return normalizeParkingAreas(
      await hass.callWS<ZoneStatusResponse>({
        type: WS_GET_STATUS,
        config_entry_id: entryId,
      }),
    );
  } catch {
    return [];
  }
};

/** Returns the parking area label of a listed reservation: its name, else its id. */
export const formatReservationParkingArea = (reservation: {
  parking_area_id?: string | null;
  parking_area_name?: string | null;
}): string | null =>
  nonEmptyString(reservation.parking_area_name) ??
  nonEmptyString(reservation.parking_area_id);
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
