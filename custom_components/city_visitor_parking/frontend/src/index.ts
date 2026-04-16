import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";

const getGlobalHass = <T>(): T | undefined =>
  (window as Window & { hass?: T }).hass;

type LocalizeFunc = (key: string, ...args: Array<string | number>) => string;

type LocalizeTarget =
  | {
      localize?: LocalizeFunc;
      locale?: { language?: string };
      language?: string;
    }
  | LocalizeFunc
  | null
  | undefined;

type TranslationValue = string | TranslationObject;
interface TranslationObject {
  [key: string]: TranslationValue;
}

const DEFAULT_LANGUAGE = "en";
const BASE_URL = new URL(".", import.meta.url).toString().replace(/\/$/, "");
const translationsCache = new Map<string, TranslationObject>();
const translationsInFlight = new Map<string, Promise<void>>();
const translationLookupCache = new Map<string, Map<string, string>>();

const getStoredLanguage = (): string | undefined => {
  try {
    return localStorage.getItem("selectedLanguage") ?? undefined;
  } catch {
    return undefined;
  }
};

const getLanguage = (target: LocalizeTarget): string => {
  const globalHass = getGlobalHass<{
    locale?: { language?: string };
    language?: string;
  }>();
  const targetLang =
    target && typeof target !== "function"
      ? target.language || target.locale?.language
      : undefined;
  return (
    targetLang ||
    globalHass?.language ||
    globalHass?.locale?.language ||
    document.documentElement.lang ||
    getStoredLanguage() ||
    navigator.language ||
    DEFAULT_LANGUAGE
  );
};

const fetchTranslations = async (
  baseUrl: string,
  language: string,
): Promise<TranslationObject | null> => {
  const response = await fetch(
    `${baseUrl}/translations/${language}.json`,
  ).catch(() => null);
  if (!response || !response.ok) return null;
  try {
    return (await response.json()) as TranslationObject;
  } catch {
    return null;
  }
};

const ensureTranslations = async (target: LocalizeTarget): Promise<void> => {
  const language = getLanguage(target);
  if (translationsCache.has(language)) return;
  const inFlight = translationsInFlight.get(language);
  if (inFlight) {
    await inFlight;
    return;
  }
  const cache = (strings: TranslationObject): void => {
    translationsCache.set(language, strings);
    translationLookupCache.delete(language);
  };
  const loadPromise = (async () => {
    const languageStrings = await fetchTranslations(BASE_URL, language);
    if (languageStrings) return cache(languageStrings);
    const baseLanguage = language.split("-")[0];
    if (baseLanguage && baseLanguage !== language) {
      const baseStrings = await fetchTranslations(BASE_URL, baseLanguage);
      if (baseStrings) return cache(baseStrings);
    }
    cache((await fetchTranslations(BASE_URL, DEFAULT_LANGUAGE)) ?? {});
  })();
  translationsInFlight.set(language, loadPromise);
  await loadPromise;
  translationsInFlight.delete(language);
};

const resolveTranslationValue = (
  strings: TranslationObject,
  key: string,
): string | null => {
  const directValue = strings[key];
  if (typeof directValue === "string") return directValue;
  const cardStrings = strings.card;
  if (!cardStrings || typeof cardStrings !== "object") return null;
  const parts = key.split(".");
  let current: TranslationValue | undefined = cardStrings;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }
  return typeof current === "string" ? current : null;
};

const localize = (target: LocalizeTarget, key: string): string => {
  const language = getLanguage(target);
  const strings =
    translationsCache.get(language) || translationsCache.get(DEFAULT_LANGUAGE);
  if (!strings) return key;
  let cachedLookups = translationLookupCache.get(language);
  if (!cachedLookups) {
    cachedLookups = new Map();
    translationLookupCache.set(language, cachedLookups);
  }
  const cachedValue = cachedLookups.get(key);
  if (cachedValue !== undefined) return cachedValue;
  const resolved = resolveTranslationValue(strings, key) ?? key;
  cachedLookups.set(key, resolved);
  return resolved;
};

const EMPTY_ZONE_STATUS: ZoneStatus = {
  state: null,
  kind: null,
  start: null,
  end: null,
  remainingMinutes: null,
  balanceUnit: null,
};

const normalizeMatchValue = (value: string | undefined | null): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();
// Strips all non-alphanumeric characters for matching purposes only (not for storage or display).
const normalizePlateValue = (value: string | undefined | null): string =>
  normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");

const createFavoriteIndex = (favorites: FavoriteItem[]) => {
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

const clearFavoriteTransientState = (context: {
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

const invalidateFavoritesCache = (
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

const setPendingPermitDefaults = (
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

const applyZoneStatus = (
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

const DOMAIN = "city_visitor_parking";
const RESERVATION_STARTED_EVENT = "city-visitor-parking-reservation-started";

type HomeAssistant = {
  callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
  callService: <T = unknown>(
    domain: string,
    service: string,
    data: Record<string, unknown>,
  ) => Promise<T>;
  config?: { state?: string };
  localize?: LocalizeFunc;
  language?: string;
  locale?: Record<string, unknown>;
};

type DeviceEntry = {
  id: string;
  name?: string | null;
  identifiers?: Array<[string, string]>;
  config_entries?: string[];
};

type PermitEntry = {
  entry_id: string;
  title?: string | null;
  state?: string | null;
  disabled_by?: string | null;
};

type PermitOption = {
  id: string;
  label: string;
  disabled: boolean;
};

type FavoriteOption = {
  id?: string;
  license_plate?: string;
  name?: string;
};
type FavoriteItem = FavoriteOption & {
  [key: string]: unknown;
};

type ZoneStatus = {
  state: "chargeable" | "free" | null;
  kind: "current" | "next" | null;
  start: string | null;
  end: string | null;
  remainingMinutes: number | null;
  balanceUnit: string | null;
};

type ValueElement = HTMLElement & { value?: string };
type ProgressButtonElement = HTMLElement & {
  actionSuccess?: () => void;
  actionError?: () => void;
};

type StatusType = "info" | "warning" | "success";
type StatusState = {
  message: string;
  type: StatusType;
  clearHandle: number | null;
};

const createStatusState = (): StatusState => ({
  message: "",
  type: "info",
  clearHandle: null,
});

const triggerProgressButtonFeedback = async (
  host: LitElement,
  selector: string,
  outcome: "success" | "error",
): Promise<void> => {
  await host.updateComplete;
  const button = host.renderRoot.querySelector(
    selector,
  ) as ProgressButtonElement | null;
  if (!button) return;
  if (outcome === "success") {
    button.actionSuccess?.();
  } else {
    button.actionError?.();
  }
};

const setStatusState = (
  state: StatusState,
  message: string,
  type: StatusType,
  requestRender: () => void,
  clearAfterMs?: number,
): void => {
  if (state.clearHandle !== null) {
    window.clearTimeout(state.clearHandle);
    state.clearHandle = null;
  }
  state.message = message;
  state.type = type;
  if (clearAfterMs) {
    state.clearHandle = window.setTimeout(() => {
      state.clearHandle = null;
      state.message = "";
      state.type = "info";
      requestRender();
    }, clearAfterMs);
  }
};

const clearStatusState = (
  state: StatusState,
  requestRender: () => void,
): void => {
  if (state.clearHandle !== null) {
    window.clearTimeout(state.clearHandle);
    state.clearHandle = null;
  }
  if (!state.message && state.type === "info") return;
  state.message = "";
  state.type = "info";
  requestRender();
};

const BASE_CARD_STYLES = css`
  :host {
    display: block;
  }
  ha-card {
    position: relative;
  }
  .card-content {
    display: flex;
    flex-direction: column;
  }
  .row > ha-input,
  .row > ha-textfield,
  .row > ha-select,
  .row > ha-selector,
  .row > ha-alert {
    margin: 0;
  }
  .card-content > .row + .row {
    margin-top: var(--ha-space-2);
  }
  .card-content > .row.datetime-row {
    margin-top: var(--ha-space-1);
  }
  .datetime-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--ha-space-2);
  }
  .datetime-fields > .datetime-row {
    margin-top: 0;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
  }
  .card-header .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    padding: 0 var(--ha-space-4) 0 var(--ha-space-2);
  }
  ha-alert {
    margin: 0;
  }
  .datetime-row ha-input,
  .datetime-row ha-textfield {
    width: 100%;
  }
`;

const isPermitEntryDisabled = (entry: PermitEntry): boolean =>
  Boolean(entry.disabled_by) ||
  (entry.state != null &&
    entry.state !== "loaded" &&
    entry.state !== "setup_in_progress");

const buildPermitOptions = (entries: PermitEntry[]): PermitOption[] =>
  entries
    .map((entry) => ({
      id: entry.entry_id,
      label: (entry.title || entry.entry_id || "").trim() || entry.entry_id,
      disabled: isPermitEntryDisabled(entry),
    }))
    .sort((first, second) => first.label.localeCompare(second.label));

const buildPermitTitleMap = (entries: PermitEntry[]): Map<string, string> =>
  new Map(
    entries.map((entry) => [entry.entry_id, entry.title || entry.entry_id]),
  );

const fetchPermitEntries = async (
  hass: HomeAssistant,
): Promise<PermitEntry[]> =>
  hass.callWS<PermitEntry[]>({
    type: "config_entries/get",
    type_filter: ["device", "hub", "service"],
    domain: DOMAIN,
  });

const resolvePermitLabelsByDevice = (
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

const errorMessage = (
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

const pad = (value: number | string): string => String(value).padStart(2, "0");

const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDateTimeLocal = (date: Date): string =>
  `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const HA_STARTING_MESSAGE_KEY = "ui.panel.lovelace.warning.starting";
const getCardText = (key: string): string | null => {
  const value = localize(getGlobalHass<LocalizeTarget>(), key);
  return value === key ? null : value;
};

const getConfigEntryId = (
  config: { config_entry_id?: string | null } | null | undefined,
): string | null => config?.config_entry_id ?? null;

const filterDomainDevices = (devices: DeviceEntry[]): DeviceEntry[] =>
  devices.filter((device) =>
    (device.identifiers ?? []).some(
      (identifier: [string, string]) => identifier[0] === DOMAIN,
    ),
  );

const getHassLanguage = (
  hass: HomeAssistant | null | undefined,
): string | undefined => {
  if (typeof hass?.language === "string" && hass.language) return hass.language;
  const loc = hass?.locale as { language?: unknown } | undefined;
  return typeof loc?.language === "string" ? loc.language : undefined;
};

const renderCardHeader = (title: string, icon: string | undefined): unknown => {
  if (!title && !icon) return nothing;
  return html`
    <h1 class="card-header">
      <div class="name">
        ${icon ? html`<ha-icon class="icon" .icon=${icon}></ha-icon>` : nothing}
        ${title}
      </div>
    </h1>
  `;
};

const renderPermitSelect = (params: {
  hass: HomeAssistant | null | undefined;
  label: string;
  value: string;
  disabled: boolean;
  preview?: boolean;
  onSelected: (event: Event) => void;
}): TemplateResult => {
  if (params.preview) {
    return html`
      <div class="row">
        <ha-input
          appearance="material"
          .label=${params.label}
          .value=${params.value}
          ?disabled=${true}
        ></ha-input>
      </div>
    `;
  }
  return html`
    <div class="row">
      <ha-selector
        id="permitSelect"
        .hass=${params.hass}
        .selector=${{
          config_entry: {
            integration: DOMAIN,
          },
        }}
        .label=${params.label}
        .value=${params.value}
        .required=${false}
        ?disabled=${params.disabled}
        @value-changed=${params.onSelected}
      ></ha-selector>
    </div>
  `;
};

const renderFavoriteSelect = (params: {
  showName: boolean;
  showFavorites: boolean;
  favoriteValue: string;
  favoriteSelectDisabled: boolean;
  hass: HomeAssistant | null | undefined;
  favoritesOptions: FavoriteOption[];
  favoritesError: string | null;
  preview?: boolean;
  wrapSelect?: (content: TemplateResult) => unknown;
  localize: (key: string, ...args: Array<string | number>) => string;
  onSelected: (event: Event) => void;
}): TemplateResult | typeof nothing => {
  if (!params.showName) return nothing;

  type FavoriteSelectOption = {
    value: string;
    label: string;
  };

  const seenValues = new Set<string>();
  const selectOptions: FavoriteSelectOption[] = [];

  for (const favorite of params.favoritesOptions) {
    const name = favorite.name?.trim() || "";
    const valueKey = normalizeMatchValue(name);
    if (!valueKey || seenValues.has(valueKey)) continue;
    seenValues.add(valueKey);
    selectOptions.push({ value: name, label: name });
  }
  selectOptions.sort(
    (first, second) =>
      first.label.localeCompare(second.label) ||
      first.value.localeCompare(second.value),
  );
  const inputValue = params.favoriteValue;

  if (params.preview) {
    return html`
      <div class="row">
        <ha-input
          appearance="material"
          .label=${params.localize("field.name")}
          .value=${inputValue}
          ?disabled=${true}
        ></ha-input>
      </div>
    `;
  }

  if (!params.showFavorites) {
    return html`
      <div class="row">
        <ha-input
          id="favorite"
          appearance="material"
          .label=${params.localize("field.name")}
          .value=${inputValue}
        ></ha-input>
      </div>
    `;
  }

  const selectContent = html`
    <ha-selector
      id="favorite"
      .hass=${params.hass}
      .selector=${{
        select: {
          options: selectOptions,
          mode: "dropdown",
          custom_value: true,
          clearable: true,
        },
      }}
      .label=${params.localize("field.name")}
      .value=${inputValue}
      .required=${false}
      ?disabled=${params.favoriteSelectDisabled}
      @value-changed=${params.onSelected}
    ></ha-selector>
  `;

  const wrappedSelect = params.wrapSelect
    ? params.wrapSelect(selectContent)
    : selectContent;

  return html`
    <div class="row">
      ${wrappedSelect}
      ${params.favoritesError
        ? html`<ha-alert alert-type="warning">
            ${params.favoritesError}
          </ha-alert>`
        : nothing}
    </div>
  `;
};

const formatBalanceLabel = (
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

const renderFavoriteActionRow = (params: {
  showFavorites: boolean;
  showAddFavorite: boolean;
  showRemoveFavorite: boolean;
  selectedFavoriteId: string;
  favoriteRemoveDisabled: boolean;
  addFavoriteChecked: boolean;
  startInFlight: boolean;
  startButtonSuccess: boolean;
  startButtonWarning: boolean;
  startButtonTimeConflict: boolean;
  startDisabled: boolean;
  hasTarget: boolean;
  remainingMinutes: number | null;
  balanceUnit: string | null;
  localize: (key: string, ...args: Array<string | number>) => string;
}): TemplateResult => {
  const showFavoriteButton =
    params.showFavorites &&
    (params.showRemoveFavorite || params.showAddFavorite);
  const showBalance =
    !showFavoriteButton && params.hasTarget && params.remainingMinutes !== null;
  return html`
    <div class="row actions">
      <div class="favorite-actions">
        ${params.showFavorites
          ? params.showRemoveFavorite
            ? html`
                <ha-badge
                  id="removeFavorite"
                  type="button"
                  .label=${params.localize("action.remove_favorite")}
                  data-favorite-id=${params.selectedFavoriteId}
                  ?disabled=${params.favoriteRemoveDisabled}
                  title=${params.localize("action.remove_favorite")}
                  aria-label=${params.localize("action.remove_favorite")}
                >
                  <ha-icon slot="icon" icon="mdi:trash-can-outline"></ha-icon>
                </ha-badge>
              `
            : params.showAddFavorite
              ? html`
                  <ha-badge
                    id="addFavoriteWrap"
                    type="button"
                    .label=${params.localize("action.add_favorite")}
                    class=${params.addFavoriteChecked ? "badge-checked" : ""}
                    title=${params.localize("action.add_favorite")}
                    aria-label=${params.localize("action.add_favorite")}
                    aria-pressed=${params.addFavoriteChecked ? "true" : "false"}
                  >
                    <ha-icon
                      slot="icon"
                      icon=${params.addFavoriteChecked
                        ? "mdi:heart"
                        : "mdi:heart-outline"}
                    ></ha-icon>
                  </ha-badge>
                `
              : nothing
          : nothing}
        ${showBalance
          ? (() => {
              const { text, icon } = formatBalanceLabel(
                params.remainingMinutes!,
                params.balanceUnit,
              );
              return html`
                <ha-badge .label=${text}>
                  <ha-icon slot="icon" icon=${icon}></ha-icon>
                </ha-badge>
              `;
            })()
          : nothing}
      </div>
      ${(() => {
        const isSuccess = params.startButtonSuccess;
        const isWarning = params.startButtonWarning;
        const isTimeConflict = params.startButtonTimeConflict;
        const buttonClass = `start-button${isSuccess ? " success" : isWarning ? " warning" : ""}`;
        const label = isWarning
          ? params.localize("action.permit_unavailable")
          : isTimeConflict
            ? params.localize("action.time_unavailable")
            : params.localize("action.start_reservation");
        return html`
          <ha-progress-button
            id="startReservation"
            class=${buttonClass}
            variant=${isSuccess ? "success" : isWarning ? "danger" : nothing}
            appearance=${isSuccess || isWarning || isTimeConflict
              ? "filled"
              : nothing}
            .progress=${params.startInFlight}
            ?disabled=${params.startDisabled}
            aria-label=${label}
            title=${label}
          >
            ${label}
          </ha-progress-button>
        `;
      })()}
    </div>
  `;
};

const makeDedupedLoader = <T>(
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

const extractEventValue = (
  event: Event,
  fallbackElement?: ValueElement | null,
): string => {
  const detail = (event as CustomEvent<{ value?: string | null }>).detail;
  return detail != null && "value" in detail
    ? (detail.value ?? "")
    : (fallbackElement?.value ?? "");
};

const createLocalize =
  (
    getHass: () => LocalizeTarget | null | undefined,
  ): ((key: string, ...args: Array<string | number>) => string) =>
  (key: string, ..._args: Array<string | number>) =>
    localize(getHass(), key);

const createErrorMessage =
  (
    getHass: () => LocalizeTarget | null | undefined,
  ): ((err: unknown, fallbackKey: string) => string) =>
  (err: unknown, fallbackKey: string) =>
    errorMessage(err, fallbackKey, (key) => localize(getHass(), key));

const getLoadingMessage = (hass: LocalizeTarget | null | undefined): string => {
  const hassLocalize = typeof hass === "function" ? hass : hass?.localize;
  const haMessage = hassLocalize?.(HA_STARTING_MESSAGE_KEY);
  if (haMessage && haMessage !== HA_STARTING_MESSAGE_KEY) return haMessage;
  const key = "message.home_assistant_loading";
  const message = localize(hass, key);
  return message === key ? "" : message;
};

const renderLoadingCard = (
  hass: LocalizeTarget | null | undefined,
): TemplateResult => {
  const loadingMessage = getLoadingMessage(
    hass ?? getGlobalHass<LocalizeTarget>(),
  );
  return html`
    <ha-card>
      <div class="card-content">
        <ha-alert alert-type="warning">${loadingMessage}</ha-alert>
      </div>
    </ha-card>
  `;
};

const formatOptionalDateTimeLocal = (
  value: string | undefined | null,
): string => {
  const date = parseDateTimeValue(value);
  return date ? formatDateTimeLocal(date) : "";
};

const parseDateTimeValue = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isHassRunning = (
  hass: { config?: { state?: string } } | null | undefined,
): boolean => hass?.config?.state === "RUNNING";

const createRenderScheduler = (requestUpdate: () => void): (() => void) => {
  let handle: number | null = null;
  return () => {
    if (handle !== null) return;
    handle = window.requestAnimationFrame(() => {
      handle = null;
      requestUpdate();
    });
  };
};

const isInEditor = (startNode: Node): boolean => {
  const selector =
    "hui-card-preview, hui-card-picker, hui-card-element-editor, " +
    "hui-card-edit-mode, hui-dialog-edit-card";
  let node: Node | null = startNode;
  while (node) {
    if (node instanceof HTMLElement && node.matches(selector)) return true;
    if (node instanceof HTMLElement && node.assignedSlot) {
      node = node.assignedSlot;
      continue;
    }
    const root = node.getRootNode?.();
    if (root instanceof ShadowRoot) {
      node = root.host;
      continue;
    }
    node = node.parentNode;
  }
  return false;
};

abstract class BaseLocalizedCard<TConfig> extends LitElement {
  _config: TConfig | null = null;
  _hass: HomeAssistant | null = null;
  _statusState = createStatusState();
  _requestRender = createRenderScheduler(() => this.requestUpdate());
  _localize = createLocalize(() => this._hass);
  _errorMessage = createErrorMessage(() => this._hass);

  _setStatus(message: string, type: StatusType, clearAfterMs?: number): void {
    setStatusState(
      this._statusState,
      message,
      type,
      this._requestRender,
      clearAfterMs,
    );
  }

  _clearStatus(): void {
    clearStatusState(this._statusState, this._requestRender);
  }

  _isInEditor(): boolean {
    return isInEditor(this);
  }
}

const defineElementIfMissing = (
  tagName: string,
  ctor: CustomElementConstructor,
): void => {
  const scopedRegistry = (
    window as Window & { __scopedElementsRegistry?: CustomElementRegistry }
  ).__scopedElementsRegistry;
  for (const registry of [customElements, scopedRegistry]) {
    if (registry && !registry.get(tagName)) registry.define(tagName, ctor);
  }
};

const registerCustomCard = (
  cardType: string,
  ctor: CustomElementConstructor,
  name: string,
  description: string,
): void => {
  defineElementIfMissing(cardType, ctor);
  const win = window as Window & {
    customCards?: Array<{ type: string; name: string; description: string }>;
  };
  win.customCards = win.customCards || [];
  const existing = win.customCards.find((card) => card.type === cardType);
  if (existing) {
    existing.name = name;
    existing.description = description;
    return;
  }
  win.customCards.push({ type: cardType, name, description });
};

const registerCustomCardWithTranslations = (
  cardType: string,
  ctor: CustomElementConstructor,
  nameKey: string,
  descriptionKey: string,
): void => {
  const registerCard = (): void => {
    const name = getCardText(nameKey) ?? cardType;
    const description = descriptionKey
      ? (getCardText(descriptionKey) ?? "")
      : "";
    registerCustomCard(cardType, ctor, name, description);
  };
  // Register immediately so Lovelace can instantiate the element before
  // translations finish loading; then refresh picker metadata when ready.
  registerCard();
  const hass = getGlobalHass<HomeAssistant>();
  void ensureTranslations(hass).then(registerCard);
};

type PickerCtor = CustomElementConstructor & {
  prototype: {
    _loadCards?: () => void;
    __cvpHidePatched?: boolean;
    __cvpHideTypes?: Set<string>;
  };
};

const hideCustomCardFromPicker = (cardType: string): void => {
  const applyPatch = (pickerCtor: PickerCtor): void => {
    const { prototype } = pickerCtor;
    if (!prototype.__cvpHideTypes) prototype.__cvpHideTypes = new Set();
    prototype.__cvpHideTypes.add(cardType);
    if (prototype.__cvpHidePatched) return;
    const originalLoadCards = prototype._loadCards;
    if (!originalLoadCards) return;
    prototype._loadCards = function () {
      originalLoadCards.call(this);
      const hideTypes = prototype.__cvpHideTypes;
      if (Array.isArray((this as { _cards?: unknown })._cards)) {
        (this as { _cards: Array<{ card?: { type?: string } }> })._cards = (
          this as { _cards: Array<{ card?: { type?: string } }> }
        )._cards.filter((entry) => !hideTypes?.has(entry.card?.type ?? ""));
      }
    };
    prototype.__cvpHidePatched = true;
  };
  const existing = customElements.get("hui-card-picker") as
    | PickerCtor
    | undefined;
  if (existing) {
    applyPatch(existing);
  } else {
    customElements
      .whenDefined("hui-card-picker")
      .then(() =>
        applyPatch(customElements.get("hui-card-picker") as PickerCtor),
      );
  }
};

type FormSchema = { name: string };
type SelectOption = [string, string];

abstract class BaseCardEditor<TConfig> extends LitElement {
  public hass?: unknown;
  protected _config?: TConfig;

  setConfig(config: TConfig): void {
    this._config = config;
    this.requestUpdate();
  }

  protected _handleValueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const config = ev.detail?.value ?? {};
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

const buildFormHelpers = (
  localizeTarget: LocalizeTarget | LocalizeFunc,
  prefix: string,
): {
  computeLabel: (schema: FormSchema) => string;
  computeHelper: (schema: FormSchema) => string;
} => {
  const resolve = (section: string, name: string): string => {
    const fieldName = name === "config_entry_id" ? "config_entry" : name;
    const key = `${prefix}.${section}.${fieldName}`;
    const result = localize(localizeTarget, key);
    return result === key ? "" : result;
  };
  return {
    computeLabel: (schema) => resolve("field", schema.name),
    computeHelper: (schema) => resolve("description", schema.name),
  };
};

const buildCardTypeOptions = (
  localizeTarget: LocalizeTarget | LocalizeFunc,
  prefix: string,
): SelectOption[] => {
  const t = (key: string): string => {
    const result = localize(localizeTarget, `${prefix}.value.card_type.${key}`);
    return result === `${prefix}.value.card_type.${key}` ? "" : result;
  };
  return [
    ["custom:city-visitor-parking-card", t("new") || "New reservation card"],
    [
      "custom:city-visitor-parking-active-card",
      t("active") || "Active reservations card",
    ],
  ];
};

type ParkingCardEditorConfig = {
  type: string;
  title?: string;
  icon?: string;
  show_name?: boolean;
  show_favorites?: boolean;
  show_start_time?: boolean;
  show_end_time?: boolean;
  default_license_plate?: string;
  config_entry_id?: string;
};

type CardEditorFormSchema = ReadonlyArray<Record<string, unknown>>;

const buildCardEditorSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
): CardEditorFormSchema => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-card",
    options: cardTypeOptions,
  },
  { name: "title", selector: { text: {} }, required: false },
  { name: "icon", selector: { icon: {} }, required: false },
  {
    type: "expandable",
    name: "display_options",
    expanded: displayOptionsExpanded,
    flatten: true,
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false,
      },
      { name: "show_name", selector: { boolean: {} }, default: true },
      { name: "show_favorites", selector: { boolean: {} }, default: true },
      { name: "show_start_time", selector: { boolean: {} }, default: true },
      { name: "show_end_time", selector: { boolean: {} }, default: true },
      {
        name: "default_license_plate",
        selector: { text: {} },
        required: false,
      },
    ],
  },
];

class CityVisitorParkingCardEditor extends BaseCardEditor<ParkingCardEditorConfig> {
  protected render(): TemplateResult {
    if (!this.hass) return html``;
    const localizeTarget = this.hass;
    void ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      "editor",
    );
    const cardTypeOptions = buildCardTypeOptions(localizeTarget, "editor");
    const displayOptionsExpanded = Boolean(
      this._config?.config_entry_id ||
      this._config?.show_name === false ||
      this._config?.show_favorites === false ||
      this._config?.show_start_time === false ||
      this._config?.show_end_time === false ||
      this._config?.default_license_plate,
    );
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildCardEditorSchema(
          cardTypeOptions,
          displayOptionsExpanded,
        )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
}

defineElementIfMissing(
  "city-visitor-parking-card-editor",
  CityVisitorParkingCardEditor,
);

const createConfigFormGetter =
  (
    prefix: string,
    buildSchema: (
      cardTypeOptions: ReadonlyArray<readonly [string, string]>,
      target: LocalizeTarget,
    ) => CardEditorFormSchema,
  ) =>
  async (hassOrLocalize?: HomeAssistant | LocalizeFunc) => {
    const localizeTarget =
      hassOrLocalize && typeof hassOrLocalize !== "function"
        ? hassOrLocalize
        : (getGlobalHass<HomeAssistant>() ?? hassOrLocalize);
    await ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      prefix,
    );
    const cardTypeOptions = buildCardTypeOptions(localizeTarget, prefix);
    return {
      schema: buildSchema(cardTypeOptions, localizeTarget),
      computeLabel,
      computeHelper,
    };
  };

const getCardConfigForm = createConfigFormGetter("editor", (cardTypeOptions) =>
  buildCardEditorSchema(cardTypeOptions, false),
);

type ActiveParkingCardEditorConfig = {
  type: string;
  title?: string;
  icon?: string;
  config_entry_id?: string;
};

const buildActiveCardEditorSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
  displayOptionsTitle: string,
): CardEditorFormSchema => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-active-card",
    options: cardTypeOptions,
  },
  { name: "title", selector: { text: {} }, required: false },
  { name: "icon", selector: { icon: {} }, required: false },
  {
    type: "expandable",
    name: "display_options",
    title: displayOptionsTitle,
    expanded: displayOptionsExpanded,
    flatten: true,
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false,
      },
    ],
  },
];

class CityVisitorParkingActiveCardEditor extends BaseCardEditor<ActiveParkingCardEditorConfig> {
  protected render(): TemplateResult {
    if (!this.hass) return html``;
    const localizeTarget = this.hass;
    void ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      "active_editor",
    );
    const cardTypeOptions = buildCardTypeOptions(
      localizeTarget,
      "active_editor",
    );
    const displayOptionsTitle = localize(
      localizeTarget,
      "active_editor.field.display_options",
    );
    const displayOptionsExpanded = Boolean(this._config?.config_entry_id);
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildActiveCardEditorSchema(
          cardTypeOptions,
          displayOptionsExpanded,
          displayOptionsTitle,
        )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
}

defineElementIfMissing(
  "city-visitor-parking-active-card-editor",
  CityVisitorParkingActiveCardEditor,
);

const getActiveCardConfigForm = createConfigFormGetter(
  "active_editor",
  (cardTypeOptions, target) =>
    buildActiveCardEditorSchema(
      cardTypeOptions,
      false,
      localize(target, "active_editor.field.display_options"),
    ),
);

(() => {
  const CARD_TYPE = "city-visitor-parking-card";
  const WS_LIST_FAVORITES = "city_visitor_parking/favorites";
  const WS_GET_STATUS = "city_visitor_parking/status";
  // Minimum interval between status fetches triggered by hass updates.
  const STATUS_THROTTLE_MS = 60000;
  // Background polling interval for zone status (and on page visibility restore).
  // The coordinator already polls at 5–30 min; no need to fetch more often than that.
  const STATUS_REFRESH_MS = 300000;

  type ZoneStatusResponse = {
    state?: string | null;
    window_kind?: string | null;
    window_start?: string | null;
    window_end?: string | null;
    remaining_minutes?: number | null;
    balance_unit?: string | null;
  };
  type CardConfig = {
    type: string;
    title?: string;
    icon?: string;
    show_name?: boolean;
    show_favorites?: boolean;
    show_start_time?: boolean;
    show_end_time?: boolean;
    default_license_plate?: string;
    config_entry_id?: string;
    device_id?: string;
  };
  type CheckedElement = HTMLElement & { checked: boolean; disabled?: boolean };
  type FavoriteActionState = {
    showAddFavorite: boolean;
    showRemoveFavorite: boolean;
    selectedFavorite: FavoriteItem | null;
    removeFavorite: FavoriteItem | null;
  };

  const INPUT_VALUE_IDS = new Set([
    "licensePlate",
    "favorite",
    "startDateTime",
    "endDateTime",
  ]);
  const CHANGE_VALUE_IDS = new Set(["startDateTime", "endDateTime"]);

  class CityVisitorParkingNewReservationCard extends BaseLocalizedCard<CardConfig> {
    static styles = [
      BASE_CARD_STYLES,
      css`
        ha-input,
        ha-textfield,
        ha-select,
        ha-selector {
          width: 100%;
        }
        .actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .favorite-actions {
          display: flex;
          align-items: center;
        }
        .favorite-actions ha-badge {
          --badge-color: var(--secondary-text-color);
        }
        .favorite-actions .badge-checked {
          --badge-color: var(--primary-color);
        }
        .start-button {
          margin-left: auto;
        }
      `,
    ];
    _deviceId: string | null = null;
    _deviceEntryId: string | null = null;
    _deviceLoadPromise: Promise<void> | null = null;
    _deviceIdByEntryId = new Map<string, string | null>();
    _favorites: FavoriteItem[] = [];
    _favoritesError: string | null = null;
    _favoritesLoadedFor: string | null = null;
    _favoritesRetryAfter = 0;
    _favoritesLoading = false;
    _favoritesByPlate = new Map<string, FavoriteItem>();
    _favoritesByPlateName = new Map<string, FavoriteItem>();
    _favoritesByValue = new Map<string, FavoriteItem>();
    _permitOptions: PermitOption[] = [];
    _permitOptionsLoaded = false;
    _permitOptionsLoading = false;
    _permitOptionsLoadPromise: Promise<void> | null = null;
    _formValues: Record<string, string> = {};
    _pendingRemoveFavoriteId: string | null = null;
    _selectedEntryId: string | null = null;
    _startButtonSuccess = false;
    _startButtonSuccessTimeout: number | null = null;
    _startInFlight = false;
    _favoriteRemoveInFlight = false;
    _addFavoriteChecked = false;
    _suppressFavoriteClear = false;
    _zoneState: "chargeable" | "free" | null = null;
    _windowKind: "current" | "next" | null = null;
    _windowStartIso: string | null = null;
    _windowEndIso: string | null = null;
    _remainingMinutes: number | null = null;
    _balanceUnit: string | null = null;
    _zoneStatusTsByEntryId = new Map<string, number>();
    _zoneStatusInFlightByEntryId = new Map<string, Promise<void>>();
    _zoneStatusByEntryId = new Map<string, ZoneStatus>();
    _pendingPermitDefaultsEntryId: string | null = null;
    _pendingPermitDefaultsForce = false;
    _statusRefreshHandle: number | null = null;
    _statusVisibilityHandler: (() => void) | null = null;
    _translationsReady = false;
    _translationsLanguage: string | null = null;
    _activeReservationsByPlate = new Map<
      string,
      Array<{ start: Date; end: Date }>
    >();
    _activeReservationsLoadedFor: string | null = null;
    _prevHaState?: string;
    _licensePlateFocused = false;
    _onClick = (event: Event) => this._handleClick(event);
    _onInput = (event: Event) => this._handleInput(event);
    _onChange = (event: Event) => this._handleChange(event);
    _onLicensePlateFocusIn = () => {
      if (this._licensePlateFocused) return;
      this._licensePlateFocused = true;
      this._requestRender();
    };
    _onLicensePlateFocusOut = () => {
      if (!this._licensePlateFocused) return;
      this._licensePlateFocused = false;
      this._requestRender();
    };
    _onPermitSelectChange = (event: Event) =>
      this._handlePermitSelectChange(event);
    _onFavoriteSelectChange = (event: Event) =>
      this._handleFavoriteSelectChange(event);

    static async getConfigForm(hass?: HomeAssistant): Promise<{
      readonly schema: ReadonlyArray<Record<string, unknown>>;
    }> {
      return getCardConfigForm(hass);
    }

    static getConfigElement(): HTMLElement {
      return document.createElement("city-visitor-parking-card-editor");
    }

    static getStubConfig(): CardConfig {
      return {
        type: `custom:${CARD_TYPE}`,
        show_name: true,
        show_favorites: true,
        show_start_time: true,
        show_end_time: true,
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw new Error(
          localize(
            this._hass ?? getGlobalHass<HomeAssistant>(),
            "message.invalid_config",
          ),
        );
      }
      const priorEntryId = this._getActiveEntryId();
      const priorShowName = this._config?.show_name ?? true;
      const priorShowFavorites = this._config?.show_favorites ?? true;
      this._config = {
        show_name: config.show_name !== false,
        show_favorites: config.show_favorites !== false,
        show_start_time: config.show_start_time !== false,
        show_end_time: config.show_end_time !== false,
        ...config,
      };
      if (
        this._config.default_license_plate &&
        !this._formValues["licensePlate"]
      ) {
        this._setInputValue("licensePlate", this._config.default_license_plate);
      }
      if (priorShowName && !this._config.show_name) {
        this._setInputValue("favorite", "");
      }
      if (priorShowFavorites && !this._config.show_favorites) {
        this._resetFavoritesState();
        this._setInputValue("favorite", "");
      }
      if (getConfigEntryId(this._config)) {
        this._selectedEntryId = null;
      }
      const entryChanged = this._getActiveEntryId() !== priorEntryId;
      if (this._config.device_id) {
        this._deviceId = this._config.device_id;
        this._deviceEntryId = getConfigEntryId(this._config);
        if (entryChanged) this._resetFavoritesState();
      } else if (entryChanged) {
        this._resetDeviceState();
      }
      this._syncEntryState(true);
    }

    set hass(hass: HomeAssistant) {
      const prev = this._prevHaState;
      this._prevHaState = hass.config?.state;
      this._hass = hass;
      const nextLanguage = getHassLanguage(hass) || navigator.language || "en";
      if (
        nextLanguage !== this._translationsLanguage ||
        !this._translationsReady
      ) {
        this._translationsReady = false;
        void ensureTranslations(this._hass).then(() => {
          this._translationsReady = true;
          this._translationsLanguage = nextLanguage;
          this.requestUpdate();
        });
      }
      if (prev !== "RUNNING" && hass.config?.state === "RUNNING") {
        invalidateFavoritesCache(this, { resetRetryAfter: true });
        this._zoneStatusTsByEntryId.clear();
      }
      this._syncEntryState(false);
    }

    disconnectedCallback(): void {
      super.disconnectedCallback();
      this._clearStatusRefresh();
    }

    getCardSize(): number {
      return 4;
    }

    getGridOptions(): Record<string, number> {
      return {
        columns: 12,
        min_columns: 6,
        min_rows: 2,
      };
    }

    async _ensureDeviceId(): Promise<void> {
      if (!this._hass) return;
      const entryId = this._getActiveEntryId();
      if (!entryId) return;
      if (this._config?.device_id) {
        this._deviceId = this._config.device_id;
        this._deviceEntryId = getConfigEntryId(this._config) || entryId;
        return;
      }
      if (this._deviceEntryId === entryId && this._deviceId) return;
      const cachedDeviceId = this._deviceIdByEntryId.get(entryId);
      if (cachedDeviceId !== undefined) {
        this._deviceId = cachedDeviceId;
        this._deviceEntryId = entryId;
        this._requestRender();
        return;
      }
      if (this._deviceLoadPromise) return;
      this._deviceLoadPromise = this._hass
        .callWS<DeviceEntry[]>({ type: "config/device_registry/list" })
        .then((devices) => {
          const match = devices.find(
            (device: DeviceEntry) =>
              (device.identifiers ?? []).some(
                (identifier: [string, string]) => identifier[0] === DOMAIN,
              ) &&
              Array.isArray(device.config_entries) &&
              device.config_entries.includes(entryId),
          );
          const deviceId = match ? match.id : null;
          this._deviceId = deviceId;
          if (deviceId) this._deviceIdByEntryId.set(entryId, deviceId);
          this._deviceEntryId = entryId;
        })
        .catch(() => {
          this._deviceId = null;
          this._deviceEntryId = entryId;
        })
        .finally(() => {
          this._deviceLoadPromise = null;
          this._requestRender();
        });
    }

    _ensurePermitOptions(): void {
      if (getConfigEntryId(this._config) || !this._hass) return;
      if (this._permitOptionsLoaded || this._permitOptionsLoadPromise) return;
      void this._loadPermitOptions();
    }

    _maybeSelectSinglePermit(): void {
      if (getConfigEntryId(this._config)) return;
      if (!this._permitOptionsLoaded || this._permitOptions.length !== 1)
        return;
      if (this._getActiveEntryId()) return;
      this._handlePermitChange(this._permitOptions[0].id);
    }

    async _loadPermitOptions(): Promise<void> {
      if (!this._hass || getConfigEntryId(this._config)) return;
      const hass = this._hass;
      if (this._permitOptionsLoadPromise) return this._permitOptionsLoadPromise;
      this._permitOptionsLoading = true;
      this._requestRender();
      const loadPromise = (async () => {
        try {
          const result = await fetchPermitEntries(hass);
          this._permitOptions = buildPermitOptions(result);
          this._permitOptionsLoaded = true;
          this._maybeSelectSinglePermit();
        } catch {
          this._permitOptions = [];
          this._permitOptionsLoaded = false;
        } finally {
          this._permitOptionsLoading = false;
          this._permitOptionsLoadPromise = null;
          this._requestRender();
        }
      })();
      this._permitOptionsLoadPromise = loadPromise;
      return loadPromise;
    }

    async _maybeLoadFavorites(): Promise<void> {
      if (
        !this._hass ||
        !this._config?.show_favorites ||
        !this._config?.show_name
      )
        return;
      if (!isHassRunning(this._hass)) return;
      const entryId = this._getActiveEntryId();
      if (!entryId) return;
      if (this._permitOptions.some((o) => o.id === entryId && o.disabled))
        return;
      if (Date.now() < this._favoritesRetryAfter) return;
      if (this._favoritesLoading) return;
      if (this._favoritesLoadedFor === entryId) return;
      this._favoritesLoadedFor = entryId;
      this._favoritesError = null;
      this._favoritesLoading = true;
      this._requestRender();
      try {
        const result = await this._hass.callWS<{ favorites?: FavoriteItem[] }>({
          type: WS_LIST_FAVORITES,
          config_entry_id: entryId,
        });
        this._setFavorites(
          Array.isArray(result?.favorites) ? result.favorites : [],
        );
        this._favoritesRetryAfter = 0;
      } catch (err: unknown) {
        invalidateFavoritesCache(this);
        this._favoritesRetryAfter = Date.now() + 15000;
        this._setFavorites([]);
        this._favoritesError = this._errorMessage(
          err,
          "message.load_favorites_failed",
        );
      } finally {
        this._favoritesLoading = false;
        if (this._pendingRemoveFavoriteId) {
          const pendingId = normalizeMatchValue(this._pendingRemoveFavoriteId);
          const stillPresent = this._favorites.some(
            (favorite: FavoriteItem) => {
              const candidate = normalizeMatchValue(
                favorite.id || favorite.license_plate,
              );
              return candidate === pendingId;
            },
          );
          if (this._favoritesError || stillPresent) {
            this._setStatus(
              this._localize("message.favorite_remove_failed"),
              "warning",
            );
          } else {
            this._setStatus(
              this._localize("message.favorite_removed"),
              "success",
              5000,
            );
            this._setInputValue("licensePlate", "");
            this._setInputValue("favorite", "");
          }
          this._pendingRemoveFavoriteId = null;
        }
        this._requestRender();
      }
    }

    async _loadZoneStatusForEntry(entryId: string): Promise<void> {
      if (!this._hass || !entryId) return;
      const hass = this._hass;
      const force = this._pendingPermitDefaultsEntryId === entryId;
      const now = Date.now();
      const lastTs = this._zoneStatusTsByEntryId.get(entryId);
      if (!force && lastTs !== undefined && now - lastTs < STATUS_THROTTLE_MS)
        return;
      const inFlight = this._zoneStatusInFlightByEntryId.get(entryId);
      if (inFlight) return inFlight;
      const loadPromise = (async () => {
        let status: ZoneStatus;
        try {
          status = this._normalizeZoneStatus(
            await hass.callWS<ZoneStatusResponse>({
              type: WS_GET_STATUS,
              config_entry_id: entryId,
            }),
          );
        } catch {
          status = EMPTY_ZONE_STATUS;
        }
        this._zoneStatusByEntryId.set(entryId, status);
        if (entryId === this._getActiveEntryId()) {
          applyZoneStatus(this, status);
          this._applyPendingPermitDefaults(entryId);
        }
        this._zoneStatusTsByEntryId.set(entryId, Date.now());
        this._zoneStatusInFlightByEntryId.delete(entryId);
        this._requestRender();
      })();
      this._zoneStatusInFlightByEntryId.set(entryId, loadPromise);
      return loadPromise;
    }

    _getFavoriteActionState(): FavoriteActionState {
      if (!this._config?.show_favorites || !this._config?.show_name) {
        return {
          showAddFavorite: false,
          showRemoveFavorite: false,
          selectedFavorite: null,
          removeFavorite: null,
        };
      }
      const controlsDisabled = this._isInEditor();
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("favorite").trim();
      const selectedFavorite = this._findFavoriteByValue(
        this._getInputValue("favorite"),
      );
      const selectedFavoriteMatchesLicense = selectedFavorite
        ? this._selectedFavoriteMatchesLicense(selectedFavorite, license)
        : false;
      const licenseFavorite = this._findFavorite(license, "");
      const removeFavorite = selectedFavoriteMatchesLicense
        ? selectedFavorite
        : licenseFavorite;
      const matchingFavorite = name
        ? this._findFavorite(license, name)
        : licenseFavorite;
      const canManageFavorites =
        !controlsDisabled && !this._favoritesLoading && Boolean(this._deviceId);
      const showAddFavorite =
        canManageFavorites &&
        Boolean(license) &&
        Boolean(name) &&
        !matchingFavorite &&
        !licenseFavorite &&
        !selectedFavoriteMatchesLicense;
      const showRemoveFavorite =
        canManageFavorites &&
        Boolean(removeFavorite?.id || removeFavorite?.license_plate);
      return {
        showAddFavorite: showAddFavorite && !showRemoveFavorite,
        showRemoveFavorite,
        selectedFavorite,
        removeFavorite,
      };
    }

    render(): TemplateResult {
      if (!this._config) return html``;
      if (!this._hass || this._hass.config?.state === "NOT_RUNNING") {
        return renderLoadingCard(this._hass ?? getGlobalHass<HomeAssistant>());
      }
      if (!this._translationsReady) return html``;

      const priorLicense = this._getInputValue("licensePlate");
      const priorStartDateTime = this._getInputValue("startDateTime");
      const priorEndDateTime = this._getInputValue("endDateTime");
      const priorFavorite = this._getInputValue("favorite");

      const title = this._config.title || "";
      const icon = this._config.icon;
      const showName = this._config.show_name ?? true;
      const showFavorites = this._config.show_favorites ?? true;
      const showStart = this._config.show_start_time ?? true;
      const showEnd = this._config.show_end_time ?? true;
      const activeEntryId = this._getActiveEntryId();
      const showPermitPicker =
        !getConfigEntryId(this._config) &&
        !(this._permitOptionsLoaded && this._permitOptions.length === 1);
      const hasTarget = Boolean(activeEntryId);
      const hasLicense = Boolean(priorLicense.trim());
      const favoriteValue = hasTarget ? priorFavorite : "";
      const hasDevice = Boolean(this._deviceId);
      const controlsDisabled = this._isInEditor();
      const localizeFn = this._localize;
      const permitSelectValue = activeEntryId ?? "";
      const permitSelectDisabled =
        controlsDisabled || this._permitOptionsLoading;
      const selectedPermitDisabled = Boolean(
        activeEntryId &&
        this._permitOptions.find((o) => o.id === activeEntryId)?.disabled,
      );
      const { showAddFavorite, showRemoveFavorite, removeFavorite } =
        this._getFavoriteActionState();
      const favoriteRemoveDisabled =
        controlsDisabled || this._favoriteRemoveInFlight;
      const favoritesOptions = this._favorites;
      const favoriteSelectDisabled =
        controlsDisabled || this._favoritesLoading || selectedPermitDisabled;
      const { start: resolvedStart, end: resolvedEnd } = this._resolveTimes();
      const plateAlreadyActive = (() => {
        if (!hasLicense || !resolvedStart || !resolvedEnd) return false;
        const plateKey = normalizePlateValue(priorLicense);
        const existing = this._activeReservationsByPlate.get(plateKey);
        if (!existing) return false;
        return existing.some(
          (r) => r.start < resolvedEnd && r.end > resolvedStart,
        );
      })();
      const startDisabled =
        controlsDisabled ||
        !hasDevice ||
        !hasTarget ||
        !hasLicense ||
        plateAlreadyActive ||
        this._startInFlight;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const minDateTime = formatDateTimeLocal(todayStart);
      return html`
        <ha-card
          @click=${this._onClick}
          @input=${this._onInput}
          @change=${this._onChange}
        >
          ${renderCardHeader(title, icon)}
          <div class="card-content">
            ${showPermitPicker
              ? renderPermitSelect({
                  hass: this._hass,
                  label: localizeFn("field.permit"),
                  value: permitSelectValue,
                  disabled: permitSelectDisabled,
                  preview: controlsDisabled,
                  onSelected: this._onPermitSelectChange,
                })
              : nothing}
            ${renderFavoriteSelect({
              showName,
              showFavorites,
              favoriteValue,
              favoriteSelectDisabled,
              hass: this._hass,
              favoritesOptions,
              favoritesError: this._favoritesError,
              preview: controlsDisabled,
              localize: localizeFn,
              onSelected: this._onFavoriteSelectChange,
              wrapSelect: (content) => keyed(activeEntryId ?? "", content),
            })}
            <div class="row">
              <ha-input
                id="licensePlate"
                appearance="material"
                with-clear
                .label=${localizeFn("field.license_plate")}
                placeholder=${this._licensePlateFocused
                  ? localizeFn("placeholder.license_plate")
                  : ""}
                .value=${priorLicense}
                ?disabled=${controlsDisabled || selectedPermitDisabled}
                @focusin=${this._onLicensePlateFocusIn}
                @focusout=${this._onLicensePlateFocusOut}
              ></ha-input>
            </div>
            ${showStart || showEnd
              ? html`
                  <div class="row datetime-fields">
                    ${showStart
                      ? html`
                          <div class="datetime-row">
                            <ha-input
                              appearance="material"
                              type="datetime-local"
                              id="startDateTime"
                              .label=${localizeFn("field.start_time")}
                              .value=${priorStartDateTime}
                              .min=${minDateTime}
                              ?disabled=${controlsDisabled ||
                              selectedPermitDisabled}
                              @input=${this._onInput}
                              @change=${this._onChange}
                            ></ha-input>
                          </div>
                        `
                      : nothing}
                    ${showEnd
                      ? html`
                          <div class="datetime-row">
                            <ha-input
                              appearance="material"
                              type="datetime-local"
                              id="endDateTime"
                              .label=${localizeFn("field.end_time")}
                              .value=${priorEndDateTime}
                              .min=${minDateTime}
                              ?disabled=${controlsDisabled ||
                              selectedPermitDisabled}
                              @input=${this._onInput}
                              @change=${this._onChange}
                            ></ha-input>
                          </div>
                        `
                      : nothing}
                  </div>
                `
              : nothing}
            ${renderFavoriteActionRow({
              showFavorites: showFavorites && showName,
              showAddFavorite,
              showRemoveFavorite,
              selectedFavoriteId:
                removeFavorite?.id || removeFavorite?.license_plate || "",
              favoriteRemoveDisabled,
              addFavoriteChecked: this._addFavoriteChecked,
              startInFlight: this._startInFlight,
              startButtonSuccess: this._startButtonSuccess,
              startButtonWarning: selectedPermitDisabled,
              startButtonTimeConflict: plateAlreadyActive,
              startDisabled,
              hasTarget,
              remainingMinutes: this._remainingMinutes,
              balanceUnit: this._balanceUnit,
              localize: localizeFn,
            })}
          </div>
        </ha-card>
      `;
    }

    updated(): void {
      if (!this._config) return;
      const controlsDisabled = this._isInEditor();
      this.toggleAttribute("data-preview", controlsDisabled);
      if (this._addFavoriteChecked) {
        const { showAddFavorite } = this._getFavoriteActionState();
        if (!showAddFavorite) {
          this._addFavoriteChecked = false;
          this._requestRender();
        }
      }
    }

    _scheduleFavoriteActionsUpdate(): void {
      if (!this._config?.show_favorites || !this._config?.show_name) return;
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("favorite").trim();
      const matchingFavorite = this._findFavorite(license, name);
      if (matchingFavorite) {
        const matchingValue = (matchingFavorite.name || "").trim();
        const currentValue = normalizeMatchValue(
          this._getInputValue("favorite"),
        );
        if (
          matchingValue &&
          currentValue !== normalizeMatchValue(matchingValue)
        ) {
          this._setInputValue("favorite", matchingValue);
        }
      }
      const { showAddFavorite } = this._getFavoriteActionState();
      if (!showAddFavorite && this._addFavoriteChecked) {
        this._addFavoriteChecked = false;
      }
      this._requestRender();
    }

    _handleClick(event: Event): void {
      if (this._isInEditor()) return;
      const path = event.composedPath() as HTMLElement[];
      const findById = (id: string): HTMLElement | undefined =>
        path.find((el) => el instanceof HTMLElement && el.id === id);
      const removeButton = findById("removeFavorite");
      if (removeButton) {
        const id = removeButton.getAttribute("data-favorite-id") ?? "";
        void this._removeFavorite(id);
        return;
      }
      if (findById("addFavoriteWrap")) {
        this._addFavoriteChecked = !this._addFavoriteChecked;
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      const startButton = findById("startReservation");
      if (startButton) void this._handleStart();
    }

    _handleInput(event: Event): void {
      const field = this._getValueFromEvent(event, INPUT_VALUE_IDS);
      if (field) this._setInputValue(field.id, field.value);
      if (field?.id === "licensePlate") {
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      this._maybeSyncEndWithStart(field?.id);
    }

    _handleChange(event: Event): void {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const field = this._getValueFromEvent(event, CHANGE_VALUE_IDS);
      if (field) this._setInputValue(field.id, field.value);
      if (target.id === "addFavorite") {
        this._addFavoriteChecked = (target as CheckedElement).checked;
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      this._maybeSyncEndWithStart(field?.id);
    }

    _maybeSyncEndWithStart(fieldId: string | undefined): void {
      if (
        fieldId === "startDateTime" &&
        this._config?.show_start_time &&
        this._config?.show_end_time
      ) {
        this._syncEndWithStart();
      }
    }

    _handlePermitSelectChange(event: Event): void {
      if (this._isInEditor()) return;
      const target = event.currentTarget as ValueElement | null;
      this._handlePermitChange(extractEventValue(event, target));
    }

    _handleFavoriteSelectChange(event: Event): void {
      if (
        !this._config?.show_favorites ||
        !this._config?.show_name ||
        this._isInEditor()
      )
        return;
      const select = event.currentTarget as ValueElement | null;
      const path = event.composedPath();
      const pathValueElement = path.find(
        (node): node is ValueElement =>
          node instanceof HTMLElement &&
          (node.id === "favorite" || node.getAttribute("id") === "favorite"),
      );
      const nextValue = extractEventValue(event, select ?? pathValueElement);
      if (this._suppressFavoriteClear) {
        this._suppressFavoriteClear = false;
        if (!nextValue) {
          this._setInputValue("favorite", "");
          this._scheduleFavoriteActionsUpdate();
          return;
        }
      }
      if (!nextValue) {
        this._setInputValue("favorite", "");
        void this._applyFavoriteSelection("", "");
        return;
      }
      const favorite = this._favoritesByValue.get(
        normalizeMatchValue(nextValue),
      );
      if (favorite) {
        const preferredValue = (favorite.name || "").trim();
        this._setInputValue("favorite", preferredValue);
        void this._applyFavoriteSelection(
          favorite.license_plate || nextValue,
          favorite.name ?? "",
        );
        return;
      }
      this._setInputValue("favorite", nextValue);
      // Treat custom values as visitor names, not license plates.
      void this._applyFavoriteSelection(
        this._getInputValue("licensePlate"),
        nextValue,
      );
    }

    _handlePermitChange(value: string): void {
      if (!value) {
        this._selectedEntryId = null;
        setPendingPermitDefaults(this, null);
        this._clearStatusRefresh();
        this._resetDeviceState();
        this._clearPermitScopedFormValues();
        this._setInputValue("licensePlate", "");
        this._clearStatus();
        return;
      }
      if (
        value === this._selectedEntryId &&
        this._deviceEntryId === value &&
        this._deviceId
      ) {
        return;
      }
      this._selectedEntryId = value;
      setPendingPermitDefaults(this, value, true);
      this._resetDeviceState();
      this._suppressFavoriteClear = false;
      this._setInputValue("favorite", "");
      applyZoneStatus(this, this._zoneStatusByEntryId.get(value) ?? null);
      this._applyStatusDefaultsToForm(true);
      this._clearStatus();
      this._ensureDeviceId();
      this._maybeLoadFavorites();
      void this._loadZoneStatusForEntry(value);
      void this._loadActivePlates(value);
      this._setupStatusRefresh(value);
    }

    _resetFavoritesState(): void {
      invalidateFavoritesCache(this, {
        resetRetryAfter: true,
        clearLoading: true,
      });
      clearFavoriteTransientState(this);
      this._setFavorites([]);
    }

    _resetDeviceState(): void {
      this._deviceId = null;
      this._deviceEntryId = null;
      applyZoneStatus(this, null);
      this._resetFavoritesState();
      this._activeReservationsByPlate = new Map();
      this._activeReservationsLoadedFor = null;
    }

    _clearPermitScopedFormValues(): void {
      const hadValues =
        Boolean(this._formValues.licensePlate) ||
        Boolean(this._formValues.favorite);
      const hadAddFavoriteChecked = this._addFavoriteChecked;
      delete this._formValues.licensePlate;
      delete this._formValues.favorite;
      clearFavoriteTransientState(this);
      if (hadValues || hadAddFavoriteChecked) this._requestRender();
    }

    _syncEntryState(forceSetupRefresh: boolean): void {
      const entryId = this._getActiveEntryId();
      applyZoneStatus(
        this,
        entryId ? (this._zoneStatusByEntryId.get(entryId) ?? null) : null,
      );
      this._applyStatusDefaultsToForm(false);
      if (getConfigEntryId(this._config) && entryId) {
        setPendingPermitDefaults(this, entryId);
      }
      this._requestRender();
      this._ensureDeviceId();
      this._ensurePermitOptions();
      this._maybeSelectSinglePermit();
      if (entryId) void this._loadZoneStatusForEntry(entryId);
      if (forceSetupRefresh || this._statusRefreshHandle === null) {
        this._setupStatusRefresh(entryId);
      }
      void this._maybeLoadFavorites();
      if (entryId) void this._loadActivePlates(entryId);
    }

    _setupStatusRefresh(entryId: string | null): void {
      this._clearStatusRefresh();
      if (!getConfigEntryId(this._config) || !entryId) return;
      const refresh = (): void => {
        if (!this._hass) return;
        const activeEntryId = this._getActiveEntryId();
        if (!activeEntryId || activeEntryId !== entryId) return;
        setPendingPermitDefaults(this, entryId);
        void this._loadZoneStatusForEntry(entryId);
      };
      this._statusRefreshHandle = window.setInterval(
        refresh,
        STATUS_REFRESH_MS,
      );
      this._statusVisibilityHandler = () => {
        if (document.visibilityState === "visible") refresh();
      };
      document.addEventListener(
        "visibilitychange",
        this._statusVisibilityHandler,
      );
    }

    _clearStatusRefresh(): void {
      if (this._statusRefreshHandle !== null) {
        window.clearInterval(this._statusRefreshHandle);
        this._statusRefreshHandle = null;
      }
      if (this._statusVisibilityHandler !== null) {
        document.removeEventListener(
          "visibilitychange",
          this._statusVisibilityHandler,
        );
        this._statusVisibilityHandler = null;
      }
    }

    _setFavorites(favorites: FavoriteItem[]): void {
      this._favorites = favorites;
      const { byPlate, byPlateName, byValue } = createFavoriteIndex(favorites);
      this._favoritesByPlate = byPlate;
      this._favoritesByPlateName = byPlateName;
      this._favoritesByValue = byValue;
    }

    _applyPendingPermitDefaults(entryId: string): void {
      if (this._pendingPermitDefaultsEntryId !== entryId) return;
      this._applyStatusDefaultsToForm(this._pendingPermitDefaultsForce);
      setPendingPermitDefaults(this, null, false);
    }

    _findFavorite(license: string, name: string): FavoriteItem | null {
      const licenseKey = normalizePlateValue(license);
      const nameKey = normalizeMatchValue(name);
      if (!licenseKey) return null;
      if (!nameKey) return this._favoritesByPlate.get(licenseKey) ?? null;
      return this._favoritesByPlateName.get(`${licenseKey}|${nameKey}`) ?? null;
    }

    _findFavoriteByValue(value?: string | null): FavoriteItem | null {
      const favoriteValue = normalizeMatchValue(value);
      if (!favoriteValue) return null;
      return this._favoritesByValue.get(favoriteValue) ?? null;
    }

    _normalizeZoneStatus(
      payload: ZoneStatusResponse | null | undefined,
    ): ZoneStatus {
      const state =
        payload?.state === "chargeable" || payload?.state === "free"
          ? payload.state
          : null;
      const kind =
        payload?.window_kind === "current" || payload?.window_kind === "next"
          ? payload.window_kind
          : null;
      const str = (v: unknown): string | null =>
        typeof v === "string" && v ? v : null;
      const num = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      return {
        state,
        kind,
        start: kind ? str(payload?.window_start) : null,
        end: kind ? str(payload?.window_end) : null,
        remainingMinutes: num(payload?.remaining_minutes),
        balanceUnit: str(payload?.balance_unit),
      };
    }

    _selectedFavoriteMatchesLicense(
      favorite: FavoriteItem,
      license: string,
    ): boolean {
      const key = normalizePlateValue(favorite.license_plate || favorite.id);
      return Boolean(key) && key === normalizePlateValue(license);
    }

    _addFavorite(license: string, name: string): void {
      if (
        !this._hass ||
        !this._deviceId ||
        !license ||
        !this._config?.show_favorites
      )
        return;
      invalidateFavoritesCache(this);
      this._hass.callService(DOMAIN, "add_favorite", {
        device_id: this._deviceId,
        license_plate: license,
        ...(name ? { name } : {}),
      });
      this._maybeLoadFavorites();
    }

    async _removeFavorite(favoriteId: string): Promise<void> {
      if (
        !this._hass ||
        !this._deviceId ||
        !favoriteId ||
        !this._config?.show_favorites
      )
        return;
      if (this._favoriteRemoveInFlight) return;
      this._favoriteRemoveInFlight = true;
      this._pendingRemoveFavoriteId = favoriteId;
      this._setStatus(
        this._localize("message.removing_favorite"),
        "info",
        5000,
      );
      this._requestRender();
      invalidateFavoritesCache(this);
      try {
        await this._hass.callService(DOMAIN, "remove_favorite", {
          device_id: this._deviceId,
          favorite_id: favoriteId,
        });
      } catch (err: unknown) {
        this._setStatus(
          this._errorMessage(err, "message.favorite_remove_failed"),
          "warning",
        );
        this._pendingRemoveFavoriteId = null;
        this._favoriteRemoveInFlight = false;
        this._requestRender();
        return;
      }
      await this._maybeLoadFavorites();
      this._favoriteRemoveInFlight = false;
      this._requestRender();
    }

    async _handleStart(): Promise<void> {
      if (!this._hass) return;
      if (!this._deviceId) {
        this._setStatus(
          this._localize("message.select_permit_before_start"),
          "warning",
        );
        this._requestRender();
        return;
      }
      if (this._startInFlight) return;
      this._startInFlight = true;
      this._requestRender();
      const license = this._getInputValue("licensePlate").trim();
      const { start, end } = this._resolveTimes();
      const validationError = !license
        ? "message.license_plate_required"
        : !start || !end
          ? "message.start_end_required"
          : end <= start
            ? "message.end_before_start"
            : null;
      if (validationError) {
        this._setStatus(this._localize(validationError), "warning");
        this._startInFlight = false;
        this._requestRender();
        await triggerProgressButtonFeedback(this, "#startReservation", "error");
        return;
      }
      const name = this._getInputValue("favorite").trim();
      const { showAddFavorite } = this._getFavoriteActionState();
      if (this._addFavoriteChecked && showAddFavorite) {
        this._addFavorite(license, name);
        this._addFavoriteChecked = false;
      }
      try {
        await this._hass.callService(DOMAIN, "start_reservation", {
          device_id: this._deviceId,
          start_time: start!.toISOString(),
          end_time: end!.toISOString(),
          license_plate: license,
        });
      } catch (err: unknown) {
        const message = this._errorMessage(
          err,
          "message.reservation_start_failed",
        );
        this._setStatus(message, "warning");
        this._startInFlight = false;
        this._requestRender();
        await triggerProgressButtonFeedback(this, "#startReservation", "error");
        return;
      }
      this._setStatus(
        this._localize("message.reservation_requested"),
        "success",
        5000,
      );
      this._setStartButtonSuccess();
      this._startInFlight = false;
      this._setInputValue("licensePlate", "");
      this._setInputValue("favorite", "");
      this._scheduleFavoriteActionsUpdate();
      this._activeReservationsLoadedFor = null;
      const activeEntryId = this._getActiveEntryId();
      if (activeEntryId) void this._loadActivePlates(activeEntryId);
      this._requestRender();
      await triggerProgressButtonFeedback(this, "#startReservation", "success");
      window.dispatchEvent(
        new CustomEvent(RESERVATION_STARTED_EVENT, {
          detail: {
            device_id: this._deviceId,
            license_plate: license,
            name,
          },
        }),
      );
    }

    _setStartButtonSuccess(): void {
      if (this._startButtonSuccessTimeout) {
        window.clearTimeout(this._startButtonSuccessTimeout);
      }
      this._startButtonSuccess = true;
      this._requestRender();
      this._startButtonSuccessTimeout = window.setTimeout(() => {
        this._startButtonSuccess = false;
        this._startButtonSuccessTimeout = null;
        this._requestRender();
      }, 1000);
    }

    _resolveTimes(): { start: Date | null; end: Date | null } {
      const now = new Date();
      if (!this._config) return { start: null, end: null };
      const fallbackStart = new Date(now.getTime() + 60 * 1000);
      const startValue = this._config.show_start_time
        ? this._getInputValue("startDateTime")
        : "";
      const start = parseDateTimeValue(startValue) ?? fallbackStart;
      const endValue = this._config.show_end_time
        ? this._getInputValue("endDateTime")
        : "";
      const end =
        parseDateTimeValue(endValue) ??
        new Date(start.getTime() + 60 * 60 * 1000);
      return { start, end };
    }

    _getInputValue(id: string): string {
      return this._formValues[id] ?? "";
    }

    _getValueFromEvent(
      event: Event,
      ids: Set<string>,
    ): { id: string; value: string } | null {
      const customEvent = event as CustomEvent<{ value?: string | null }>;
      const detailValue = customEvent.detail?.value;
      const path = event.composedPath();
      let element: ValueElement | null = null;
      let inputElement: HTMLInputElement | HTMLTextAreaElement | null = null;
      for (const node of path) {
        if (!element && node instanceof HTMLElement && ids.has(node.id)) {
          element = node;
          if (typeof detailValue === "string") break;
          continue;
        }
        if (
          !inputElement &&
          (node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement)
        ) {
          inputElement = node;
        }
        if (element && inputElement) break;
      }
      if (!element) return null;
      if (typeof detailValue === "string") {
        return { id: element.id, value: detailValue };
      }
      const value = inputElement?.value ?? element.value ?? "";
      return { id: element.id, value };
    }

    _setInputValue(id: string, value: string): void {
      if (this._formValues[id] === value) return;
      this._formValues[id] = value;
      this._requestRender();
    }

    _syncEndWithStart(): void {
      if (!this._config?.show_end_time) return;
      const startValue = this._getInputValue("startDateTime");
      if (!startValue) return;
      const start = parseDateTimeValue(startValue);
      if (!start) return;
      this._setInputValue(
        "endDateTime",
        formatDateTimeLocal(this._resolveDefaultEnd(start)),
      );
    }

    _getStatusDefaultTimes(now: Date): { start: Date; end: Date } {
      const window = this._getRelevantWindowTimes();
      if (window) {
        return {
          start: this._resolveDefaultStart(window.start, now),
          end: this._normalizeEndOfDayDisplay(window.end),
        };
      }
      const start = new Date(now);
      const end = new Date(now);
      end.setHours(23, 59, 0, 0);
      return { start, end };
    }

    _getRelevantWindowTimes(): { start: Date; end: Date } | null {
      const validKind =
        (this._zoneState === "chargeable" && this._windowKind === "current") ||
        (this._zoneState === "free" && this._windowKind === "next");
      if (!validKind) return null;
      const start = parseDateTimeValue(this._windowStartIso);
      const end = parseDateTimeValue(this._windowEndIso);
      if (!start || !end || end <= start) return null;
      return { start, end };
    }

    _normalizeEndOfDayDisplay(end: Date): Date {
      if (end.getHours() !== 0 || end.getMinutes() !== 0) return end;
      const normalized = new Date(end);
      normalized.setMinutes(normalized.getMinutes() - 1);
      return normalized;
    }

    _resolveDefaultStart(start: Date, now: Date): Date {
      return start > now ? start : new Date(now);
    }

    _resolveDefaultEnd(start: Date): Date {
      const window = this._getRelevantWindowTimes();
      if (window && window.end > start) {
        return this._normalizeEndOfDayDisplay(window.end);
      }
      const fallback = new Date(start.getTime() + 60 * 1000);
      if (!window) {
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 59, 0, 0);
        return dayEnd > start ? dayEnd : fallback;
      }
      return fallback;
    }

    _applyStatusDefaultsToForm(force = false): void {
      if (!this._config) return;
      const now = new Date();
      const defaults = this._getStatusDefaultTimes(now);
      if (this._config.show_start_time) {
        const current = force
          ? null
          : parseDateTimeValue(this._getInputValue("startDateTime"));
        if (!current) {
          this._setInputValue(
            "startDateTime",
            formatDateTimeLocal(defaults.start),
          );
        } else if (current <= now) {
          this._setInputValue(
            "startDateTime",
            formatDateTimeLocal(this._resolveDefaultStart(current, now)),
          );
        }
      }
      if (this._config.show_end_time) {
        if (force || !this._getInputValue("endDateTime")) {
          this._setInputValue("endDateTime", formatDateTimeLocal(defaults.end));
        }
      }
    }

    async _applyFavoriteSelection(plate: string, name: string): Promise<void> {
      this._setInputValue("favorite", name);
      this._setInputValue("licensePlate", plate);
      await this.updateComplete;
      this._scheduleFavoriteActionsUpdate();
    }

    async _loadActivePlates(entryId: string): Promise<void> {
      if (!this._hass || !entryId) return;
      if (this._activeReservationsLoadedFor === entryId) return;
      this._activeReservationsLoadedFor = entryId;
      try {
        type ActiveReservationsResult = {
          reservations?: Array<{
            license_plate?: string;
            start_time?: string;
            end_time?: string;
          }>;
          response?: {
            reservations?: Array<{
              license_plate?: string;
              start_time?: string;
              end_time?: string;
            }>;
          };
        };
        const hass = this._hass;
        const devices = await hass.callWS<DeviceEntry[]>({
          type: "config/device_registry/list",
        });
        const domainDevices = filterDomainDevices(devices).filter((device) =>
          (device.config_entries ?? []).includes(entryId),
        );
        const byPlate = new Map<string, Array<{ start: Date; end: Date }>>();
        const results = await Promise.allSettled(
          domainDevices.map((device) =>
            hass.callWS<ActiveReservationsResult>({
              type: "call_service",
              domain: DOMAIN,
              service: "list_reservations",
              return_response: true,
              service_data: { device_id: device.id },
            }),
          ),
        );
        for (const settled of results) {
          if (settled.status === "rejected") continue;
          const result = settled.value;
          const response = result?.response ?? result;
          const reservations = response?.reservations;
          if (Array.isArray(reservations)) {
            for (const r of reservations) {
              const plate = normalizePlateValue(r.license_plate);
              const start = parseDateTimeValue(r.start_time);
              const end = parseDateTimeValue(r.end_time);
              if (!plate || !start || !end) continue;
              const existing = byPlate.get(plate) ?? [];
              existing.push({ start, end });
              byPlate.set(plate, existing);
            }
          }
        }
        this._activeReservationsByPlate = byPlate;
      } catch {
        this._activeReservationsByPlate = new Map();
      }
      this._requestRender();
    }

    _getActiveEntryId(): string | null {
      return getConfigEntryId(this._config) || this._selectedEntryId;
    }
  }

  registerCustomCardWithTranslations(
    CARD_TYPE,
    CityVisitorParkingNewReservationCard,
    "name",
    "description",
  );
})();

(() => {
  const CARD_TYPE = "city-visitor-parking-active-card";
  const SERVICE_LIST_RESERVATIONS = "list_reservations";
  const SERVICE_UPDATE_RESERVATION = "update_reservation";
  const SERVICE_END_RESERVATION = "end_reservation";
  const UPDATE_START_FLAG = 1;
  const UPDATE_END_FLAG = 2;

  type ActiveReservation = {
    reservation_id: string;
    name?: string;
    license_plate?: string;
    start_time: string;
    end_time: string;
    device_id?: string;
    favorite_id?: string;
    favorite_name?: string;
  };
  type CardConfig = {
    type: string;
    title?: string;
    icon?: string;
    config_entry_id?: string;
  };

  class CityVisitorParkingActiveCard extends BaseLocalizedCard<CardConfig> {
    static styles = [
      BASE_CARD_STYLES,
      css`
        .active-reservations {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .active-reservation {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, var(--ha-space-2));
          padding: var(--ha-space-3);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .active-reservation-summary {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .active-reservation-heading {
          font-weight: 600;
        }
        .active-reservation-label {
          color: var(--secondary-text-color);
          font-family: var(--primary-font-family, "Roboto", "Noto", sans-serif);
          font-size: 14px;
          font-weight: 400;
        }
        .active-reservation-times {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
          gap: var(--ha-space-2);
        }
        .active-reservation-times ha-input,
        .active-reservation-times ha-textfield {
          width: 100%;
        }
        .active-reservation-actions {
          display: flex;
          gap: var(--ha-space-2);
          flex-wrap: wrap;
        }
        .active-reservation-end {
          margin-left: auto;
        }
        .active-reservations-empty {
          font-size: 0.9rem;
          color: var(--secondary-text-color);
        }
      `,
    ];
    _activeReservations: ActiveReservation[] = [];
    _activeReservationsById = new Map<string, ActiveReservation>();
    _activeReservationsError: string | null = null;
    _activeReservationsLoadedFor: string | null = null;
    _activeReservationsLoading = false;
    _reservationUpdateFlagsByDevice = new Map<string, number>();
    _devicesPromise: Promise<DeviceEntry[]> | null = null;
    _configEntriesPromise: Promise<Map<string, string>> | null = null;
    _permitLabelsByDeviceId = new Map<string, string>();
    _reservationStartedHandler: ((event: Event) => void) | null = null;
    _reservationInFlight = new Set<string>();
    _endButtonSuccessByReservationId = new Set<string>();
    _endButtonSuccessTimeoutByReservationId = new Map<string, number>();
    _endButtonSuccessResolverByReservationId = new Map<string, () => void>();
    _pendingReservationNameByKey = new Map<
      string,
      { name: string; expiresAt: number }
    >();
    _reservationInputValues = new Map<
      string,
      { start?: string; end?: string }
    >();
    _onActionClick = (event: Event) => this._handleActionClick(event);
    _onReservationInput = (event: Event) => this._handleReservationInput(event);
    _onReservationChange = (event: Event) =>
      this._handleReservationChange(event);

    connectedCallback(): void {
      super.connectedCallback();
      if (this._reservationStartedHandler) {
        window.removeEventListener(
          RESERVATION_STARTED_EVENT,
          this._reservationStartedHandler,
        );
      }
      this._reservationStartedHandler = (event: Event) => {
        const detail = (
          event as CustomEvent<{
            device_id?: string | null;
            license_plate?: string | null;
            name?: string | null;
          }>
        ).detail;
        const deviceId = (detail?.device_id ?? "").trim();
        const licensePlate = (detail?.license_plate ?? "").trim();
        const name = (detail?.name ?? "").trim();
        if (deviceId && licensePlate && name) {
          this._setPendingReservationName(deviceId, licensePlate, name);
        }
        void this._maybeLoadActiveReservations(true);
      };
      window.addEventListener(
        RESERVATION_STARTED_EVENT,
        this._reservationStartedHandler,
      );
    }

    disconnectedCallback(): void {
      for (const reservationId of [...this._endButtonSuccessByReservationId]) {
        this._clearEndButtonState(reservationId);
      }
      this._pendingReservationNameByKey.clear();
      if (this._reservationStartedHandler)
        window.removeEventListener(
          RESERVATION_STARTED_EVENT,
          this._reservationStartedHandler,
        );
      super.disconnectedCallback();
    }

    static async getConfigForm(hass?: HomeAssistant): Promise<{
      readonly schema: ReadonlyArray<Record<string, unknown>>;
    }> {
      return getActiveCardConfigForm(hass);
    }

    static getConfigElement(): HTMLElement {
      return document.createElement("city-visitor-parking-active-card-editor");
    }

    static getStubConfig(): CardConfig {
      return { type: `custom:${CARD_TYPE}` };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw new Error(
          localize(
            this._hass ?? getGlobalHass<HomeAssistant>(),
            "message.invalid_config",
          ),
        );
      }
      this._config = { ...config };
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      void ensureTranslations(this._hass).then(() => this._requestRender());
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }

    getCardSize(): number {
      return 3;
    }

    getGridOptions(): Record<string, number> {
      return {
        columns: 12,
        min_columns: 6,
        min_rows: 4,
      };
    }

    async _maybeLoadActiveReservations(force = false): Promise<void> {
      if (!this._hass || !this._config) return;
      if (!isHassRunning(this._hass)) return;
      const entryId = this._getActiveEntryId();
      const target = entryId ?? "all";
      if (
        this._activeReservationsLoading ||
        (!force &&
          this._activeReservationsLoadedFor === target &&
          !this._activeReservationsError)
      ) {
        return;
      }
      this._activeReservationsLoading = true;
      this._activeReservationsError = null;
      this._requestRender();
      try {
        let devices = await this._getDomainDevices();
        if (entryId) {
          devices = devices.filter((device) =>
            (device.config_entries ?? []).includes(entryId),
          );
        }
        if (!devices.length) {
          this._activeReservations = [];
          this._activeReservationsById.clear();
          this._reservationUpdateFlagsByDevice.clear();
          this._activeReservationsLoadedFor = target;
          return;
        }
        const entryTitles = await this._getConfigEntryTitles();
        this._permitLabelsByDeviceId = resolvePermitLabelsByDevice(
          devices,
          entryTitles,
        );
        type ActiveReservationsResult = {
          reservations?: ActiveReservation[];
          reservation_update_fields?: string[];
          response?: {
            reservations?: ActiveReservation[];
            reservation_update_fields?: string[];
          };
        };
        const results = await Promise.allSettled(
          devices.map((device) =>
            this._hass!.callWS<ActiveReservationsResult>({
              type: "call_service",
              domain: DOMAIN,
              service: SERVICE_LIST_RESERVATIONS,
              return_response: true,
              service_data: { device_id: device.id },
            }),
          ),
        );
        const collected: ActiveReservation[] = [];
        const collectedById = new Map<string, ActiveReservation>();
        const reservationUpdateFlagsByDevice = new Map<string, number>();
        const failedDevices: string[] = [];
        for (const [index, settled] of results.entries()) {
          const device = devices[index];
          if (settled.status === "rejected") {
            failedDevices.push(device.name ?? device.id);
            continue;
          }
          const result = settled.value;
          const response = result?.response ?? result;
          const activeReservations = response?.reservations;
          const updateFields = response?.reservation_update_fields;
          if (Array.isArray(updateFields)) {
            const updateFlags =
              (updateFields.includes("start_time") ? UPDATE_START_FLAG : 0) |
              (updateFields.includes("end_time") ? UPDATE_END_FLAG : 0);
            reservationUpdateFlagsByDevice.set(device.id, updateFlags);
          }
          if (Array.isArray(activeReservations)) {
            for (const reservation of activeReservations) {
              const resolvedReservation = reservation.device_id
                ? reservation
                : { ...reservation, device_id: device.id };
              collected.push(resolvedReservation);
              collectedById.set(
                resolvedReservation.reservation_id,
                resolvedReservation,
              );
            }
          }
        }
        if (failedDevices.length) {
          console.warn(
            `[city-visitor-parking] Could not load reservations for ${failedDevices.length} device(s): ${failedDevices.join(", ")}`,
          );
        }
        this._reservationUpdateFlagsByDevice = reservationUpdateFlagsByDevice;
        this._activeReservations = collected;
        this._activeReservationsById = collectedById;
        // Only mark as loaded when all devices succeeded; failed devices will be retried on the next update.
        if (!failedDevices.length) {
          this._activeReservationsLoadedFor = target;
        }
        for (const reservationId of this._reservationInputValues.keys()) {
          if (!collectedById.has(reservationId)) {
            this._reservationInputValues.delete(reservationId);
          }
        }
        this._prunePendingReservationNames();
        for (const reservationId of [
          ...this._endButtonSuccessByReservationId,
        ]) {
          if (!collectedById.has(reservationId)) {
            this._clearEndButtonState(reservationId);
          }
        }
      } catch (err: unknown) {
        this._activeReservations = [];
        this._activeReservationsById.clear();
        this._reservationUpdateFlagsByDevice.clear();
        this._activeReservationsError = this._errorMessage(
          err,
          "message.active_reservations_failed",
        );
        this._activeReservationsLoadedFor = null;
      } finally {
        this._activeReservationsLoading = false;
        this._requestRender();
      }
    }

    render(): TemplateResult {
      if (!this._config) return html``;
      if (!isHassRunning(this._hass)) {
        return renderLoadingCard(this._hass ?? getGlobalHass<HomeAssistant>());
      }
      const controlsDisabled = this._isInEditor();
      return html`
        <ha-card @click=${this._onActionClick}>
          ${renderCardHeader(this._config.title || "", this._config.icon)}
          <div class="card-content">
            ${this._renderActiveReservations(controlsDisabled)}
          </div>
        </ha-card>
      `;
    }

    _renderActiveReservations(controlsDisabled: boolean): TemplateResult {
      const showEmpty =
        !this._activeReservationsLoading &&
        !this._activeReservationsError &&
        this._activeReservations.length === 0;
      return html`
        <div class="row active-reservations">
          ${this._activeReservationsError
            ? html`
                <ha-alert alert-type="warning">
                  ${this._activeReservationsError}
                </ha-alert>
              `
            : nothing}
          ${showEmpty
            ? html`<div class="active-reservations-empty">
                ${this._localize("message.no_active_reservations")}
              </div>`
            : nothing}
          ${this._activeReservations.map((reservation) =>
            this._renderActiveReservation(reservation, controlsDisabled),
          )}
        </div>
      `;
    }

    _renderActiveReservation(
      reservation: ActiveReservation,
      controlsDisabled: boolean,
    ): TemplateResult {
      const name = reservation.name ?? reservation.favorite_name;
      const license = reservation.license_plate ?? "";
      const pendingName =
        !name && reservation.device_id
          ? this._getPendingReservationName(reservation.device_id, license)
          : null;
      const identify: string =
        name || pendingName || license || reservation.reservation_id;
      const permitLabel = reservation.device_id
        ? this._permitLabelsByDeviceId.get(reservation.device_id)
        : null;
      const updateFlags = this._getReservationUpdateFlags(
        reservation.device_id,
      );
      const allowStart = Boolean(updateFlags & UPDATE_START_FLAG);
      const allowEnd = Boolean(updateFlags & UPDATE_END_FLAG);
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const endButtonSuccess = this._endButtonSuccessByReservationId.has(
        reservation.reservation_id,
      );
      const startValue =
        this._getReservationInputOverride(
          reservation.reservation_id,
          "start",
        ) ?? formatOptionalDateTimeLocal(reservation.start_time);
      const endValue =
        this._getReservationInputOverride(reservation.reservation_id, "end") ??
        formatOptionalDateTimeLocal(reservation.end_time);
      const startMin = formatOptionalDateTimeLocal(reservation.start_time);
      const endMin = startValue || startMin;
      return html`
        <div class="active-reservation">
          <div class="active-reservation-summary">
            <div class="active-reservation-heading">${identify}</div>
            ${license
              ? html`<div class="active-reservation-label">
                  ${this._localize("field.license_plate")}: ${license}
                </div>`
              : nothing}
            ${permitLabel
              ? html`<div class="active-reservation-label">
                  ${this._localize("field.permit")}: ${permitLabel}
                </div>`
              : nothing}
          </div>
          <div class="active-reservation-times">
            <div class="datetime-row">
              <ha-input
                appearance="material"
                type="datetime-local"
                data-reservation-id=${reservation.reservation_id}
                data-field="start"
                .value=${startValue}
                .min=${startMin}
                .label=${this._localize("field.start_time")}
                ?disabled=${controlsDisabled || !allowStart || isBusy}
                @input=${this._onReservationInput}
                @change=${this._onReservationChange}
              ></ha-input>
            </div>
            <div class="datetime-row">
              <ha-input
                appearance="material"
                type="datetime-local"
                data-reservation-id=${reservation.reservation_id}
                data-field="end"
                .value=${endValue}
                .min=${endMin}
                .label=${this._localize("field.end_time")}
                ?disabled=${controlsDisabled || !allowEnd || isBusy}
                @input=${this._onReservationInput}
                @change=${this._onReservationChange}
              ></ha-input>
            </div>
          </div>
          <div class="active-reservation-actions">
            <ha-progress-button
              class=${endButtonSuccess
                ? "active-reservation-end success"
                : "active-reservation-end"}
              data-reservation-id=${reservation.reservation_id}
              variant=${endButtonSuccess ? "success" : nothing}
              appearance=${endButtonSuccess ? "filled" : nothing}
              .progress=${isBusy}
              ?disabled=${controlsDisabled || isBusy}
            >
              ${this._localize("button.end_reservation")}
            </ha-progress-button>
          </div>
        </div>
      `;
    }

    _handleActionClick(event: Event): void {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const endButton = target.closest<HTMLElement>(
        "ha-progress-button.active-reservation-end",
      );
      if (endButton) {
        const reservationId = endButton.dataset.reservationId ?? "";
        if (this._endButtonSuccessByReservationId.has(reservationId)) return;
        void this._handleActiveReservationEnd(reservationId);
      }
    }

    _handleReservationInput(
      event: Event,
      resolved?: ReturnType<typeof this._getReservationField>,
    ): void {
      const reservationField = resolved ?? this._getReservationField(event);
      if (!reservationField) return;
      const { reservationId, fieldKey, value } = reservationField;
      const current = this._reservationInputValues.get(reservationId);
      if (current) {
        current[fieldKey] = value;
        return;
      }
      this._reservationInputValues.set(reservationId, { [fieldKey]: value });
    }

    _handleReservationChange(event: Event): void {
      if (this._isInEditor()) return;
      const reservationField = this._getReservationField(event);
      if (!reservationField) return;
      this._handleReservationInput(event, reservationField);
      void this._handleActiveReservationUpdate(reservationField.reservationId);
    }

    _getReservationField(event: Event): {
      reservationId: string;
      fieldKey: "start" | "end";
      value: string;
    } | null {
      const customEvent = event as CustomEvent<{ value?: string }>;
      const detailValue = customEvent.detail?.value;
      const path = event.composedPath();
      let fieldElement: (ValueElement & HTMLElement) | null = null;
      let inputElement: HTMLInputElement | HTMLTextAreaElement | null = null;
      for (const node of path) {
        if (
          !fieldElement &&
          node instanceof HTMLElement &&
          Boolean(node.dataset.reservationId)
        ) {
          const nodeField = node.dataset.field;
          if (nodeField === "start" || nodeField === "end") {
            fieldElement = node as ValueElement & HTMLElement;
            if (typeof detailValue === "string") break;
            continue;
          }
        }
        if (
          !inputElement &&
          (node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement)
        ) {
          inputElement = node;
        }
        if (fieldElement && inputElement) break;
      }
      if (!fieldElement) return null;
      const reservationId = fieldElement.dataset.reservationId ?? "";
      if (!reservationId) return null;
      return {
        reservationId,
        fieldKey: fieldElement.dataset.field as "start" | "end",
        value: detailValue ?? inputElement?.value ?? fieldElement.value ?? "",
      };
    }

    _getReservationUpdateFlags(deviceId: string | undefined): number {
      if (!deviceId) return 0;
      return this._reservationUpdateFlagsByDevice.get(deviceId) ?? 0;
    }

    _getReservationInputOverride(
      reservationId: string,
      fieldKey: "start" | "end",
    ): string | undefined {
      return this._reservationInputValues.get(reservationId)?.[fieldKey];
    }

    _reservationNameKey(
      deviceId: string | null | undefined,
      licensePlate: string | null | undefined,
    ): string | null {
      const resolvedDeviceId = (deviceId ?? "").trim();
      const plateKey = normalizePlateValue(licensePlate);
      if (!resolvedDeviceId || !plateKey) return null;
      return `${resolvedDeviceId}|${plateKey}`;
    }

    _setPendingReservationName(
      deviceId: string,
      licensePlate: string,
      name: string,
    ): void {
      const key = this._reservationNameKey(deviceId, licensePlate);
      if (!key || !name) return;
      this._pendingReservationNameByKey.set(key, {
        name,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
    }

    _getPendingReservationName(
      deviceId: string,
      licensePlate: string,
    ): string | null {
      const key = this._reservationNameKey(deviceId, licensePlate);
      if (!key) return null;
      const entry = this._pendingReservationNameByKey.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        this._pendingReservationNameByKey.delete(key);
        return null;
      }
      return entry.name;
    }

    _prunePendingReservationNames(): void {
      const now = Date.now();
      for (const [key, entry] of this._pendingReservationNameByKey) {
        if (entry.expiresAt <= now) {
          this._pendingReservationNameByKey.delete(key);
        }
      }
    }

    _beginReservationAction(reservationId: string): boolean {
      if (this._reservationInFlight.has(reservationId)) return false;
      this._reservationInFlight.add(reservationId);
      this._requestRender();
      return true;
    }

    _endReservationAction(reservationId: string): void {
      this._reservationInFlight.delete(reservationId);
      this._requestRender();
    }

    _getReservationTarget(
      reservationId: string,
    ): { reservation: ActiveReservation; deviceId: string } | null {
      const reservation = this._activeReservationsById.get(reservationId);
      const deviceId = reservation?.device_id ?? "";
      return reservation && deviceId ? { reservation, deviceId } : null;
    }

    _completeReservationActionSuccess(
      reservationId: string,
      successMessageKey: string,
      invalidateLoadedFor = true,
    ): void {
      this._setStatus(this._localize(successMessageKey), "success", 5000);
      this._reservationInputValues.delete(reservationId);
      this._endReservationAction(reservationId);
      if (invalidateLoadedFor) this._activeReservationsLoadedFor = null;
    }

    _clearEndButtonState(reservationId: string): void {
      const timeoutHandle =
        this._endButtonSuccessTimeoutByReservationId.get(reservationId);
      if (timeoutHandle !== undefined) {
        window.clearTimeout(timeoutHandle);
        this._endButtonSuccessTimeoutByReservationId.delete(reservationId);
      }
      this._endButtonSuccessResolverByReservationId.get(reservationId)?.();
      this._endButtonSuccessResolverByReservationId.delete(reservationId);
      this._endButtonSuccessByReservationId.delete(reservationId);
    }

    _setEndButtonSuccess(reservationId: string): Promise<void> {
      this._clearEndButtonState(reservationId);
      this._endButtonSuccessByReservationId.add(reservationId);
      this._requestRender();
      return new Promise((resolve) => {
        this._endButtonSuccessResolverByReservationId.set(
          reservationId,
          resolve,
        );
        const timeoutHandle = window.setTimeout(() => {
          this._clearEndButtonState(reservationId);
          this._requestRender();
          resolve();
        }, 1000);
        this._endButtonSuccessTimeoutByReservationId.set(
          reservationId,
          timeoutHandle,
        );
      });
    }

    async _handleActiveReservationUpdate(reservationId: string): Promise<void> {
      if (!this._hass || !reservationId) return;
      const target = this._getReservationTarget(reservationId);
      if (!target) return;
      const { reservation, deviceId } = target;
      if (!this._beginReservationAction(reservationId)) return;
      const updateFlags = this._getReservationUpdateFlags(deviceId);
      const allowStart = Boolean(updateFlags & UPDATE_START_FLAG);
      const allowEnd = Boolean(updateFlags & UPDATE_END_FLAG);
      if (!allowStart && !allowEnd) {
        this._endReservationAction(reservationId);
        return;
      }
      const startValue = allowStart
        ? (
            this._getReservationInputOverride(reservationId, "start") ??
            formatOptionalDateTimeLocal(reservation.start_time)
          ).trim()
        : "";
      const endValue = allowEnd
        ? (
            this._getReservationInputOverride(reservationId, "end") ??
            formatOptionalDateTimeLocal(reservation.end_time)
          ).trim()
        : "";
      const startDate = allowStart
        ? parseDateTimeValue(startValue)
        : parseDateTimeValue(reservation.start_time);
      const endDate = allowEnd
        ? parseDateTimeValue(endValue)
        : parseDateTimeValue(reservation.end_time);
      const updateError =
        (allowStart && !startDate) || (allowEnd && !endDate)
          ? "message.start_end_required"
          : startDate && endDate && endDate <= startDate
            ? "message.end_before_start"
            : null;
      if (updateError) {
        this._setStatus(this._localize(updateError), "warning");
        this._endReservationAction(reservationId);
        return;
      }
      try {
        const serviceData: Record<string, unknown> = {
          device_id: deviceId,
          reservation_id: reservationId,
        };
        if (allowStart && startDate)
          serviceData.start_time = startDate.toISOString();
        if (allowEnd && endDate) serviceData.end_time = endDate.toISOString();
        await this._hass.callService(
          DOMAIN,
          SERVICE_UPDATE_RESERVATION,
          serviceData,
        );
      } catch (err: unknown) {
        this._setStatus(
          this._errorMessage(err, "message.reservation_update_failed"),
          "warning",
        );
        this._endReservationAction(reservationId);
        return;
      }
      this._completeReservationActionSuccess(
        reservationId,
        "message.reservation_updated",
      );
      await this._maybeLoadActiveReservations(true);
    }

    async _handleActiveReservationEnd(reservationId: string): Promise<void> {
      if (!this._hass || !reservationId) return;
      const target = this._getReservationTarget(reservationId);
      if (!target) return;
      const { deviceId } = target;
      if (!this._beginReservationAction(reservationId)) return;
      try {
        await this._hass.callService(DOMAIN, SERVICE_END_RESERVATION, {
          device_id: deviceId,
          reservation_id: reservationId,
        });
      } catch (err: unknown) {
        this._setStatus(
          this._errorMessage(err, "message.reservation_end_failed"),
          "warning",
        );
        this._endReservationAction(reservationId);
        await triggerProgressButtonFeedback(
          this,
          `ha-progress-button.active-reservation-end[data-reservation-id="${reservationId}"]`,
          "error",
        );
        return;
      }
      this._completeReservationActionSuccess(
        reservationId,
        "message.reservation_ended",
        false,
      );
      await this._setEndButtonSuccess(reservationId);
      await triggerProgressButtonFeedback(
        this,
        `ha-progress-button.active-reservation-end[data-reservation-id="${reservationId}"]`,
        "success",
      );
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }

    async _getConfigEntryTitles(): Promise<Map<string, string>> {
      if (!this._hass) return new Map();
      const hass = this._hass;
      return makeDedupedLoader(
        () => this._configEntriesPromise,
        (p) => {
          this._configEntriesPromise = p;
        },
        () =>
          fetchPermitEntries(hass)
            .then(buildPermitTitleMap)
            .catch(() => new Map<string, string>()),
      );
    }

    async _getDomainDevices(): Promise<DeviceEntry[]> {
      if (!this._hass) return [];
      const hass = this._hass;
      return makeDedupedLoader(
        () => this._devicesPromise,
        (p) => {
          this._devicesPromise = p;
        },
        () =>
          hass
            .callWS<DeviceEntry[]>({ type: "config/device_registry/list" })
            .then(filterDomainDevices),
      );
    }

    _getActiveEntryId(): string | null {
      return getConfigEntryId(this._config);
    }
  }

  registerCustomCardWithTranslations(
    CARD_TYPE,
    CityVisitorParkingActiveCard,
    "name",
    "",
  );
  hideCustomCardFromPicker(CARD_TYPE);
})();
