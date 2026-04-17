import type {
  DeviceEntry,
  FavoriteItem,
  HomeAssistant,
  LocalizeTarget,
  PermitEntry,
  PermitOption,
  ZoneStatus,
} from "./types";
import { localize } from "./translations";

export const DOMAIN = "city_visitor_parking";
export const RESERVATION_STARTED_EVENT =
  "city-visitor-parking-reservation-started";
export const RESERVATION_ENDED_EVENT = "city-visitor-parking-reservation-ended";

export const EMPTY_ZONE_STATUS: ZoneStatus = {
  state: null,
  kind: null,
  start: null,
  end: null,
  remainingMinutes: null,
  balanceUnit: null,
};

export const normalizeMatchValue = (value: string | undefined | null): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

// Strips all non-alphanumeric characters for matching purposes only (not for storage or display).
export const normalizePlateValue = (value: string | undefined | null): string =>
  normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");

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

export const isPermitEntryDisabled = (entry: PermitEntry): boolean =>
  Boolean(entry.disabled_by) ||
  (entry.state != null &&
    entry.state !== "loaded" &&
    entry.state !== "setup_in_progress");

export const buildPermitOptions = (entries: PermitEntry[]): PermitOption[] =>
  entries
    .map((entry) => ({
      id: entry.entry_id,
      label: (entry.title || entry.entry_id || "").trim() || entry.entry_id,
      disabled: isPermitEntryDisabled(entry),
    }))
    .sort((first, second) => first.label.localeCompare(second.label));

export const buildPermitTitleMap = (
  entries: PermitEntry[],
): Map<string, string> =>
  new Map(
    entries.map((entry) => [entry.entry_id, entry.title || entry.entry_id]),
  );

export const fetchPermitEntries = async (
  hass: HomeAssistant,
): Promise<PermitEntry[]> =>
  hass.callWS<PermitEntry[]>({
    type: "config_entries/get",
    type_filter: ["device", "hub", "service"],
    domain: DOMAIN,
  });

export const resolvePermitLabelsByDevice = (
  devices: DeviceEntry[],
  entryTitles: Map<string, string>,
): Map<string, string> => {
  const labels = new Map<string, string>();
  for (const device of devices) {
    const entryIds = Array.isArray(device.config_entries)
      ? device.config_entries
      : [];
    const entryId = entryIds.find((id) => entryTitles.has(id)) ?? entryIds[0];
    if (!entryId) continue;
    labels.set(device.id, entryTitles.get(entryId) ?? entryId);
  }
  return labels;
};

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

export const createErrorMessage =
  (
    getHass: () => LocalizeTarget | null | undefined,
  ): ((err: unknown, fallbackKey: string) => string) =>
  (err: unknown, fallbackKey: string) =>
    errorMessage(err, fallbackKey, (key) => localize(getHass(), key));

export const pad = (value: number | string): string =>
  String(value).padStart(2, "0");

export const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const formatDateTimeLocal = (date: Date): string =>
  `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const formatOptionalDateTimeLocal = (
  value: string | undefined | null,
): string => {
  const date = parseDateTimeValue(value);
  return date ? formatDateTimeLocal(date) : "";
};

export const parseDateTimeValue = (
  value: string | undefined | null,
): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getConfigEntryId = (
  config: { config_entry_id?: string | null } | null | undefined,
): string | null => config?.config_entry_id ?? null;

export const filterDomainDevices = (devices: DeviceEntry[]): DeviceEntry[] =>
  devices.filter((device) =>
    (device.identifiers ?? []).some(
      (identifier: [string, string]) => identifier[0] === DOMAIN,
    ),
  );

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

export const extractEventValue = (
  event: Event,
  fallbackElement?: (HTMLElement & { value?: string }) | null,
): string => {
  const detail = (event as CustomEvent<{ value?: string | null }>).detail;
  return detail != null && "value" in detail
    ? (detail.value ?? "")
    : (fallbackElement?.value ?? "");
};

export const isHassRunning = (
  hass: { config?: { state?: string } } | null | undefined,
): boolean => hass?.config?.state === "RUNNING";

export const formatBalanceLabel = (
  remainingMinutes: number,
  balanceUnit: string | null,
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
  return {
    text: hours > 0 ? `${hours}u ${mins}m` : `${mins}m`,
    icon: "mdi:clock-outline",
  };
};
