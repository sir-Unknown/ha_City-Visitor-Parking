import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import {
  BASE_CARD_STYLES,
  DOMAIN,
  RESERVATION_STARTED_EVENT,
  clearStatusState,
  createErrorMessage,
  createLocalize,
  createRenderScheduler,
  createStatusState,
  formatDate,
  formatDateTimeLocal,
  formatTime,
  getCardText,
  getGlobalHass,
  getInvalidConfigError,
  isHassRunning,
  isHassStarting,
  isInEditor,
  registerCustomCard,
  renderCardHeader,
  renderLoadingCard,
  renderStatusAlert,
  setStatusState,
  showPicker,
  type DeviceEntry,
  type HomeAssistant,
  type StatusState,
  type StatusType,
} from "./card-shared";
import { getCardConfigForm } from "./city-visitor-parking-card-editor";
import { ensureTranslations } from "./localize";

(() => {
  const CARD_TYPE = "city-visitor-parking-card";
  const WS_LIST_FAVORITES = "city_visitor_parking/favorites";
  const WS_GET_STATUS = "city_visitor_parking/status";
  const STATUS_THROTTLE_MS = 15000;
  const STATUS_REFRESH_MS = 60000;
  const FAVORITE_PLACEHOLDER_VALUE = "__favorite_placeholder__";
  const PERMIT_PLACEHOLDER_VALUE = "__permit_placeholder__";

  type FavoriteItem = {
    id?: string;
    license_plate?: string;
    name?: string;
    [key: string]: unknown;
  };
  type PermitOption = {
    id: string;
    primary: string;
    secondary: string;
  };
  type ZoneStatus = {
    state: "chargeable" | "free" | null;
    kind: "current" | "next" | null;
    start: string | null;
    end: string | null;
  };
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
    show_reservation_form?: boolean;
    show_favorites?: boolean;
    show_start_time?: boolean;
    show_end_time?: boolean;
    config_entry_id?: string;
    device_id?: string;
  };
  type ValueElement = HTMLElement & { value?: string };
  type CheckedElement = HTMLElement & { checked: boolean; disabled?: boolean };
  type FavoriteActionState = {
    showAddFavorite: boolean;
    showRemoveFavorite: boolean;
    selectedFavorite: FavoriteItem | null;
  };

  const normalizeTimeValue = (value: string): string =>
    value.length === 5 ? `${value}:00` : value;
  const normalizeMatchValue = (value: string | undefined | null): string =>
    String(value ?? "")
      .trim()
      .toLowerCase();
  const normalizePlateValue = (value: string | undefined | null): string =>
    normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");
  const splitPermitLabel = (
    label: string,
    entryId: string,
  ): { primary: string; secondary: string } => {
    const trimmed = label.trim();
    if (!trimmed) {
      return { primary: entryId, secondary: "" };
    }
    const parts = trimmed
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return { primary: parts[0], secondary: parts.slice(1).join(" - ") };
    }
    if (trimmed !== entryId) {
      return { primary: trimmed, secondary: entryId };
    }
    return { primary: trimmed, secondary: "" };
  };
  const INPUT_VALUE_IDS = new Set([
    "licensePlate",
    "visitorName",
    "startDateTime",
    "startDate",
    "startTime",
    "endDateTime",
    "endDate",
    "endTime",
  ]);
  const CHANGE_VALUE_IDS = new Set([
    "startDateTime",
    "startDate",
    "startTime",
    "endDateTime",
    "endDate",
    "endTime",
  ]);

  class CityVisitorParkingNewReservationCard extends LitElement {
    static styles = [
      BASE_CARD_STYLES,
      css`
        ha-textfield,
        ha-select,
        ha-selector,
        ha-date-input,
        ha-time-input {
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
        .remove-favorite {
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
        .start-button.success {
          --mdc-theme-primary: var(--success-color, #21b365);
          --mdc-theme-on-primary: var(--text-primary-color, #fff);
        }
      `,
    ];
    _config: CardConfig | null;
    _hass: HomeAssistant | null;
    _deviceId: string | null;
    _deviceEntryId: string | null;
    _deviceLoadPromise: Promise<void> | null;
    _deviceIdByEntryId: Map<string, string | null>;
    _favorites: FavoriteItem[];
    _favoritesError: string | null;
    _favoritesLoadedFor: string | null;
    _favoritesRetryAfter: number;
    _favoritesLoading: boolean;
    _favoritesByPlate: Map<string, FavoriteItem>;
    _favoritesByPlateName: Map<string, FavoriteItem>;
    _favoritesByValue: Map<string, FavoriteItem>;
    _permitOptions: PermitOption[];
    _permitOptionsLoaded: boolean;
    _permitOptionsLoading: boolean;
    _permitOptionsLoadPromise: Promise<void> | null;
    _formValues: Record<string, string>;
    _pendingRemoveFavoriteId: string | null;
    _selectedEntryId: string | null;
    _startButtonSuccess: boolean;
    _startButtonSuccessTimeout: number | null;
    _startInFlight: boolean;
    _favoriteRemoveInFlight: boolean;
    _addFavoriteChecked: boolean;
    _suppressFavoriteClear: boolean;
    _zoneState: "chargeable" | "free" | null;
    _windowKind: "current" | "next" | null;
    _windowStartIso: string | null;
    _windowEndIso: string | null;
    _zoneStatusTsByEntryId: Map<string, number>;
    _zoneStatusInFlightByEntryId: Map<string, Promise<void>>;
    _zoneStatusByEntryId: Map<string, ZoneStatus>;
    _pendingPermitDefaultsEntryId: string | null;
    _pendingPermitDefaultsForce: boolean;
    _statusRefreshHandle: number | null;
    _statusState: StatusState;
    _requestRender: () => void;
    _translationsVersion: number;
    _translationsReady: boolean;
    _translationsLanguage: string | null;
    _splitDateTimeSupport: boolean | null;
    _prevHaState?: string;
    _localize: (key: string, ...args: Array<string | number>) => string;
    _errorMessage: (err: unknown, fallbackKey: string) => string;
    _onClick: (event: Event) => void;
    _onInput: (event: Event) => void;
    _onChange: (event: Event) => void;
    _onPermitSelectChange: (event: Event) => void;
    _onFavoriteSelectChange: (event: Event) => void;
    _onPickerClick: (event: Event) => void;

    constructor() {
      super();
      this._config = null;
      this._hass = null;
      this._deviceId = null;
      this._deviceEntryId = null;
      this._deviceLoadPromise = null;
      this._deviceIdByEntryId = new Map();
      this._favorites = [];
      this._favoritesError = null;
      this._favoritesLoadedFor = null;
      this._favoritesRetryAfter = 0;
      this._favoritesLoading = false;
      this._favoritesByPlate = new Map();
      this._favoritesByPlateName = new Map();
      this._favoritesByValue = new Map();
      this._permitOptions = [];
      this._permitOptionsLoaded = false;
      this._permitOptionsLoading = false;
      this._permitOptionsLoadPromise = null;
      this._formValues = {};
      this._pendingRemoveFavoriteId = null;
      this._selectedEntryId = null;
      this._startButtonSuccess = false;
      this._startButtonSuccessTimeout = null;
      this._startInFlight = false;
      this._favoriteRemoveInFlight = false;
      this._addFavoriteChecked = false;
      this._suppressFavoriteClear = false;
      this._zoneState = null;
      this._windowKind = null;
      this._windowStartIso = null;
      this._windowEndIso = null;
      this._zoneStatusTsByEntryId = new Map();
      this._zoneStatusInFlightByEntryId = new Map();
      this._zoneStatusByEntryId = new Map();
      this._pendingPermitDefaultsEntryId = null;
      this._pendingPermitDefaultsForce = false;
      this._statusRefreshHandle = null;
      this._statusState = createStatusState();
      this._requestRender = createRenderScheduler(() => this.requestUpdate());
      this._translationsVersion = 0;
      this._translationsReady = false;
      this._translationsLanguage = null;
      this._splitDateTimeSupport = null;
      this._prevHaState = undefined;
      this._localize = createLocalize(() => this._hass);
      this._errorMessage = createErrorMessage(() => this._hass);
      this._onClick = (event: Event) => this._handleClick(event);
      this._onInput = (event: Event) => this._handleInput(event);
      this._onChange = (event: Event) => this._handleChange(event);
      this._onPermitSelectChange = (event: Event) =>
        this._handlePermitSelectChange(event);
      this._onFavoriteSelectChange = (event: Event) =>
        this._handleFavoriteSelectChange(event);
      this._onPickerClick = (event: Event) => this._handlePickerClick(event);
    }

    static async getConfigForm(hass?: HomeAssistant): Promise<{
      readonly schema: ReadonlyArray<Record<string, unknown>>;
    }> {
      return getCardConfigForm(hass);
    }

    static getStubConfig(): CardConfig {
      return {
        type: `custom:${CARD_TYPE}`,
        title: getCardText("name"),
        show_reservation_form: true,
        show_favorites: true,
        show_start_time: true,
        show_end_time: true,
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw getInvalidConfigError(
          this._hass ?? getGlobalHass<HomeAssistant>(),
        );
      }
      const priorEntryId = this._getActiveEntryId();
      this._config = {
        show_reservation_form: config.show_reservation_form !== false,
        show_favorites: config.show_favorites !== false,
        show_start_time: config.show_start_time !== false,
        show_end_time: config.show_end_time !== false,
        ...config,
      };
      if (this._config.config_entry_id) {
        this._selectedEntryId = null;
      }
      const entryChanged = this._getActiveEntryId() !== priorEntryId;
      if (this._config.device_id) {
        this._deviceId = this._config.device_id;
        this._deviceEntryId = this._config.config_entry_id || null;
        if (entryChanged) {
          this._resetFavoritesState();
        }
      } else if (entryChanged) {
        this._resetDeviceState();
      }
      const entryId = this._getActiveEntryId();
      this._applyZoneStatusCache(entryId);
      this._setPendingDefaultsForFixedEntry(entryId);
      this._requestRender();
      this._ensureDeviceId();
      this._ensurePermitOptions();
      if (entryId) {
        void this._loadZoneStatusForEntry(entryId);
      }
      this._setupStatusRefresh(entryId);
      void this._loadData();
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
          this._translationsVersion += 1;
          this._translationsReady = true;
          this._translationsLanguage = nextLanguage;
          this.requestUpdate();
        });
      }
      const becameRunning =
        prev !== "RUNNING" && hass.config?.state === "RUNNING";
      if (becameRunning) {
        this._favoritesLoadedFor = null;
        this._favoritesRetryAfter = 0;
        this._zoneStatusTsByEntryId.clear();
      }
      this._requestRender();
      this._ensureDeviceId();
      this._ensurePermitOptions();
      const entryId = this._getActiveEntryId();
      this._applyZoneStatusCache(entryId);
      this._setPendingDefaultsForFixedEntry(entryId);
      if (entryId) {
        void this._loadZoneStatusForEntry(entryId);
      }
      this._setupStatusRefresh(entryId);
      void this._loadData();
    }

    disconnectedCallback(): void {
      super.disconnectedCallback();
      this._clearStatusRefresh();
    }

    getCardSize(): number {
      return 4;
    }

    async _ensureDeviceId(): Promise<void> {
      if (!this._hass) {
        return;
      }
      const entryId = this._getActiveEntryId();
      if (!entryId) {
        return;
      }
      if (this._config?.device_id) {
        this._deviceId = this._config.device_id;
        this._deviceEntryId = this._config.config_entry_id || entryId;
        return;
      }
      if (this._deviceEntryId === entryId && this._deviceId) {
        return;
      }
      const cachedDeviceId = this._deviceIdByEntryId.get(entryId);
      if (cachedDeviceId !== undefined) {
        this._deviceId = cachedDeviceId;
        this._deviceEntryId = entryId;
        this._requestRender();
        return;
      }
      if (this._deviceLoadPromise) {
        return;
      }

      this._deviceLoadPromise = this._hass
        .callWS<DeviceEntry[]>({ type: "config/device_registry/list" })
        .then((devices) => {
          const match = devices.find((device: DeviceEntry) => {
            const identifiers = Array.isArray(device.identifiers)
              ? device.identifiers
              : [];
            const hasDomain = identifiers.some(
              (identifier: [string, string]) => identifier[0] === DOMAIN,
            );
            const hasEntry = Array.isArray(device.config_entries)
              ? device.config_entries.includes(entryId)
              : false;
            return hasDomain && hasEntry;
          });
          const deviceId = match ? match.id : null;
          this._deviceId = deviceId;
          if (deviceId) {
            this._deviceIdByEntryId.set(entryId, deviceId);
          }
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
      if (this._config?.config_entry_id || !this._hass) {
        return;
      }
      if (this._permitOptionsLoaded || this._permitOptionsLoadPromise) {
        return;
      }
      void this._loadPermitOptions();
    }

    async _loadPermitOptions(): Promise<void> {
      if (!this._hass || this._config?.config_entry_id) {
        return;
      }
      const hass = this._hass;
      if (this._permitOptionsLoadPromise) {
        return this._permitOptionsLoadPromise;
      }
      this._permitOptionsLoading = true;
      this._requestRender();
      const loadPromise = (async () => {
        try {
          const result = await hass.callWS<
            Array<{ entry_id: string; title?: string | null }>
          >({
            type: "config_entries/get",
            type_filter: ["device", "hub", "service"],
            domain: DOMAIN,
          });
          this._permitOptions = result
            .map((entry) => {
              const label = entry.title || entry.entry_id;
              const { primary, secondary } = splitPermitLabel(
                label,
                entry.entry_id,
              );
              return {
                id: entry.entry_id,
                primary,
                secondary,
              };
            })
            .sort(
              (first, second) =>
                first.primary.localeCompare(second.primary) ||
                first.secondary.localeCompare(second.secondary),
            );
          this._permitOptionsLoaded = true;
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

    async _loadData(): Promise<void> {
      if (this._config?.show_reservation_form === false) {
        return;
      }
      await this._maybeLoadFavorites();
    }

    async _maybeLoadFavorites(): Promise<void> {
      if (
        !this._hass ||
        !this._config?.show_favorites ||
        this._config?.show_reservation_form === false
      ) {
        return;
      }
      if (!isHassRunning(this._hass)) {
        return;
      }
      const entryId = this._getActiveEntryId();
      if (!entryId) {
        return;
      }
      if (Date.now() < this._favoritesRetryAfter) {
        return;
      }
      if (this._favoritesLoading) {
        return;
      }
      if (this._favoritesLoadedFor === entryId) {
        return;
      }

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
        this._favoritesLoadedFor = null;
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
            this._setInputValue("visitorName", "");
            this._setInputValue("licensePlate", "");
            this._setInputValue("favorite", FAVORITE_PLACEHOLDER_VALUE);
          }
          this._pendingRemoveFavoriteId = null;
        }
        this._requestRender();
      }
    }

    async _loadZoneStatusForEntry(entryId: string): Promise<void> {
      if (!this._hass || !entryId) {
        return;
      }
      const hass = this._hass;
      const force = this._pendingPermitDefaultsEntryId === entryId;
      const now = Date.now();
      const lastTs = this._zoneStatusTsByEntryId.get(entryId);
      if (!force && lastTs !== undefined && now - lastTs < STATUS_THROTTLE_MS) {
        return;
      }
      const inFlight = this._zoneStatusInFlightByEntryId.get(entryId);
      if (inFlight) {
        return inFlight;
      }

      const loadPromise = (async () => {
        const emptyStatus: ZoneStatus = {
          state: null,
          kind: null,
          start: null,
          end: null,
        };
        try {
          const result = await hass.callWS<ZoneStatusResponse>({
            type: WS_GET_STATUS,
            config_entry_id: entryId,
          });
          const normalized = this._normalizeZoneStatus(result);
          this._zoneStatusByEntryId.set(entryId, normalized);
          if (entryId === this._getActiveEntryId()) {
            this._setZoneStatus(normalized);
            this._applyPendingPermitDefaults(entryId);
          }
        } catch {
          this._zoneStatusByEntryId.set(entryId, emptyStatus);
          if (entryId === this._getActiveEntryId()) {
            this._setZoneStatus(emptyStatus);
            this._applyPendingPermitDefaults(entryId);
          }
        } finally {
          this._zoneStatusTsByEntryId.set(entryId, Date.now());
          this._zoneStatusInFlightByEntryId.delete(entryId);
          this._requestRender();
        }
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
        };
      }
      const controlsDisabled = this._isInEditor();
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("visitorName").trim();
      const selectedFavorite = this._findFavoriteByValue(
        this._getInputValue("favorite"),
      );
      const selectedFavoriteMatchesLicense = selectedFavorite
        ? this._selectedFavoriteMatchesLicense(selectedFavorite, license)
        : false;
      const matchingFavorite = this._findFavorite(license, name);
      const canManageFavorites =
        !controlsDisabled && !this._favoritesLoading && Boolean(this._deviceId);
      const showAddFavorite =
        canManageFavorites &&
        Boolean(license) &&
        Boolean(name) &&
        !matchingFavorite &&
        !selectedFavoriteMatchesLicense;
      const showRemoveFavorite =
        canManageFavorites &&
        Boolean(selectedFavorite?.id || selectedFavorite?.license_plate) &&
        selectedFavoriteMatchesLicense;
      return {
        showAddFavorite: showAddFavorite && !showRemoveFavorite,
        showRemoveFavorite,
        selectedFavorite,
      };
    }

    render(): TemplateResult {
      if (!this._config) {
        return html``;
      }
      if (!this._hass || isHassStarting(this._hass)) {
        return renderLoadingCard(
          this._hass ?? getGlobalHass<HomeAssistant>(),
          html,
        );
      }
      if (!this._translationsReady) {
        return html``;
      }

      const priorLicense = this._getInputValue("licensePlate");
      const priorStartDate = this._getInputValue("startDate");
      const priorStartTime = this._getInputValue("startTime");
      const priorEndDate = this._getInputValue("endDate");
      const priorEndTime = this._getInputValue("endTime");
      const priorStartDateTime = this._getInputValue("startDateTime");
      const priorEndDateTime = this._getInputValue("endDateTime");
      const priorVisitorName = this._getInputValue("visitorName");
      const priorFavorite = this._getInputValue("favorite");

      const title = this._config.title || "";
      const icon = this._config.icon;
      const showFavorites = this._config.show_favorites;
      const showReservationForm = this._config.show_reservation_form;
      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const activeEntryId = this._getActiveEntryId();
      const showPermitPicker = !this._config.config_entry_id;
      const hasTarget = Boolean(activeEntryId);
      const favoriteValue = hasTarget
        ? priorFavorite && priorFavorite !== FAVORITE_PLACEHOLDER_VALUE
          ? priorFavorite
          : FAVORITE_PLACEHOLDER_VALUE
        : "";
      const hasDevice = Boolean(this._deviceId);
      const useSplitDateTime = this._useSplitDateTime();
      const controlsDisabled = this._isInEditor();
      const localize = this._localize.bind(this);
      const permitPlaceholderKey = "message.select_permit";
      const permitPlaceholder = localize(permitPlaceholderKey);
      const permitPlaceholderText =
        permitPlaceholder === permitPlaceholderKey ? "" : permitPlaceholder;
      const permitSelectedText = activeEntryId
        ? this._permitOptions.find((entry) => entry.id === activeEntryId)
            ?.primary || activeEntryId
        : permitPlaceholderText;
      const permitSelectValue = activeEntryId ?? PERMIT_PLACEHOLDER_VALUE;
      const permitSelectDisabled =
        controlsDisabled || this._permitOptionsLoading;
      const { showAddFavorite, showRemoveFavorite, selectedFavorite } =
        this._getFavoriteActionState();
      const favoriteRemoveDisabled =
        controlsDisabled || this._favoriteRemoveInFlight;
      const favoritesOptions = this._favorites;
      const selectedFavoriteForText = hasTarget
        ? favoriteValue === FAVORITE_PLACEHOLDER_VALUE || !favoriteValue
          ? null
          : this._findFavoriteByValue(favoriteValue)
        : null;
      const favoriteSelectedText = hasTarget
        ? favoriteValue === FAVORITE_PLACEHOLDER_VALUE || !favoriteValue
          ? localize("message.select_favorite")
          : selectedFavoriteForText?.name ||
            selectedFavoriteForText?.license_plate ||
            favoriteValue
        : "";
      const favoriteSelectDisabled = controlsDisabled || this._favoritesLoading;
      const startDisabled =
        controlsDisabled || !hasDevice || this._startInFlight;
      return html`
        <ha-card
          @click=${this._onClick}
          @input=${this._onInput}
          @change=${this._onChange}
        >
          ${renderCardHeader(title, icon, html, nothing)}
          <div class="card-content">
            ${showReservationForm
              ? html`
                  ${showPermitPicker
                    ? html`
                        <div class="row">
                          <ha-select
                            id="permitSelect"
                            .label=${localize("field.permit")}
                            .value=${permitSelectValue}
                            .selectedText=${permitSelectedText}
                            ?disabled=${permitSelectDisabled}
                            @selected=${this._onPermitSelectChange}
                          >
                            <mwc-list-item value=${PERMIT_PLACEHOLDER_VALUE}>
                              ${permitPlaceholderText}
                            </mwc-list-item>
                            ${this._permitOptions.map((entry) => {
                              const secondaryText = entry.secondary;
                              return html`<mwc-list-item
                                value=${entry.id}
                                ?twoline=${Boolean(secondaryText)}
                              >
                                <span>${entry.primary}</span>
                                ${secondaryText
                                  ? html`<span slot="secondary"
                                      >${secondaryText}</span
                                    >`
                                  : nothing}
                              </mwc-list-item>`;
                            })}
                          </ha-select>
                        </div>
                      `
                    : nothing}
                  ${showFavorites
                    ? html`
                        <div class="row">
                          ${keyed(
                            activeEntryId ?? "",
                            html`<ha-select
                              id="favorite"
                              .label=${localize("field.favorite")}
                              .value=${favoriteValue}
                              .selectedText=${favoriteSelectedText}
                              ?disabled=${favoriteSelectDisabled}
                              @selected=${this._onFavoriteSelectChange}
                            >
                              ${hasTarget
                                ? html`
                                    <mwc-list-item
                                      value=${FAVORITE_PLACEHOLDER_VALUE}
                                    >
                                      ${localize("message.select_favorite")}
                                    </mwc-list-item>
                                  `
                                : nothing}
                              ${favoritesOptions.map(
                                (favorite: FavoriteItem) => {
                                  const value =
                                    favorite.license_plate || favorite.id || "";
                                  const label =
                                    favorite.name ||
                                    favorite.license_plate ||
                                    favorite.id ||
                                    "";
                                  const secondaryText =
                                    favorite.name && favorite.license_plate
                                      ? favorite.license_plate
                                      : "";
                                  return html`<mwc-list-item
                                    value=${value}
                                    ?twoline=${Boolean(secondaryText)}
                                  >
                                    <span>${label}</span>
                                    ${secondaryText
                                      ? html`<span slot="secondary"
                                          >${secondaryText}</span
                                        >`
                                      : nothing}
                                  </mwc-list-item>`;
                                },
                              )}
                            </ha-select>`,
                          )}
                          ${this._favoritesError
                            ? html`
                                <ha-alert alert-type="warning">
                                  ${this._favoritesError}
                                </ha-alert>
                              `
                            : nothing}
                        </div>
                      `
                    : nothing}
                  <div class="row">
                    <ha-textfield
                      id="visitorName"
                      .label=${localize("field.name")}
                      .value=${priorVisitorName}
                    ></ha-textfield>
                  </div>
                  <div class="row">
                    <ha-textfield
                      id="licensePlate"
                      .label=${localize("field.license_plate")}
                      placeholder=${localize("placeholder.license_plate")}
                      .value=${priorLicense}
                    ></ha-textfield>
                  </div>
                  ${showStart
                    ? useSplitDateTime
                      ? html`
                          <div class="row">
                            <ha-date-input
                              id="startDate"
                              .label=${localize("field.start_date")}
                              .locale=${this._hass?.locale}
                              .value=${priorStartDate}
                            ></ha-date-input>
                          </div>
                          <div class="row">
                            <ha-time-input
                              id="startTime"
                              .label=${localize("field.start_time")}
                              .locale=${this._hass?.locale}
                              .value=${priorStartTime}
                            ></ha-time-input>
                          </div>
                        `
                      : html`
                          <div class="row">
                            <ha-textfield
                              id="startDateTime"
                              .label=${localize("field.start_time")}
                              type="datetime-local"
                              .value=${priorStartDateTime}
                              @click=${this._onPickerClick}
                            ></ha-textfield>
                          </div>
                        `
                    : nothing}
                  ${showEnd
                    ? useSplitDateTime
                      ? html`
                          <div class="row">
                            <ha-date-input
                              id="endDate"
                              .label=${localize("field.end_date")}
                              .locale=${this._hass?.locale}
                              .value=${priorEndDate}
                            ></ha-date-input>
                          </div>
                          <div class="row">
                            <ha-time-input
                              id="endTime"
                              .label=${localize("field.end_time")}
                              .locale=${this._hass?.locale}
                              .value=${priorEndTime}
                            ></ha-time-input>
                          </div>
                        `
                      : html`
                          <div class="row">
                            <ha-textfield
                              id="endDateTime"
                              .label=${localize("field.end_time")}
                              type="datetime-local"
                              .value=${priorEndDateTime}
                              @click=${this._onPickerClick}
                            ></ha-textfield>
                          </div>
                        `
                    : nothing}
                  <div class="row actions">
                    <div class="favorite-actions">
                      ${showFavorites
                        ? showRemoveFavorite
                          ? html`
                              <ha-formfield
                                id="removeFavoriteWrap"
                                class="remove-favorite"
                                .label=${localize("action.remove_favorite")}
                              >
                                <ha-icon-button
                                  id="removeFavorite"
                                  title=${localize("action.remove_favorite")}
                                  aria-label=${localize(
                                    "action.remove_favorite",
                                  )}
                                  data-favorite-id=${selectedFavorite?.id ||
                                  selectedFavorite?.license_plate ||
                                  ""}
                                  ?disabled=${favoriteRemoveDisabled}
                                >
                                  <div class="leading">
                                    <ha-icon
                                      icon="mdi:trash-can-outline"
                                    ></ha-icon>
                                  </div>
                                </ha-icon-button>
                              </ha-formfield>
                            `
                          : showAddFavorite
                            ? html`
                                <ha-formfield
                                  id="addFavoriteWrap"
                                  .label=${localize("action.add_favorite")}
                                >
                                  <ha-checkbox
                                    id="addFavorite"
                                    .checked=${this._addFavoriteChecked}
                                  ></ha-checkbox>
                                </ha-formfield>
                              `
                            : nothing
                        : nothing}
                    </div>
                    <ha-button
                      id="startReservation"
                      class=${this._startButtonSuccess
                        ? "start-button success"
                        : "start-button"}
                      ?disabled=${startDisabled}
                    >
                      ${localize("action.start_reservation")}
                    </ha-button>
                  </div>
                `
              : nothing}
            ${renderStatusAlert(this._statusState, html, nothing)}
          </div>
        </ha-card>
      `;
    }

    updated(): void {
      if (!this._config) {
        return;
      }

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
      if (!this._config?.show_favorites) {
        return;
      }
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("visitorName").trim();
      const matchingFavorite = this._findFavorite(license, name);
      if (matchingFavorite) {
        const matchingValue =
          matchingFavorite.license_plate || matchingFavorite.id || "";
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

    _handlePickerClick(event: Event): void {
      showPicker(event, this._isInEditor());
    }

    _handleClick(event: Event): void {
      if (this._isInEditor()) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const removeButton = target.closest<HTMLElement>("#removeFavorite");
      if (removeButton) {
        const id = removeButton.getAttribute("data-favorite-id") ?? "";
        void this._removeFavorite(id);
        return;
      }
      const startButton = target.closest<HTMLElement>("#startReservation");
      if (startButton) {
        void this._handleStart();
      }
    }

    _handleInput(event: Event): void {
      const field = this._getValueFromEvent(event, INPUT_VALUE_IDS);
      if (field) {
        this._setInputValue(field.id, field.value);
      }
      if (field?.id === "licensePlate" || field?.id === "visitorName") {
        const selectedFavorite = this._getInputValue("favorite");
        if (
          selectedFavorite &&
          selectedFavorite !== FAVORITE_PLACEHOLDER_VALUE
        ) {
          this._suppressFavoriteClear = true;
          this._setInputValue("favorite", FAVORITE_PLACEHOLDER_VALUE);
        }
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      if (
        field?.id === "startDateTime" &&
        this._config?.show_start_time &&
        this._config?.show_end_time &&
        !this._useSplitDateTime()
      ) {
        this._syncEndWithStart(false);
      }
    }

    _handleChange(event: Event): void {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const field = this._getValueFromEvent(event, CHANGE_VALUE_IDS);
      if (field) {
        this._setInputValue(field.id, field.value);
      }
      if (target.id === "addFavorite") {
        this._addFavoriteChecked = (target as CheckedElement).checked;
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      if (
        field?.id === "startDateTime" &&
        this._config?.show_start_time &&
        this._config?.show_end_time &&
        !this._useSplitDateTime()
      ) {
        this._syncEndWithStart(false);
        return;
      }
      if (
        (field?.id === "startDate" || field?.id === "startTime") &&
        this._config?.show_start_time &&
        this._config?.show_end_time &&
        this._useSplitDateTime()
      ) {
        this._syncEndWithStart(true);
      }
    }

    _handlePermitSelectChange(event: Event): void {
      if (this._isInEditor()) {
        return;
      }
      const detail = (event as CustomEvent<{ value?: string | null }>).detail;
      const target = event.currentTarget as ValueElement | null;
      const value = detail?.value ?? target?.value ?? "";
      const nextValue = value === PERMIT_PLACEHOLDER_VALUE ? "" : (value ?? "");
      this._handlePermitChange(nextValue);
    }

    _handleFavoriteSelectChange(event: Event): void {
      if (!this._config?.show_favorites || this._isInEditor()) {
        return;
      }
      const detail = (event as CustomEvent<{ value?: string | null }>).detail;
      const select = event.currentTarget as ValueElement | null;
      const plate = detail?.value ?? select?.value ?? "";
      this._setInputValue("favorite", plate);
      if (this._suppressFavoriteClear) {
        this._suppressFavoriteClear = false;
        if (!plate || plate === FAVORITE_PLACEHOLDER_VALUE) {
          this._scheduleFavoriteActionsUpdate();
          return;
        }
      }
      if (!plate || plate === FAVORITE_PLACEHOLDER_VALUE) {
        void this._applyFavoriteSelection("", "");
        return;
      }
      const favorite = this._favoritesByValue.get(normalizeMatchValue(plate));
      void this._applyFavoriteSelection(plate, favorite?.name ?? "");
    }

    _handlePermitChange(value: string): void {
      if (!value) {
        this._selectedEntryId = null;
        this._pendingPermitDefaultsEntryId = null;
        this._pendingPermitDefaultsForce = false;
        this._clearStatusRefresh();
        this._resetDeviceState();
        this._clearFormValues();
        this._setInputValue("visitorName", "");
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
      this._pendingPermitDefaultsEntryId = value;
      this._pendingPermitDefaultsForce = true;
      this._resetDeviceState();
      this._suppressFavoriteClear = false;
      this._setInputValue("favorite", FAVORITE_PLACEHOLDER_VALUE);
      this._setInputValue("visitorName", "");
      this._setInputValue("licensePlate", "");
      this._applyZoneStatusCache(value);
      this._clearStatus();
      this._ensureDeviceId();
      this._maybeLoadFavorites();
      void this._loadZoneStatusForEntry(value);
      this._setupStatusRefresh(value);
    }

    _resetFavoritesState(): void {
      this._favoritesLoadedFor = null;
      this._favoritesRetryAfter = 0;
      this._favoritesError = null;
      this._favoritesLoading = false;
      this._setFavorites([]);
    }

    _resetDeviceState(): void {
      this._deviceId = null;
      this._deviceEntryId = null;
      this._setZoneStatus(null);
      this._resetFavoritesState();
    }

    _clearFormValues(): void {
      const hadValues = Object.keys(this._formValues).length > 0;
      const hadAddFavoriteChecked = this._addFavoriteChecked;
      this._formValues = {};
      this._addFavoriteChecked = false;
      this._suppressFavoriteClear = false;
      if (hadValues || hadAddFavoriteChecked) {
        this._requestRender();
      }
    }

    _applyZoneStatusCache(entryId: string | null): void {
      if (!entryId) {
        this._setZoneStatus(null);
        return;
      }
      const cached = this._zoneStatusByEntryId.get(entryId);
      if (!cached) {
        this._setZoneStatus(null);
        return;
      }
      this._setZoneStatus(cached);
    }

    _setPendingDefaultsForFixedEntry(entryId: string | null): void {
      if (!this._config?.config_entry_id || !entryId) {
        return;
      }
      this._pendingPermitDefaultsEntryId = entryId;
    }

    _setupStatusRefresh(entryId: string | null): void {
      this._clearStatusRefresh();
      if (
        !this._config?.config_entry_id ||
        !this._config.show_reservation_form ||
        !entryId
      ) {
        return;
      }
      this._statusRefreshHandle = window.setInterval(() => {
        if (!this._hass) {
          return;
        }
        const activeEntryId = this._getActiveEntryId();
        if (!activeEntryId || activeEntryId !== entryId) {
          return;
        }
        this._pendingPermitDefaultsEntryId = entryId;
        void this._loadZoneStatusForEntry(entryId);
      }, STATUS_REFRESH_MS);
    }

    _clearStatusRefresh(): void {
      if (this._statusRefreshHandle === null) {
        return;
      }
      window.clearInterval(this._statusRefreshHandle);
      this._statusRefreshHandle = null;
    }

    _setFavorites(favorites: FavoriteItem[]): void {
      this._favorites = favorites;
      this._rebuildFavoriteIndex();
    }

    _setZoneStatus(status: ZoneStatus | null): void {
      this._zoneState = status?.state ?? null;
      this._windowKind = status?.kind ?? null;
      this._windowStartIso = status?.start ?? null;
      this._windowEndIso = status?.end ?? null;
    }

    _applyPendingPermitDefaults(entryId: string): void {
      if (this._pendingPermitDefaultsEntryId !== entryId) {
        return;
      }
      this._applyStatusDefaultsToForm(this._pendingPermitDefaultsForce);
      this._pendingPermitDefaultsEntryId = null;
      this._pendingPermitDefaultsForce = false;
    }

    _rebuildFavoriteIndex(): void {
      const byPlate = new Map<string, FavoriteItem>();
      const byPlateName = new Map<string, FavoriteItem>();
      const byValue = new Map<string, FavoriteItem>();
      for (const favorite of this._favorites) {
        const plateKey = normalizePlateValue(favorite.license_plate);
        if (plateKey) {
          byPlate.set(plateKey, favorite);
          const nameKey = normalizeMatchValue(favorite.name);
          if (nameKey) {
            byPlateName.set(`${plateKey}|${nameKey}`, favorite);
          }
        }
        const valueKey = normalizeMatchValue(
          favorite.license_plate || favorite.id,
        );
        if (valueKey) {
          byValue.set(valueKey, favorite);
        }
      }
      this._favoritesByPlate = byPlate;
      this._favoritesByPlateName = byPlateName;
      this._favoritesByValue = byValue;
    }

    _findFavorite(license: string, name: string): FavoriteItem | null {
      const licenseKey = normalizePlateValue(license);
      const nameKey = normalizeMatchValue(name);
      if (!licenseKey) {
        return null;
      }
      if (!nameKey) {
        return this._favoritesByPlate.get(licenseKey) ?? null;
      }
      return this._favoritesByPlateName.get(`${licenseKey}|${nameKey}`) ?? null;
    }

    _findFavoriteByValue(value?: string | null): FavoriteItem | null {
      const favoriteValue = normalizeMatchValue(value);
      if (!favoriteValue) {
        return null;
      }
      if (favoriteValue === normalizeMatchValue(FAVORITE_PLACEHOLDER_VALUE)) {
        return null;
      }
      return this._favoritesByValue.get(favoriteValue) ?? null;
    }

    _normalizeZoneStatus(
      payload: ZoneStatusResponse | null | undefined,
    ): ZoneStatus {
      const rawState = payload?.state;
      const state =
        rawState === "chargeable" || rawState === "free" ? rawState : null;
      const rawKind = payload?.window_kind;
      const kind = rawKind === "current" || rawKind === "next" ? rawKind : null;
      const rawStart = payload?.window_start;
      const rawEnd = payload?.window_end;
      const start = typeof rawStart === "string" && rawStart ? rawStart : null;
      const end = typeof rawEnd === "string" && rawEnd ? rawEnd : null;
      return {
        state: state,
        kind: kind,
        start: kind ? start : null,
        end: kind ? end : null,
      };
    }

    _selectedFavoriteMatchesLicense(
      favorite: FavoriteItem,
      license: string,
    ): boolean {
      const favoriteLicense = normalizePlateValue(
        favorite.license_plate || favorite.id,
      );
      const licenseKey = normalizePlateValue(license);
      return Boolean(favoriteLicense) && favoriteLicense === licenseKey;
    }

    _addFavorite(license: string, name: string): void {
      if (!this._hass || !this._deviceId || !license) {
        return;
      }
      this._favoritesLoadedFor = null;
      this._favoritesError = null;
      this._hass.callService(DOMAIN, "add_favorite", {
        device_id: this._deviceId,
        license_plate: license,
        ...(name ? { name } : {}),
      });
      this._maybeLoadFavorites();
    }

    async _removeFavorite(favoriteId: string): Promise<void> {
      if (!this._hass || !this._deviceId || !favoriteId) {
        return;
      }
      if (this._favoriteRemoveInFlight) {
        return;
      }
      this._favoriteRemoveInFlight = true;
      this._pendingRemoveFavoriteId = favoriteId;
      this._setStatus(
        this._localize("message.removing_favorite"),
        "info",
        5000,
      );
      this._requestRender();
      this._favoritesLoadedFor = null;
      this._favoritesError = null;
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
      if (!this._hass) {
        return;
      }
      if (!this._deviceId) {
        this._setStatus(
          this._localize("message.select_permit_before_start"),
          "warning",
        );
        this._requestRender();
        return;
      }
      if (this._startInFlight) {
        return;
      }
      this._startInFlight = true;
      this._requestRender();

      const license = this._getInputValue("licensePlate").trim();
      if (!license) {
        this._setStatus(
          this._localize("message.license_plate_required"),
          "warning",
        );
        this._startInFlight = false;
        this._requestRender();
        return;
      }

      const { start, end } = this._resolveTimes();
      if (!start || !end) {
        this._setStatus(
          this._localize("message.start_end_required"),
          "warning",
        );
        this._startInFlight = false;
        this._requestRender();
        return;
      }
      if (end <= start) {
        this._setStatus(this._localize("message.end_before_start"), "warning");
        this._startInFlight = false;
        this._requestRender();
        return;
      }

      const name = this._getInputValue("visitorName").trim();
      const { showAddFavorite } = this._getFavoriteActionState();
      if (this._addFavoriteChecked && showAddFavorite) {
        this._addFavorite(license, name);
        this._addFavoriteChecked = false;
      }

      try {
        await this._hass.callService(DOMAIN, "start_reservation", {
          device_id: this._deviceId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          license_plate: license,
        });
      } catch (err: unknown) {
        this._setStatus(
          this._errorMessage(err, "message.reservation_start_failed"),
          "warning",
        );
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
          detail: { device_id: this._deviceId },
        }),
      );
    }

    _setStatus(message: string, type: StatusType, clearAfterMs?: number): void {
      setStatusState(
        this._statusState,
        message,
        type,
        () => this._requestRender(),
        clearAfterMs,
      );
    }

    _clearStatus(): void {
      clearStatusState(this._statusState, () => this._requestRender());
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
      }, 1200);
    }

    _resolveTimes(): { start: Date | null; end: Date | null } {
      const now = new Date();
      if (!this._config) {
        return { start: null, end: null };
      }
      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const fallbackStart = new Date(now.getTime() + 60 * 1000);
      const useSplitDateTime = this._useSplitDateTime();
      let start = fallbackStart;
      let end = new Date(start.getTime() + 60 * 60 * 1000);
      if (useSplitDateTime) {
        const startDateValue = showStart
          ? this._getInputValue("startDate")
          : "";
        const startTimeValue = showStart
          ? this._getInputValue("startTime")
          : "";
        const endDateValue = showEnd ? this._getInputValue("endDate") : "";
        const endTimeValue = showEnd ? this._getInputValue("endTime") : "";
        start = this._parseDateTime(
          startDateValue,
          startTimeValue,
          fallbackStart,
        );
        const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
        end = this._parseDateTime(endDateValue, endTimeValue, fallbackEnd);
      } else {
        const startValue = showStart
          ? this._getInputValue("startDateTime")
          : "";
        const endValue = showEnd ? this._getInputValue("endDateTime") : "";
        start = startValue ? new Date(startValue) : fallbackStart;
        const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
        end = endValue ? new Date(endValue) : fallbackEnd;
      }

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { start: null, end: null };
      }
      return { start, end };
    }

    _parseDateTime(dateValue: string, timeValue: string, fallback: Date): Date {
      if (!dateValue || !timeValue) {
        return fallback;
      }
      const normalizedTime = normalizeTimeValue(timeValue);
      return new Date(`${dateValue}T${normalizedTime}`);
    }

    _getInputValue(id: string): string {
      return this._formValues[id] ?? "";
    }

    _getValueFromEvent(
      event: Event,
      ids: Set<string>,
    ): { id: string; value: string } | null {
      const path = event.composedPath();
      const element = path.find(
        (node): node is ValueElement =>
          node instanceof HTMLElement && ids.has(node.id),
      );
      if (!element) {
        return null;
      }
      const customEvent = event as CustomEvent<{ value?: string | null }>;
      if (typeof customEvent.detail?.value === "string") {
        return { id: element.id, value: customEvent.detail.value };
      }
      const inputElement = path.find(
        (node): node is HTMLInputElement | HTMLTextAreaElement =>
          node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement,
      );
      const value = inputElement?.value ?? element.value ?? "";
      return { id: element.id, value };
    }

    _setInputValue(id: string, value: string): void {
      const safeValue = value ?? "";
      if (this._formValues[id] === safeValue) {
        return;
      }
      this._formValues[id] = safeValue;
      this._requestRender();
    }

    _syncEndWithStart(useSplitDateTime: boolean): void {
      if (!this._config?.show_end_time) {
        return;
      }
      const offsetMs = 60 * 1000;
      if (useSplitDateTime) {
        const startDateValue = this._getInputValue("startDate");
        const startTimeValue = this._getInputValue("startTime");
        if (!startDateValue || !startTimeValue) {
          return;
        }
        const start = new Date(
          `${startDateValue}T${normalizeTimeValue(startTimeValue)}`,
        );
        if (Number.isNaN(start.getTime())) {
          return;
        }
        const end = this._resolveDefaultEnd(start, offsetMs);
        this._setInputValue("endDate", formatDate(end));
        this._setInputValue("endTime", formatTime(end));
        return;
      }
      const startValue = this._getInputValue("startDateTime");
      if (!startValue) {
        return;
      }
      const start = new Date(startValue);
      if (Number.isNaN(start.getTime())) {
        return;
      }
      const end = this._resolveDefaultEnd(start, offsetMs);
      this._setInputValue("endDateTime", formatDateTimeLocal(end));
    }

    _getStatusDefaultTimes(now: Date): { start: Date; end: Date } {
      const startDefault = new Date(now.getTime() + 60 * 1000);
      const endDefault = new Date(now);
      endDefault.setHours(23, 59, 0, 0);
      const window = this._getRelevantWindowTimes();
      if (this._zoneState === "chargeable") {
        if (window) {
          return { start: startDefault, end: window.end };
        }
        return { start: startDefault, end: endDefault };
      }
      if (this._zoneState === "free") {
        if (window) {
          return { start: window.start, end: window.end };
        }
        return { start: startDefault, end: endDefault };
      }
      return { start: startDefault, end: endDefault };
    }

    _getRelevantWindowTimes(): { start: Date; end: Date } | null {
      if (this._zoneState === "chargeable" && this._windowKind !== "current") {
        return null;
      }
      if (this._zoneState === "free" && this._windowKind !== "next") {
        return null;
      }
      if (this._zoneState !== "chargeable" && this._zoneState !== "free") {
        return null;
      }
      const start = this._parseIsoDate(this._windowStartIso);
      const end = this._parseIsoDate(this._windowEndIso);
      if (!start || !end || end <= start) {
        return null;
      }
      return { start, end };
    }

    _parseIsoDate(value: string | null): Date | null {
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    }

    _resolveDefaultEnd(start: Date, offsetMs: number): Date {
      const window = this._getRelevantWindowTimes();
      if (window && window.end > start) {
        return window.end;
      }
      const fallback = new Date(start.getTime() + offsetMs);
      if (!window) {
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 59, 0, 0);
        return dayEnd > start ? dayEnd : fallback;
      }
      return fallback;
    }

    _applyStatusDefaultsToForm(force = false): void {
      if (!this._config) {
        return;
      }
      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const useSplitDateTime = this._useSplitDateTime();
      const now = new Date();
      const defaults = this._getStatusDefaultTimes(now);
      const minStart = new Date(now.getTime() + 60 * 1000);
      if (useSplitDateTime) {
        if (showStart) {
          if (force) {
            this._setInputValue("startDate", formatDate(defaults.start));
            this._setInputValue("startTime", formatTime(defaults.start));
          } else {
            const startDateValue = this._getInputValue("startDate");
            const startTimeValue = this._getInputValue("startTime");
            if (!startDateValue || !startTimeValue) {
              if (!startDateValue) {
                this._setInputValue("startDate", formatDate(defaults.start));
              }
              if (!startTimeValue) {
                this._setInputValue("startTime", formatTime(defaults.start));
              }
            } else {
              const start = new Date(
                `${startDateValue}T${normalizeTimeValue(startTimeValue)}`,
              );
              if (Number.isNaN(start.getTime())) {
                this._setInputValue("startDate", formatDate(defaults.start));
                this._setInputValue("startTime", formatTime(defaults.start));
              } else if (start <= now) {
                this._setInputValue("startDate", formatDate(minStart));
                this._setInputValue("startTime", formatTime(minStart));
              }
            }
          }
        }
        if (showEnd) {
          if (force) {
            this._setInputValue("endDate", formatDate(defaults.end));
            this._setInputValue("endTime", formatTime(defaults.end));
          } else {
            if (!this._getInputValue("endDate")) {
              this._setInputValue("endDate", formatDate(defaults.end));
            }
            if (!this._getInputValue("endTime")) {
              this._setInputValue("endTime", formatTime(defaults.end));
            }
          }
        }
        return;
      }
      if (showStart) {
        if (force) {
          this._setInputValue(
            "startDateTime",
            formatDateTimeLocal(defaults.start),
          );
        } else {
          const startValue = this._getInputValue("startDateTime");
          if (!startValue) {
            this._setInputValue(
              "startDateTime",
              formatDateTimeLocal(defaults.start),
            );
          } else {
            const start = new Date(startValue);
            if (Number.isNaN(start.getTime())) {
              this._setInputValue(
                "startDateTime",
                formatDateTimeLocal(defaults.start),
              );
            } else if (start <= now) {
              this._setInputValue(
                "startDateTime",
                formatDateTimeLocal(minStart),
              );
            }
          }
        }
      }
      if (showEnd) {
        if (force || !this._getInputValue("endDateTime")) {
          this._setInputValue("endDateTime", formatDateTimeLocal(defaults.end));
        }
      }
    }

    async _applyFavoriteSelection(plate: string, name: string): Promise<void> {
      this._setInputValue("visitorName", name);
      this._setInputValue("licensePlate", plate);
      await this.updateComplete;
      this._scheduleFavoriteActionsUpdate();
    }

    _getActiveEntryId(): string | null {
      return this._config?.config_entry_id || this._selectedEntryId;
    }

    _useSplitDateTime(): boolean {
      const supportsSplit = Boolean(
        customElements.get("ha-date-input") &&
        customElements.get("ha-time-input"),
      );
      if (this._splitDateTimeSupport === null || supportsSplit) {
        this._splitDateTimeSupport = supportsSplit;
      }
      return this._splitDateTimeSupport;
    }

    _getTranslationLanguage(hass: HomeAssistant | null): string {
      const hassLanguage =
        typeof hass?.language === "string" ? hass.language : undefined;
      const localeLanguage =
        hass && typeof hass.locale === "object" && hass.locale
          ? (hass.locale as { language?: unknown }).language
          : undefined;
      const normalizedLocaleLanguage =
        typeof localeLanguage === "string" ? localeLanguage : undefined;
      return (
        hassLanguage || normalizedLocaleLanguage || navigator.language || "en"
      );
    }

    _isInEditor(): boolean {
      return isInEditor(this);
    }
  }

  const registerCard = (): void => {
    registerCustomCard(
      CARD_TYPE,
      CityVisitorParkingNewReservationCard,
      getCardText("name"),
      getCardText("description"),
    );
  };
  const getHassLanguage = (
    hass: HomeAssistant | null | undefined,
  ): string | undefined => {
    const hassLanguage =
      typeof hass?.language === "string" ? hass.language : undefined;
    const localeLanguage =
      hass && typeof hass.locale === "object" && hass.locale
        ? (hass.locale as { language?: unknown }).language
        : undefined;
    return (
      hassLanguage ||
      (typeof localeLanguage === "string" ? localeLanguage : undefined)
    );
  };
  const registerCardWithTranslations = (attempt = 0): void => {
    const hass = getGlobalHass<HomeAssistant>();
    void ensureTranslations(hass).then(registerCard);
    if (!getHassLanguage(hass) && attempt < 20) {
      window.setTimeout(() => registerCardWithTranslations(attempt + 1), 500);
    }
  };
  registerCardWithTranslations();
})();
