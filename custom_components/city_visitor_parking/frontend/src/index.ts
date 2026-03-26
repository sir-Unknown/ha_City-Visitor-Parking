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
  },
  status: ZoneStatus | null,
): void => {
  Object.assign(context, {
    _zoneState: status?.state ?? null,
    _windowKind: status?.kind ?? null,
    _windowStartIso: status?.start ?? null,
    _windowEndIso: status?.end ?? null,
  });
};

const resetZoneStatusThrottle = (context: {
  _zoneStatusTsByEntryId: Map<string, number>;
}): void => context._zoneStatusTsByEntryId.clear();

const openDateTimePickerForField = (field: Element | null): void => {
  if (!field) return;
  const input =
    field instanceof HTMLInputElement
      ? (field as PickerInputElement)
      : ((field as HTMLElement).shadowRoot?.querySelector(
          "input",
        ) as PickerInputElement | null);
  if (!input) return;
  if (typeof input.showPicker === "function") {
    input.showPicker();
    return;
  }
  input.focus();
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
  identifiers?: Array<[string, string]>;
  config_entries?: string[];
};

type PermitEntry = {
  entry_id: string;
  title?: string | null;
};

type PermitOption = {
  id: string;
  label: string;
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
};

type ValueElement = HTMLElement & { value?: string };
type PickerInputElement = HTMLInputElement & { showPicker?: () => void };

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
  .row {
    margin: 0;
  }
  .card-content {
    display: flex;
    flex-direction: column;
    gap: var(--entities-card-row-gap, var(--card-row-gap, var(--ha-space-2)));
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
  .spinner {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2);
    color: var(--secondary-text-color);
    font-size: 0.85rem;
  }
  .datetime-row {
    position: relative;
  }
  .datetime-row ha-textfield {
    width: 100%;
  }
  .datetime-picker-button {
    position: absolute;
    inset-inline-end: var(--ha-space-1);
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
  }
`;

const buildPermitOptions = (entries: PermitEntry[]): PermitOption[] =>
  entries
    .map((entry) => ({
      id: entry.entry_id,
      label: (entry.title || entry.entry_id || "").trim() || entry.entry_id,
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

const filterDomainDevices = (
  devices: DeviceEntry[],
  domain: string = DOMAIN,
): DeviceEntry[] =>
  devices.filter((device) =>
    (device.identifiers ?? []).some(
      (identifier: [string, string]) => identifier[0] === domain,
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
  onSelected: (event: Event) => void;
}): TemplateResult => {
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
  showFavorites: boolean;
  favoriteValue: string;
  favoriteSelectDisabled: boolean;
  hass: HomeAssistant | null | undefined;
  favoritesOptions: FavoriteOption[];
  favoritesError: string | null;
  wrapSelect?: (content: TemplateResult) => unknown;
  localize: (key: string, ...args: Array<string | number>) => string;
  onSelected: (event: Event) => void;
}): TemplateResult | typeof nothing => {
  if (!params.showFavorites) return nothing;

  type FavoriteSelectOption = {
    value: string;
    label: string;
  };

  const selectOptions: FavoriteSelectOption[] = [];
  const favoriteItems: FavoriteSelectOption[] = [];
  const seenValues = new Set<string>();

  for (const favorite of params.favoritesOptions) {
    const name = favorite.name?.trim();
    const value = name || "";
    const valueKey = normalizeMatchValue(value);
    if (!valueKey || seenValues.has(valueKey)) continue;

    seenValues.add(valueKey);
    const label = name || "";

    favoriteItems.push({
      value,
      label,
    });
  }
  favoriteItems.sort(
    (first, second) =>
      first.label.localeCompare(second.label) ||
      first.value.localeCompare(second.value),
  );
  selectOptions.push(...favoriteItems);
  const inputValue = params.favoriteValue;

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

const renderFavoriteActionRow = (params: {
  showFavorites: boolean;
  showAddFavorite: boolean;
  showRemoveFavorite: boolean;
  selectedFavoriteId: string;
  favoriteRemoveDisabled: boolean;
  addFavoriteChecked: boolean;
  startButtonSuccess: boolean;
  startDisabled: boolean;
  localize: (key: string, ...args: Array<string | number>) => string;
}): TemplateResult => html`
  <div class="row actions">
    <div class="favorite-actions">
      ${params.showFavorites
        ? params.showRemoveFavorite
          ? html`
              <ha-formfield
                id="removeFavoriteWrap"
                .label=${params.localize("action.remove_favorite")}
              >
                <ha-icon-button
                  id="removeFavorite"
                  title=${params.localize("action.remove_favorite")}
                  aria-label=${params.localize("action.remove_favorite")}
                  data-favorite-id=${params.selectedFavoriteId}
                  ?disabled=${params.favoriteRemoveDisabled}
                >
                  <div class="leading">
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </div>
                </ha-icon-button>
              </ha-formfield>
            `
          : params.showAddFavorite
            ? html`
                <ha-formfield
                  id="addFavoriteWrap"
                  .label=${params.localize("action.add_favorite")}
                >
                  <ha-checkbox
                    id="addFavorite"
                    .checked=${params.addFavoriteChecked}
                  ></ha-checkbox>
                </ha-formfield>
              `
            : nothing
        : nothing}
    </div>
    ${params.startButtonSuccess
      ? html`
          <ha-button
            id="startReservation"
            class="start-button success"
            variant="success"
            appearance="filled"
            ?disabled=${params.startDisabled}
            aria-label=${params.localize("action.start_reservation")}
            title=${params.localize("action.start_reservation")}
          >
            ${params.localize("action.start_reservation")}
          </ha-button>
        `
      : html`
          <ha-button
            id="startReservation"
            class="start-button"
            ?disabled=${params.startDisabled}
            aria-label=${params.localize("action.start_reservation")}
            title=${params.localize("action.start_reservation")}
          >
            ${params.localize("action.start_reservation")}
          </ha-button>
        `}
  </div>
`;

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

const renderStatusAlert = (state: StatusState): unknown =>
  state.message
    ? html`<ha-alert alert-type=${state.type}>${state.message}</ha-alert>`
    : nothing;

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

type HassState = { config?: { state?: string } };

const isHassRunning = (hass: HassState | null | undefined): boolean =>
  hass?.config?.state === "RUNNING";

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
    const description = descriptionKey ? (getCardText(descriptionKey) ?? "") : "";
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
  const newKey = `${prefix}.value.card_type.new`;
  const activeKey = `${prefix}.value.card_type.active`;
  const newLabel = localize(localizeTarget, newKey);
  const activeLabel = localize(localizeTarget, activeKey);
  return [
    [
      "custom:city-visitor-parking-card",
      newLabel === newKey ? "New reservation card" : newLabel,
    ],
    [
      "custom:city-visitor-parking-active-card",
      activeLabel === activeKey ? "Active reservations card" : activeLabel,
    ],
  ];
};

type ParkingCardEditorConfig = {
  type: string;
  title?: string;
  icon?: string;
  show_favorites?: boolean;
  show_start_time?: boolean;
  show_end_time?: boolean;
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
      { name: "show_favorites", selector: { boolean: {} }, default: true },
      { name: "show_start_time", selector: { boolean: {} }, default: true },
      { name: "show_end_time", selector: { boolean: {} }, default: true },
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
      this._config?.show_favorites === false ||
      this._config?.show_start_time === false ||
      this._config?.show_end_time === false,
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
  const STATUS_THROTTLE_MS = 15000;
  // Background polling interval for zone status (and on page visibility restore).
  const STATUS_REFRESH_MS = 60000;

  type ZoneStatusResponse = {
    state?: string | null;
    window_kind?: string | null;
    window_start?: string | null;
    window_end?: string | null;
  };
  type CardConfig = {
    type: string;
    title?: string;
    icon?: string;
    show_favorites?: boolean;
    show_start_time?: boolean;
    show_end_time?: boolean;
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
    "startDateTime",
    "endDateTime",
  ]);
  const CHANGE_VALUE_IDS = new Set(["startDateTime", "endDateTime"]);

  class CityVisitorParkingNewReservationCard extends BaseLocalizedCard<CardConfig> {
    static styles = [
      BASE_CARD_STYLES,
      css`
        ha-textfield,
        ha-select,
        ha-selector {
          width: 100%;
        }
        .actions {
          display: flex;
          gap: var(--ha-space-2);
          align-items: center;
          justify-content: space-between;
        }
        .favorite-actions {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .leading {
          width: 48px;
          min-width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .leading ha-icon,
        .leading mwc-icon {
          width: 24px;
          height: 24px;
          transform: translateY(-4px);
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
    _zoneStatusTsByEntryId = new Map<string, number>();
    _zoneStatusInFlightByEntryId = new Map<string, Promise<void>>();
    _zoneStatusByEntryId = new Map<string, ZoneStatus>();
    _pendingPermitDefaultsEntryId: string | null = null;
    _pendingPermitDefaultsForce = false;
    _statusRefreshHandle: number | null = null;
    _statusVisibilityHandler: (() => void) | null = null;
    _translationsReady = false;
    _translationsLanguage: string | null = null;
    _prevHaState?: string;
    _onClick = (event: Event) => this._handleClick(event);
    _onInput = (event: Event) => this._handleInput(event);
    _onChange = (event: Event) => this._handleChange(event);
    _onPermitSelectChange = (event: Event) =>
      this._handlePermitSelectChange(event);
    _onFavoriteSelectChange = (event: Event) =>
      this._handleFavoriteSelectChange(event);
    _onDateTimePickerClick = (event: Event) =>
      this._handleDateTimePickerClick(event);

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
      const priorShowFavorites = this._config?.show_favorites ?? true;
      this._config = {
        show_favorites: config.show_favorites !== false,
        show_start_time: config.show_start_time !== false,
        show_end_time: config.show_end_time !== false,
        ...config,
      };
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
      const nextLanguage = this._getTranslationLanguage(hass);
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
        resetZoneStatusThrottle(this);
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
      if (!this._hass || !this._config?.show_favorites) return;
      if (!isHassRunning(this._hass)) return;
      const entryId = this._getActiveEntryId();
      if (!entryId) return;
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
      if (!this._config?.show_favorites) {
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
      const { showAddFavorite, showRemoveFavorite, removeFavorite } =
        this._getFavoriteActionState();
      const favoriteRemoveDisabled =
        controlsDisabled || this._favoriteRemoveInFlight;
      const favoritesOptions = this._favorites;
      const favoriteSelectDisabled = controlsDisabled || this._favoritesLoading;
      const startDisabled =
        controlsDisabled ||
        !hasDevice ||
        !hasTarget ||
        !hasLicense ||
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
                  onSelected: this._onPermitSelectChange,
                })
              : nothing}
            ${renderFavoriteSelect({
              showFavorites,
              favoriteValue,
              favoriteSelectDisabled,
              hass: this._hass,
              favoritesOptions,
              favoritesError: this._favoritesError,
              localize: localizeFn,
              onSelected: this._onFavoriteSelectChange,
              wrapSelect: (content) => keyed(activeEntryId ?? "", content),
            })}
            <div class="row">
              <ha-textfield
                id="licensePlate"
                .label=${localizeFn("field.license_plate")}
                placeholder=${localizeFn("placeholder.license_plate")}
                .value=${priorLicense}
              ></ha-textfield>
            </div>
            ${showStart
              ? html`
                  <div class="row datetime-row">
                    <ha-textfield
                      type="datetime-local"
                      id="startDateTime"
                      .label=${localizeFn("field.start_time")}
                      .value=${priorStartDateTime}
                      .min=${minDateTime}
                      ?disabled=${controlsDisabled}
                      @input=${this._onInput}
                      @change=${this._onChange}
                    ></ha-textfield>
                    <ha-icon-button
                      class="datetime-picker-button"
                      data-picker-field="startDateTime"
                      aria-label=${localizeFn("field.start_time")}
                      title=${localizeFn("field.start_time")}
                      ?disabled=${controlsDisabled}
                      @click=${this._onDateTimePickerClick}
                    >
                      <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
                    </ha-icon-button>
                  </div>
                `
              : nothing}
            ${showEnd
              ? html`
                  <div class="row datetime-row">
                    <ha-textfield
                      type="datetime-local"
                      id="endDateTime"
                      .label=${localizeFn("field.end_time")}
                      .value=${priorEndDateTime}
                      .min=${minDateTime}
                      ?disabled=${controlsDisabled}
                      @input=${this._onInput}
                      @change=${this._onChange}
                    ></ha-textfield>
                    <ha-icon-button
                      class="datetime-picker-button"
                      data-picker-field="endDateTime"
                      aria-label=${localizeFn("field.end_time")}
                      title=${localizeFn("field.end_time")}
                      ?disabled=${controlsDisabled}
                      @click=${this._onDateTimePickerClick}
                    >
                      <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
                    </ha-icon-button>
                  </div>
                `
              : nothing}
            ${renderFavoriteActionRow({
              showFavorites,
              showAddFavorite,
              showRemoveFavorite,
              selectedFavoriteId:
                removeFavorite?.id || removeFavorite?.license_plate || "",
              favoriteRemoveDisabled,
              addFavoriteChecked: this._addFavoriteChecked,
              startButtonSuccess: this._startButtonSuccess,
              startDisabled,
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
      if (!this._config?.show_favorites) return;
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
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const removeButton = target.closest<HTMLElement>("#removeFavorite");
      if (removeButton) {
        const id = removeButton.getAttribute("data-favorite-id") ?? "";
        void this._removeFavorite(id);
        return;
      }
      const startButton = target.closest<HTMLElement>("#startReservation");
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

    _handleDateTimePickerClick(event: Event): void {
      if (this._isInEditor()) return;
      event.stopPropagation();
      const target = event.currentTarget as HTMLElement | null;
      const fieldId = target?.dataset.pickerField;
      if (!fieldId) return;
      openDateTimePickerForField(this.renderRoot.querySelector(`#${fieldId}`));
    }

    _handlePermitSelectChange(event: Event): void {
      if (this._isInEditor()) return;
      const detail = (event as CustomEvent<{ value?: string | null }>).detail;
      const target = event.currentTarget as ValueElement | null;
      const hasDetailValue =
        detail != null && Object.prototype.hasOwnProperty.call(detail, "value");
      const value = hasDetailValue
        ? (detail.value ?? "")
        : (target?.value ?? "");
      const nextValue = value ?? "";
      this._handlePermitChange(nextValue);
    }

    _handleFavoriteSelectChange(event: Event): void {
      if (!this._config?.show_favorites || this._isInEditor()) return;
      const detail = (event as CustomEvent<{ value?: string | null }>).detail;
      const select = event.currentTarget as ValueElement | null;
      const path = event.composedPath();
      const pathValueElement = path.find(
        (node): node is ValueElement =>
          node instanceof HTMLElement &&
          (node.id === "favorite" || node.getAttribute("id") === "favorite"),
      );
      const hasDetailValue =
        detail != null && Object.prototype.hasOwnProperty.call(detail, "value");
      const selectedValue = hasDetailValue
        ? (detail.value ?? "")
        : (select?.value ?? pathValueElement?.value ?? "");
      const nextValue = selectedValue;
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
        this._clearFormValues();
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
      this._clearStatus();
      this._ensureDeviceId();
      this._maybeLoadFavorites();
      void this._loadZoneStatusForEntry(value);
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
    }

    _clearFormValues(): void {
      const hadValues = Object.keys(this._formValues).length > 0;
      const hadAddFavoriteChecked = this._addFavoriteChecked;
      this._formValues = {};
      clearFavoriteTransientState(this);
      if (hadValues || hadAddFavoriteChecked) this._requestRender();
    }

    _syncEntryState(forceSetupRefresh: boolean): void {
      const entryId = this._getActiveEntryId();
      applyZoneStatus(
        this,
        entryId ? (this._zoneStatusByEntryId.get(entryId) ?? null) : null,
      );
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
      this._statusRefreshHandle = window.setInterval(refresh, STATUS_REFRESH_MS);
      this._statusVisibilityHandler = () => {
        if (document.visibilityState === "visible") refresh();
      };
      document.addEventListener("visibilitychange", this._statusVisibilityHandler);
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
      return {
        state,
        kind,
        start: kind ? str(payload?.window_start) : null,
        end: kind ? str(payload?.window_end) : null,
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
        return;
      }
      this._setStatus(
        this._localize("message.reservation_requested"),
        "success",
        5000,
      );
      this._setStartButtonSuccess();
      this._startInFlight = false;
      this._requestRender();
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
      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const fallbackStart = new Date(now.getTime() + 60 * 1000);
      const startValue = showStart ? this._getInputValue("startDateTime") : "";
      const endValue = showEnd ? this._getInputValue("endDateTime") : "";
      const start = parseDateTimeValue(startValue) ?? fallbackStart;
      const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
      const end = parseDateTimeValue(endValue) ?? fallbackEnd;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return { start: null, end: null };
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
      const end = this._resolveDefaultEnd(start, 60 * 1000);
      this._setInputValue("endDateTime", formatDateTimeLocal(end));
    }

    _getStatusDefaultTimes(now: Date): { start: Date; end: Date } {
      const startDefault = new Date(now.getTime() + 60_000);
      const endDefault = new Date(now);
      endDefault.setHours(23, 59, 0, 0);
      const w = this._getRelevantWindowTimes();
      if (!w) return { start: startDefault, end: endDefault };
      return {
        start: this._zoneState === "free" ? w.start : startDefault,
        end: w.end,
      };
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

    _resolveDefaultEnd(start: Date, offsetMs: number): Date {
      const window = this._getRelevantWindowTimes();
      if (window && window.end > start) return window.end;
      const fallback = new Date(start.getTime() + offsetMs);
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
            formatDateTimeLocal(new Date(now.getTime() + 60_000)),
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

    _getActiveEntryId(): string | null {
      return getConfigEntryId(this._config) || this._selectedEntryId;
    }

    _getTranslationLanguage(hass: HomeAssistant | null): string {
      return getHassLanguage(hass) || navigator.language || "en";
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
    _onReservationPickerClick = (event: Event) =>
      this._handleReservationPickerClick(event);

    connectedCallback(): void {
      super.connectedCallback();
      if (!this._reservationStartedHandler) {
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
      }
      window.addEventListener(
        RESERVATION_STARTED_EVENT,
        this._reservationStartedHandler,
      );
    }

    disconnectedCallback(): void {
      for (const timeoutHandle of this._endButtonSuccessTimeoutByReservationId.values()) {
        window.clearTimeout(timeoutHandle);
      }
      this._endButtonSuccessTimeoutByReservationId.clear();
      for (const resolve of this._endButtonSuccessResolverByReservationId.values()) {
        resolve();
      }
      this._endButtonSuccessResolverByReservationId.clear();
      this._endButtonSuccessByReservationId.clear();
      this._pendingReservationNameByKey.clear();
      if (this._reservationStartedHandler) {
        window.removeEventListener(
          RESERVATION_STARTED_EVENT,
          this._reservationStartedHandler,
        );
      }
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
        const results = await Promise.all(
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
        for (const [index, result] of results.entries()) {
          const device = devices[index];
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
        this._reservationUpdateFlagsByDevice = reservationUpdateFlagsByDevice;
        this._activeReservations = collected;
        this._activeReservationsById = collectedById;
        this._activeReservationsLoadedFor = target;
        for (const reservationId of this._reservationInputValues.keys()) {
          if (!collectedById.has(reservationId)) {
            this._reservationInputValues.delete(reservationId);
          }
        }
        this._prunePendingReservationNames();
        for (const reservationId of this._endButtonSuccessByReservationId) {
          if (collectedById.has(reservationId)) continue;
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
      const title = this._config.title || "";
      const icon = this._config.icon;
      const controlsDisabled = this._isInEditor();
      return html`
        <ha-card @click=${this._onActionClick}>
          ${renderCardHeader(title, icon)}
          <div class="card-content">
            ${this._renderActiveReservations(controlsDisabled)}
            ${renderStatusAlert(this._statusState)}
          </div>
        </ha-card>
      `;
    }

    _renderActiveReservations(controlsDisabled: boolean): TemplateResult {
      const hasReservations = this._activeReservations.length > 0;
      const showEmpty =
        !this._activeReservationsLoading &&
        !this._activeReservationsError &&
        !hasReservations;
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
              <ha-textfield
                type="datetime-local"
                data-reservation-id=${reservation.reservation_id}
                data-field="start"
                .value=${startValue}
                .min=${startMin}
                .label=${this._localize("field.start_time")}
                ?disabled=${controlsDisabled || !allowStart || isBusy}
                @input=${this._onReservationInput}
                @change=${this._onReservationChange}
              ></ha-textfield>
              <ha-icon-button
                class="datetime-picker-button"
                data-picker-reservation-id=${reservation.reservation_id}
                data-picker-field="start"
                aria-label=${this._localize("field.start_time")}
                title=${this._localize("field.start_time")}
                ?disabled=${controlsDisabled || !allowStart || isBusy}
                @click=${this._onReservationPickerClick}
              >
                <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
              </ha-icon-button>
            </div>
            <div class="datetime-row">
              <ha-textfield
                type="datetime-local"
                data-reservation-id=${reservation.reservation_id}
                data-field="end"
                .value=${endValue}
                .min=${endMin}
                .label=${this._localize("field.end_time")}
                ?disabled=${controlsDisabled || !allowEnd || isBusy}
                @input=${this._onReservationInput}
                @change=${this._onReservationChange}
              ></ha-textfield>
              <ha-icon-button
                class="datetime-picker-button"
                data-picker-reservation-id=${reservation.reservation_id}
                data-picker-field="end"
                aria-label=${this._localize("field.end_time")}
                title=${this._localize("field.end_time")}
                ?disabled=${controlsDisabled || !allowEnd || isBusy}
                @click=${this._onReservationPickerClick}
              >
                <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
              </ha-icon-button>
            </div>
          </div>
          <div class="active-reservation-actions">
            ${endButtonSuccess
              ? html`
                  <ha-button
                    class="active-reservation-end success"
                    data-reservation-id=${reservation.reservation_id}
                    variant="success"
                    appearance="filled"
                    ?disabled=${controlsDisabled || isBusy}
                  >
                    ${this._localize("button.end_reservation")}
                  </ha-button>
                `
              : html`
                  <ha-button
                    class="active-reservation-end"
                    data-reservation-id=${reservation.reservation_id}
                    ?disabled=${controlsDisabled || isBusy}
                  >
                    ${this._localize("button.end_reservation")}
                  </ha-button>
                `}
          </div>
        </div>
      `;
    }

    _handleActionClick(event: Event): void {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const endButton = target.closest<HTMLElement>(
        "ha-button.active-reservation-end",
      );
      if (endButton) {
        const reservationId = endButton.dataset.reservationId ?? "";
        if (this._endButtonSuccessByReservationId.has(reservationId)) return;
        void this._handleActiveReservationEnd(reservationId);
      }
    }

    _handleReservationPickerClick(event: Event): void {
      if (this._isInEditor()) return;
      event.stopPropagation();
      const target = event.currentTarget as HTMLElement | null;
      const reservationId = target?.dataset.pickerReservationId;
      const field = target?.dataset.pickerField;
      if (!reservationId || (field !== "start" && field !== "end")) return;
      const pickerField = Array.from(
        this.renderRoot.querySelectorAll<HTMLElement>(
          "ha-textfield[data-reservation-id][data-field]",
        ),
      ).find(
        (element) =>
          element.dataset.reservationId === reservationId &&
          element.dataset.field === field,
      );
      openDateTimePickerForField(pickerField ?? null);
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
      const nextValue: { start?: string; end?: string } = {
        [fieldKey]: value,
      };
      this._reservationInputValues.set(reservationId, nextValue);
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
      const field = fieldElement.dataset.field;
      if (!reservationId || (field !== "start" && field !== "end")) return null;
      return {
        reservationId,
        fieldKey: field,
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

    _setEndButtonSuccess(reservationId: string): Promise<void> {
      const existingTimeout =
        this._endButtonSuccessTimeoutByReservationId.get(reservationId);
      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
        this._endButtonSuccessResolverByReservationId.get(reservationId)?.();
        this._endButtonSuccessResolverByReservationId.delete(reservationId);
      }
      this._endButtonSuccessByReservationId.add(reservationId);
      this._requestRender();
      return new Promise((resolve) => {
        this._endButtonSuccessResolverByReservationId.set(reservationId, resolve);
        const timeoutHandle = window.setTimeout(() => {
          this._endButtonSuccessTimeoutByReservationId.delete(reservationId);
          this._endButtonSuccessResolverByReservationId.delete(reservationId);
          this._endButtonSuccessByReservationId.delete(reservationId);
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
        return;
      }
      this._completeReservationActionSuccess(
        reservationId,
        "message.reservation_ended",
        false,
      );
      await this._setEndButtonSuccess(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }

    async _getConfigEntryTitles(): Promise<Map<string, string>> {
      if (!this._hass) return new Map();
      if (this._configEntriesPromise) return this._configEntriesPromise;
      const promise = fetchPermitEntries(this._hass)
        .then(buildPermitTitleMap)
        .catch(() => new Map<string, string>())
        .finally(() => {
          this._configEntriesPromise = null;
        });
      this._configEntriesPromise = promise;
      return promise;
    }

    async _getDomainDevices(): Promise<DeviceEntry[]> {
      if (!this._hass) return [];
      if (this._devicesPromise) return this._devicesPromise;
      const devicesPromise = this._hass
        .callWS<DeviceEntry[]>({ type: "config/device_registry/list" })
        .then((devices) => filterDomainDevices(devices))
        .finally(() => {
          this._devicesPromise = null;
        });
      this._devicesPromise = devicesPromise;
      return devicesPromise;
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
