/** Shared frontend helpers for permit selection, status handling, and formatting. */
import type {
  BalanceKind,
  BalancePayload,
  DeviceEntry,
  FavoriteItem,
  HomeAssistant,
  LocalizeTarget,
  PermitEntry,
  PermitOption,
  ReservationsResponse,
  PaidParkingStatus,
  PaidParkingStatusResponse,
  ParkingAreaStatus,
  StartReservationResponse,
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
export const EMPTY_PAID_PARKING_STATUS: PaidParkingStatus = {
  state: null,
  kind: null,
  start: null,
  end: null,
  balances: [],
};

/** Every balance kind, in the order the card editor lists them. */
export const BALANCE_KINDS: readonly BalanceKind[] = ["time", "money", "times"];

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
  _favoriteAddInFlight: boolean;
  _suppressFavoriteClear: boolean;
}): void => {
  Object.assign(context, {
    _pendingRemoveFavoriteId: null,
    _favoriteRemoveInFlight: false,
    _favoriteAddInFlight: false,
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
export const applyPaidParkingStatus = (
  context: {
    _paidState: PaidParkingStatus["state"];
    _windowKind: PaidParkingStatus["kind"];
    _windowStartIso: string | null;
    _windowEndIso: string | null;
    _balances: BalancePayload[];
  },
  status: PaidParkingStatus | null,
): void => {
  Object.assign(context, {
    _paidState: status?.state ?? null,
    _windowKind: status?.kind ?? null,
    _windowStartIso: status?.start ?? null,
    _windowEndIso: status?.end ?? null,
    _balances: status?.balances ?? [],
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
): Pick<PaidParkingStatus, "state" | "kind" | "start" | "end"> => {
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

const isBalanceKind = (value: unknown): value is BalanceKind =>
  BALANCE_KINDS.includes(value as BalanceKind);

/** Keeps the well-formed balances of a status payload, in permit order. */
const normalizeBalances = (value: unknown): BalancePayload[] =>
  Array.isArray(value)
    ? (value as Array<Partial<BalancePayload> | null | undefined>).flatMap(
        (balance) =>
          balance &&
          isBalanceKind(balance.kind) &&
          typeof balance.amount === "number" &&
          Number.isFinite(balance.amount)
            ? [
                {
                  amount: balance.amount,
                  unit: nonEmptyString(balance.unit),
                  kind: balance.kind,
                },
              ]
            : [],
      )
    : [];

/** Normalizes the top-level (default parking area) part of a status payload. */
export const normalizePaidParkingStatus = (
  payload: PaidParkingStatusResponse | null | undefined,
): PaidParkingStatus => ({
  ...normalizeParkingAreaPaidWindow(payload),
  balances: normalizeBalances(payload?.balances),
});

/**
 * Returns the balances the card shows: those of the configured kinds, in permit
 * order. Without a configured list every kind is shown.
 */
export const selectCardBalances = (
  balances: readonly BalancePayload[],
  kinds: readonly BalanceKind[] | undefined,
): BalancePayload[] =>
  kinds
    ? balances.filter((balance) => kinds.includes(balance.kind))
    : [...balances];

/** Returns the usable parking area entries of a status payload, default parking area first. */
export const normalizeParkingAreas = (
  payload: PaidParkingStatusResponse | null | undefined,
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
  status: PaidParkingStatus,
  parkingArea: ParkingAreaStatus | null,
): PaidParkingStatus =>
  parkingArea && status.state !== null
    ? { ...status, ...normalizeParkingAreaPaidWindow(parkingArea) }
    : status;

/** Minimum number of parking areas before a permit offers a parking area choice. */
export const MIN_SELECTABLE_PARKING_AREAS = 2;

/**
 * Resolves the parking area the new-reservation card uses for a permit: the
 * user's pick in the card's parking area field, else the first parking area,
 * which is the default parking area from the integration options. A pick that
 * is not one of the permit's parking areas falls through to that default.
 */
export const resolveCardParkingArea = (
  parkingAreas: readonly ParkingAreaStatus[],
  pickedParkingAreaId: string | null | undefined,
): ParkingAreaStatus | null =>
  (pickedParkingAreaId
    ? parkingAreas.find(
        (parkingArea) => parkingArea.parking_area_id === pickedParkingAreaId,
      )
    : undefined) ??
  parkingAreas[0] ??
  null;

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
      await hass.callWS<PaidParkingStatusResponse>({
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

/**
 * Whether the card lets the user change the start time of a reservation.
 * A provider that updates start times natively allows it at any time. For
 * other providers the backend replaces the reservation, which it only does
 * while the reservation has not started yet.
 */
export const canEditReservationStart = (
  nativeStartUpdate: boolean,
  startTime: string | undefined | null,
  now: Date = new Date(),
): boolean => {
  if (nativeStartUpdate) return true;
  const start = parseDateTimeValue(startTime);
  return start !== null && start > now;
};

/**
 * Returns the message for a reservation the provider confirmed: running until
 * its end, or planned from its start to its end. Times on the same day as
 * `now` show only the time; other days add the short weekday and date.
 */
export const startedReservationMessage = (
  response: Pick<
    StartReservationResponse,
    "start_time" | "end_time" | "status"
  >,
  now: Date,
  language: string,
  localizeKey: (key: string) => string,
): string => {
  const format = (value: string): string => {
    const date = parseDateTimeValue(value) ?? now;
    return date.toLocaleString(
      language,
      formatDate(date) === formatDate(now)
        ? { hour: "2-digit", minute: "2-digit" }
        : {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          },
    );
  };
  return response.status === "active"
    ? localizeKey("message.reservation_started").replace(
        "{end}",
        format(response.end_time),
      )
    : localizeKey("message.reservation_planned")
        .replace("{start}", format(response.start_time))
        .replace("{end}", format(response.end_time));
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

/** Returns this integration's devices that belong to the given config entry. */
export const filterDomainDevicesForEntry = (
  devices: DeviceEntry[],
  entryId: string,
): DeviceEntry[] =>
  filterDomainDevices(devices).filter(
    (device) => device.config_entry_id === entryId,
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

/**
 * Formats one permit balance as a badge label and matching icon: money as a
 * currency amount in the user's language, uses as a count, time as hours and
 * minutes.
 */
export const formatBalanceLabel = (
  balance: BalancePayload,
  localize: (key: string) => string,
  language: string | undefined,
): { text: string; icon: string } => {
  if (balance.kind === "money") {
    // The integration only reports euro balances as money.
    const text = new Intl.NumberFormat(language, {
      style: "currency",
      currency: "EUR",
    }).format(balance.amount);
    return { text, icon: "mdi:cash" };
  }
  if (balance.kind === "times") {
    return {
      text: String(Math.round(balance.amount)),
      icon: "mdi:ticket-outline",
    };
  }
  const totalMins = Math.round(balance.amount);
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
