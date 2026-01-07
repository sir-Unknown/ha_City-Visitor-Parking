import { getCardConfigForm } from "./city-visitor-parking-card-editor";

(() => {
  const DOMAIN = "city_visitor_parking";
  const CARD_TYPE = "city-visitor-parking-card";
  const WS_LIST_FAVORITES = "city_visitor_parking/favorites";
  const FAVORITE_PLACEHOLDER_VALUE = "__favorite_placeholder__";
  const TRANSLATION_SECTION = "card";
  const TRANSLATION_PREFIX = `component.${DOMAIN}.${TRANSLATION_SECTION}`;
  const DEFAULT_STRINGS: Record<string, string> = {
    "field.permit": "Permit",
    "field.favorite": "Favorite",
    "field.name": "Name",
    "field.license_plate": "License plate",
    "field.start_date": "Start date",
    "field.start_time": "Start time",
    "field.end_date": "End date",
    "field.end_time": "End time",
    "action.add_favorite": "Add favorite",
    "action.remove_favorite": "Remove favorite",
    "action.start_reservation": "Start reservation",
    "message.select_favorite": "Select a favorite",
    "message.loading_favorites": "Loading favorites",
    "message.no_device_for_permit": "No device found for the selected permit.",
    "message.load_favorites_failed": "Could not load favorites",
    "message.removing_favorite": "Removing favorite...",
    "message.favorite_removed": "Favorite removed.",
    "message.favorite_remove_failed": "Could not remove favorite.",
    "message.select_permit_before_start":
      "Select a permit before starting a reservation.",
    "message.license_plate_required": "License plate is required.",
    "message.start_end_required": "Start and end time are required.",
    "message.end_before_start": "End time must be after start time.",
    "message.reservation_requested": "Reservation requested.",
    "message.reservation_start_failed": "Could not start reservation.",
    "message.reservation_updated": "Reservation updated.",
    "message.reservation_update_failed": "Could not update reservation.",
    "message.reservation_ended": "Reservation ended.",
    "message.reservation_end_failed": "Could not end reservation.",
    "placeholder.license_plate": "AA-123-B",
  };

  type HomeAssistant = {
    callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
    callService: <T = unknown>(
      domain: string,
      service: string,
      data: Record<string, unknown>
    ) => Promise<T>;
    localize?: (key: string, ...args: Array<string | number>) => string;
    loadBackendTranslation?: (
      section: string,
      domain?: string
    ) => Promise<unknown>;
    locale?: Record<string, unknown>;
    themes?: {
      themes?: Record<string, Record<string, string>>;
    };
  };
  type DeviceEntry = {
    id: string;
    identifiers?: Array<[string, string]>;
    config_entries?: string[];
  };
  type FavoriteItem = {
    id?: string;
    license_plate?: string;
    name?: string;
    [key: string]: unknown;
  };
  type CardConfig = {
    type: string;
    title?: string;
    icon?: string;
    theme?: string;
    show_reservation_form?: boolean;
    show_favorites?: boolean;
    show_start_time?: boolean;
    show_end_time?: boolean;
    config_entry_id?: string;
    device_id?: string;
  };
  type ValueElement = HTMLElement & {
    value?: string;
    updateComplete?: Promise<unknown>;
  };
  type CheckedElement = HTMLElement & { checked: boolean; disabled?: boolean };
  type DisabledElement = HTMLElement & { disabled?: boolean };
  type SelectorElement = HTMLElement & {
    hass?: HomeAssistant;
    selector?: Record<string, unknown>;
    value?: string | null;
    label?: string;
    disabled?: boolean;
  };
  type DateInputElement = HTMLElement & {
    value?: string;
    label?: string;
    disabled?: boolean;
    locale?: Record<string, unknown>;
  };
  type TimeInputElement = HTMLElement & {
    value?: string;
    label?: string;
    disabled?: boolean;
    locale?: Record<string, unknown>;
  };
  type DateTimeInputElement = HTMLElement & {
    value?: string;
    disabled?: boolean;
    updateComplete?: Promise<unknown>;
  };

  const CONFIG_ENTRY_SELECTOR = {
    config_entry: { integration: DOMAIN },
  };

  const pad = (value: number | string): string => String(value).padStart(2, "0");
  const formatDate = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const formatTime = (date: Date): string =>
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const formatDateTimeLocal = (date: Date): string =>
    `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const normalizeTimeValue = (value: string): string =>
    value.length === 5 ? `${value}:00` : value;
  const normalizeMatchValue = (value: string | undefined | null): string =>
    String(value ?? "").trim().toLowerCase();
  const normalizePlateValue = (value: string | undefined | null): string =>
    normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");

  class CityVisitorParkingNewReservationCard extends HTMLElement {
    _config: CardConfig | null;
    _hass: HomeAssistant | null;
    _deviceId: string | null;
    _deviceEntryId: string | null;
    _deviceLoadPromise: Promise<void> | null;
    _favorites: FavoriteItem[];
    _favoritesError: string | null;
    _favoritesLoadedFor: string | null;
    _favoritesLoading: boolean;
    _favoritesByPlate: Map<string, FavoriteItem>;
    _favoritesByPlateName: Map<string, FavoriteItem>;
    _favoritesByValue: Map<string, FavoriteItem>;
    _translationsPromise: Promise<unknown> | null;
    _pendingRemoveFavoriteId: string | null;
    _selectedEntryId: string | null;
    _startButtonSuccess: boolean;
    _startButtonSuccessTimeout: number | null;
    _startInFlight: boolean;
    _favoriteRemoveInFlight: boolean;
    _payWindowEndEntityId: string | null;
    _payWindowEndEntityDeviceId: string | null;
    _status: string;
    _statusType: "info" | "warning" | "success";
    _appliedThemeVariables: string[];
    _appliedThemeName: string | null;
    _renderHandle: number | null;
    _favoriteActionsHandle: number | null;
    _localizeEscapedFn: (key: string, ...args: Array<string | number>) => string;
    _splitDateTimeSupport: boolean | null;
    _lastLocaleRef: Record<string, unknown> | null;
    _lastThemeName: string | null;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = null;
      this._hass = null;
      this._deviceId = null;
      this._deviceEntryId = null;
      this._deviceLoadPromise = null;
      this._favorites = [];
      this._favoritesError = null;
      this._favoritesLoadedFor = null;
      this._favoritesLoading = false;
      this._favoritesByPlate = new Map();
      this._favoritesByPlateName = new Map();
      this._favoritesByValue = new Map();
      this._translationsPromise = null;
      this._pendingRemoveFavoriteId = null;
      this._selectedEntryId = null;
      this._startButtonSuccess = false;
      this._startButtonSuccessTimeout = null;
      this._startInFlight = false;
      this._favoriteRemoveInFlight = false;
      this._payWindowEndEntityId = null;
      this._payWindowEndEntityDeviceId = null;
      this._status = "";
      this._statusType = "info";
      this._appliedThemeVariables = [];
      this._appliedThemeName = null;
      this._renderHandle = null;
      this._favoriteActionsHandle = null;
      this._localizeEscapedFn = (key: string, ...args: Array<string | number>) =>
        this._escape(this._localize(key, ...args));
      this._splitDateTimeSupport = null;
      this._lastLocaleRef = null;
      this._lastThemeName = null;
    }

    static getConfigForm(): {
      readonly schema: ReadonlyArray<Record<string, unknown>>;
    } {
      return getCardConfigForm();
    }

    static getStubConfig(): CardConfig {
      return {
        type: `custom:${CARD_TYPE}`,
        show_reservation_form: true,
        show_favorites: true,
        show_start_time: true,
        show_end_time: true,
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw new Error("Invalid card config");
      }
      const priorEntryId = this._getActiveEntryId();
      this._config = {
        show_reservation_form: config.show_reservation_form !== false,
        show_favorites: config.show_favorites !== false,
        show_start_time: config.show_start_time !== false,
        show_end_time: config.show_end_time !== false,
        ...config,
      };
      if (this._config.theme !== this._lastThemeName) {
        this._lastThemeName = this._config.theme ?? null;
        this._applyTheme();
      }
      if (this._config.config_entry_id) {
        this._selectedEntryId = null;
      }
      const entryChanged = this._getActiveEntryId() !== priorEntryId;
      void this._ensureTranslations();
      if (this._config.device_id) {
        this._deviceId = this._config.device_id;
          this._deviceEntryId = this._config.config_entry_id || null;
          this._resetPayWindowEndCache();
        if (entryChanged) {
          this._favorites = [];
          this._favoritesLoadedFor = null;
          this._rebuildFavoriteIndex();
        }
      } else if (entryChanged) {
        this._deviceId = null;
        this._deviceEntryId = null;
        this._resetPayWindowEndCache();
        this._favorites = [];
        this._favoritesLoadedFor = null;
        this._rebuildFavoriteIndex();
      }
      this._requestRender();
      this._ensureDeviceId();
      void this._loadData();
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      void this._ensureTranslations();
      if ((this._config?.theme ?? null) !== this._lastThemeName) {
        this._lastThemeName = this._config?.theme ?? null;
        this._applyTheme();
      }
      this._requestRender();
      this._ensureDeviceId();
      void this._loadData();
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
        this._resetPayWindowEndCache();
        return;
      }
      if (this._deviceEntryId === entryId && this._deviceId) {
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
              (identifier: [string, string]) => identifier[0] === DOMAIN
            );
            const hasEntry = Array.isArray(device.config_entries)
              ? device.config_entries.includes(entryId)
              : false;
            return hasDomain && hasEntry;
          });
          this._deviceId = match ? match.id : null;
          this._deviceEntryId = entryId;
          this._resetPayWindowEndCache();
        })
        .catch(() => {
          this._deviceId = null;
          this._deviceEntryId = entryId;
          this._resetPayWindowEndCache();
        })
        .finally(() => {
          this._deviceLoadPromise = null;
          this._requestRender();
        });
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
      const entryId = this._getActiveEntryId();
      if (!entryId || this._favoritesLoadedFor === entryId) {
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
        this._favorites = Array.isArray(result?.favorites) ? result.favorites : [];
        this._rebuildFavoriteIndex();
      } catch (err: unknown) {
        this._favorites = [];
        this._rebuildFavoriteIndex();
        this._favoritesError = this._localize("message.load_favorites_failed");
      } finally {
        this._favoritesLoading = false;
        if (this._pendingRemoveFavoriteId) {
          const pendingId = normalizeMatchValue(this._pendingRemoveFavoriteId);
          const stillPresent = this._favorites.some((favorite: FavoriteItem) => {
            const candidate = normalizeMatchValue(
              favorite.id || favorite.license_plate
            );
            return candidate === pendingId;
          });
      if (this._favoritesError || stillPresent) {
        this._status = this._localize("message.favorite_remove_failed");
        this._statusType = "warning";
      } else {
        this._status = this._localize("message.favorite_removed");
        this._statusType = "success";
        this._setInputValue("visitorName", "");
        this._setInputValue("licensePlate", "");
        this._setInputValue("favorite", FAVORITE_PLACEHOLDER_VALUE);
      }
      this._pendingRemoveFavoriteId = null;
    }
        this._requestRender();
      }
    }

    _requestRender(): void {
      if (this._renderHandle !== null) {
        return;
      }
      this._renderHandle = window.requestAnimationFrame(() => {
        this._renderHandle = null;
        this._render();
      });
    }

    _render(): void {
      if (!this.shadowRoot || !this._config) {
        return;
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
      const favoriteValue =
        priorFavorite && priorFavorite !== FAVORITE_PLACEHOLDER_VALUE
          ? priorFavorite
          : FAVORITE_PLACEHOLDER_VALUE;

      const title = this._config.title || "";
      const icon = this._config.icon;
      const showHeader = Boolean(title || icon);
      const showFavorites = this._config.show_favorites;
      const showReservationForm = this._config.show_reservation_form;
      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const activeEntryId = this._getActiveEntryId();
      const showPermitPicker = !this._config.config_entry_id;
      const hasTarget = Boolean(activeEntryId);
      const hasDevice = Boolean(this._deviceId);
      const useSplitDateTime = this._useSplitDateTime();
      const controlsDisabled = this._isInEditor();
      const localize = this._localizeEscapedFn;
      const currentLicense = priorLicense.trim();
      const currentVisitorName = priorVisitorName.trim();
      const selectedFavorite = showFavorites
        ? this._findFavoriteByValue(priorFavorite)
        : null;
      const selectedFavoriteMatchesLicense = selectedFavorite
        ? this._selectedFavoriteMatchesLicense(selectedFavorite, currentLicense)
        : false;
      const matchingFavorite = showFavorites
        ? this._findFavorite(currentLicense, currentVisitorName)
        : null;
      const canManageFavorites =
        !controlsDisabled && !this._favoritesLoading && Boolean(this._deviceId);
      const showAddFavorite =
        canManageFavorites
        && currentLicense
        && currentVisitorName
        && !matchingFavorite
        && !selectedFavoriteMatchesLicense;
      const showRemoveFavorite =
        canManageFavorites
        && Boolean(selectedFavorite?.id || selectedFavorite?.license_plate)
        && selectedFavoriteMatchesLicense;
      const favoriteRemoveDisabled = controlsDisabled || this._favoriteRemoveInFlight;
      if (controlsDisabled) {
        this.setAttribute("data-preview", "true");
      } else {
        this.removeAttribute("data-preview");
      }

      const favoritesOptions = (this._favorites || [])
        .map((favorite: FavoriteItem) => {
          const value = favorite.license_plate || favorite.id || "";
          const label = favorite.name || favorite.license_plate || favorite.id || "";
          return `<mwc-list-item value="${this._escape(value)}">${this._escape(
            label
          )}</mwc-list-item>`;
        })
        .join("");

      const reservationFormSection = showReservationForm
        ? `
          ${hasTarget && !hasDevice ? `
            <ha-alert alert-type="warning">${localize(
              "message.no_device_for_permit"
            )}</ha-alert>
          ` : ""}
          ${showPermitPicker ? `
            <div class="row">
              <ha-selector id="permitSelect" label="${localize(
                "field.permit"
              )}"></ha-selector>
            </div>
          ` : ""}
          ${showFavorites ? `
            <div class="row">
              <ha-select id="favorite" label="${localize("field.favorite")}" ${
                controlsDisabled || this._favoritesLoading ? "disabled" : ""
              }>
                  <mwc-list-item value="${FAVORITE_PLACEHOLDER_VALUE}">
                    ${localize("message.select_favorite")}
                  </mwc-list-item>
                ${favoritesOptions}
              </ha-select>
              ${this._favoritesError ? `
                <ha-alert alert-type="warning">${this._escape(
                  this._favoritesError
                )}</ha-alert>
              ` : ""}
            </div>
          ` : ""}
          ${showFavorites && this._favoritesLoading ? `
            <div class="row spinner">
              <ha-spinner size="small"></ha-spinner>
              <span>${localize("message.loading_favorites")}</span>
            </div>
          ` : ""}
          <div class="row">
            <ha-textfield id="visitorName" label="${localize("field.name")}"></ha-textfield>
          </div>
          <div class="row">
            <ha-textfield
              id="licensePlate"
              label="${localize("field.license_plate")}"
              placeholder="${localize("placeholder.license_plate")}"
            ></ha-textfield>
          </div>
          ${showStart ? (
            useSplitDateTime
              ? `
                <div class="row">
                  <ha-date-input id="startDate" label="${localize(
                    "field.start_date"
                  )}"></ha-date-input>
                </div>
                <div class="row">
                  <ha-time-input id="startTime" label="${localize(
                    "field.start_time"
                  )}"></ha-time-input>
                </div>
              `
              : `
                <div class="row">
                  <ha-textfield
                    id="startDateTime"
                    label="${localize("field.start_time")}"
                    type="datetime-local"
                  ></ha-textfield>
                </div>
              `
          ) : ""}
          ${showEnd ? (
            useSplitDateTime
              ? `
                <div class="row">
                  <ha-date-input id="endDate" label="${localize(
                    "field.end_date"
                  )}"></ha-date-input>
                </div>
                <div class="row">
                  <ha-time-input id="endTime" label="${localize(
                    "field.end_time"
                  )}"></ha-time-input>
                </div>
              `
              : `
                <div class="row">
                  <ha-textfield
                    id="endDateTime"
                    label="${localize("field.end_time")}"
                    type="datetime-local"
                  ></ha-textfield>
                </div>
              `
          ) : ""}
          <div class="row actions">
            <div class="favorite-actions">
              ${showFavorites ? `
                <ha-formfield
                  id="addFavoriteWrap"
                  label="${localize("action.add_favorite")}"
                  ${showAddFavorite ? "" : "hidden"}
                  style="${showAddFavorite ? "" : "display: none;"}"
                >
                  <ha-checkbox
                    id="addFavorite"
                  ></ha-checkbox>
                </ha-formfield>
                <div
                  id="removeFavoriteWrap"
                  class="remove-favorite"
                  ${showRemoveFavorite ? "" : "hidden"}
                  style="${showRemoveFavorite ? "" : "display: none;"}"
                >
                  <ha-icon-button
                    id="removeFavorite"
                    title="${localize("action.remove_favorite")}"
                    aria-label="${localize("action.remove_favorite")}"
                    data-favorite-id="${this._escape(selectedFavorite?.id)}"
                    ${favoriteRemoveDisabled ? "disabled" : ""}
                  >
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </ha-icon-button>
                  <span>${localize("action.remove_favorite")}</span>
                </div>
              ` : ""}
            </div>
            <ha-button
              id="startReservation"
              class="start-button${this._startButtonSuccess ? " success" : ""}"
              ${controlsDisabled ? "disabled" : ""}
            >
              ${localize("action.start_reservation")}
            </ha-button>
          </div>
        `
        : "";

      this.shadowRoot.innerHTML = `
        <style>
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
            gap: var(--entities-card-row-gap, var(--card-row-gap, 8px));
          }
          ha-textfield,
          ha-select,
          ha-selector,
          ha-date-input,
          ha-time-input {
            width: 100%;
          }
          .actions {
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: space-between;
          }
          .favorite-actions {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .remove-favorite {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .remove-favorite span {
            pointer-events: none;
            line-height: 1;
          }
          .start-button {
            margin-left: auto;
          }
          .start-button.success {
            --mdc-theme-primary: var(--success-color, #21b365);
            --mdc-theme-on-primary: var(--text-primary-color, #fff);
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
            padding: 0 18px 0 8px;
          }
          ha-alert {
            margin: 0;
          }
          .spinner {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--secondary-text-color);
            font-size: 0.85rem;
          }
        </style>
        <ha-card>
          ${
            showHeader
              ? `<h1 class="card-header"><div class="name">${
                  icon
                    ? `<ha-icon class="icon" icon="${this._escape(icon)}"></ha-icon>`
                    : ""
                }${this._escape(title)}</div></h1>`
              : ""
          }
          <div class="card-content">
            ${reservationFormSection}
            ${this._status ? `
              <ha-alert alert-type="${this._statusType}">${this._escape(
                this._status
              )}</ha-alert>
            ` : ""}
          </div>
        </ha-card>
      `;

      this._setInputValue("licensePlate", priorLicense);
      this._setInputValue("startDate", priorStartDate);
      this._setInputValue("startTime", priorStartTime);
      this._setInputValue("endDate", priorEndDate);
      this._setInputValue("endTime", priorEndTime);
      this._setInputValue("startDateTime", priorStartDateTime);
      this._setInputValue("endDateTime", priorEndDateTime);
      this._setInputValue("visitorName", priorVisitorName);
      this._setInputValue("favorite", favoriteValue);

      const permitSelect = this.shadowRoot.querySelector<SelectorElement>(
        "#permitSelect"
      );
      if (permitSelect && this._hass) {
        permitSelect.hass = this._hass;
        if (showPermitPicker) {
          permitSelect.selector = CONFIG_ENTRY_SELECTOR;
        }
        permitSelect.label = this._localize("field.permit");
        permitSelect.value = activeEntryId ?? null;
          const onPermitChange = (event: Event) => {
            const detail = (event as CustomEvent<{ value?: string | null }>).detail;
          const value = detail?.value ?? "";
          if (!value) {
            this._selectedEntryId = null;
            this._deviceId = null;
            this._deviceEntryId = null;
            this._favorites = [];
            this._favoritesLoadedFor = null;
            this._rebuildFavoriteIndex();
            this._status = "";
            this._statusType = "info";
            this._requestRender();
            return;
          }
          if (
            value === this._selectedEntryId
            && this._deviceEntryId === value
            && this._deviceId
          ) {
            return;
          }
          this._selectedEntryId = value;
          this._deviceId = null;
          this._deviceEntryId = null;
          this._favorites = [];
          this._favoritesLoadedFor = null;
          this._rebuildFavoriteIndex();
          this._status = "";
          this._statusType = "info";
          this._requestRender();
          this._ensureDeviceId();
          this._maybeLoadFavorites();
        };
        permitSelect.addEventListener("value-changed", onPermitChange);
      }

      const favoriteSelectElement = this.shadowRoot.querySelector<DisabledElement>(
        "#favorite"
      );
      if (favoriteSelectElement) {
        favoriteSelectElement.disabled =
          controlsDisabled || this._favoritesLoading;
      }

      const now = new Date();
      const startDefault = new Date(now.getTime() + 60 * 1000);
      const endDefault = new Date(startDefault.getTime() + 60 * 60 * 1000);
      if (useSplitDateTime) {
        const startDateInput =
          this.shadowRoot.querySelector<DateInputElement>("#startDate");
        const startTimeInput =
          this.shadowRoot.querySelector<TimeInputElement>("#startTime");
        const endDateInput =
          this.shadowRoot.querySelector<DateInputElement>("#endDate");
        const endTimeInput =
          this.shadowRoot.querySelector<TimeInputElement>("#endTime");
        if (this._hass?.locale && this._hass.locale !== this._lastLocaleRef) {
          if (startDateInput) {
            startDateInput.locale = this._hass.locale;
          }
          if (startTimeInput) {
            startTimeInput.locale = this._hass.locale;
          }
          if (endDateInput) {
            endDateInput.locale = this._hass.locale;
          }
          if (endTimeInput) {
            endTimeInput.locale = this._hass.locale;
          }
          this._lastLocaleRef = this._hass.locale;
        }
        if (showStart) {
          if (startDateInput && !startDateInput.value) {
            startDateInput.value = formatDate(startDefault);
          }
          if (startTimeInput && !startTimeInput.value) {
            startTimeInput.value = formatTime(startDefault);
          }
        }
        if (showEnd) {
          if (endDateInput && !endDateInput.value) {
            endDateInput.value = formatDate(endDefault);
          }
          if (endTimeInput && !endTimeInput.value) {
            endTimeInput.value = formatTime(endDefault);
          }
        }
        void this._applyEndDefaultFromPayWindow(true);
        if (showStart && showEnd) {
          const syncEnd = () => this._syncEndWithStart(true);
          startDateInput?.addEventListener("change", syncEnd);
          startDateInput?.addEventListener("value-changed", syncEnd);
          startTimeInput?.addEventListener("change", syncEnd);
          startTimeInput?.addEventListener("value-changed", syncEnd);
        }
      } else {
        const startDateTimeInput =
          this.shadowRoot.querySelector<DateTimeInputElement>("#startDateTime");
        const endDateTimeInput =
          this.shadowRoot.querySelector<DateTimeInputElement>("#endDateTime");
        if (showStart && startDateTimeInput && !startDateTimeInput.value) {
          this._setElementValue(
            startDateTimeInput,
            formatDateTimeLocal(startDefault)
          );
        }
        if (showEnd && endDateTimeInput && !endDateTimeInput.value) {
          this._setElementValue(
            endDateTimeInput,
            formatDateTimeLocal(endDefault)
          );
        }
        void this._applyEndDefaultFromPayWindow(false);
        if (showStart && showEnd && startDateTimeInput) {
          startDateTimeInput.addEventListener("change", () =>
            this._syncEndWithStart(false)
          );
          startDateTimeInput.addEventListener("input", () =>
            this._syncEndWithStart(false)
          );
        }
      }

      if (!controlsDisabled) {
        const favoriteSelect = this.shadowRoot.querySelector<ValueElement>(
          "#favorite"
        );
        if (favoriteSelect) {
          const onFavoriteChange = () => {
            const plate = favoriteSelect.value;
            if (!plate || plate === FAVORITE_PLACEHOLDER_VALUE) {
              void this._applyFavoriteSelection("", "");
              return;
            }
            const favorite = this._favoritesByValue.get(
              normalizeMatchValue(plate)
            );
            void this._applyFavoriteSelection(plate, favorite?.name ?? "");
          };
          favoriteSelect.addEventListener("selected", onFavoriteChange);
        }
      }

      const licenseInput =
        this.shadowRoot.querySelector<ValueElement>("#licensePlate");
      if (licenseInput) {
        licenseInput.addEventListener("input", () =>
          this._scheduleFavoriteActionsUpdate()
        );
      }
      const nameInput =
        this.shadowRoot.querySelector<ValueElement>("#visitorName");
      if (nameInput) {
        nameInput.addEventListener("input", () =>
          this._scheduleFavoriteActionsUpdate()
        );
      }

      if (showFavorites && !controlsDisabled) {
        const addFavorite =
          this.shadowRoot.querySelector<CheckedElement>("#addFavorite");
        if (addFavorite) {
          addFavorite.addEventListener("change", () => {
            this._scheduleFavoriteActionsUpdate();
          });
        }
        const removeFavorite =
          this.shadowRoot.querySelector<DisabledElement>("#removeFavorite");
        if (removeFavorite) {
          removeFavorite.addEventListener("click", () => {
            const id = removeFavorite.getAttribute("data-favorite-id") ?? "";
            void this._removeFavorite(id);
          });
        }
      }

      if (!controlsDisabled) {
        const startButton = this.shadowRoot.querySelector<DisabledElement>(
          "#startReservation"
        );
        if (startButton) {
          startButton.addEventListener("click", () => void this._handleStart());
          if (!hasDevice) {
            startButton.disabled = true;
          }
          if (this._startInFlight) {
            startButton.disabled = true;
          }
        }
      }

      this._scheduleFavoriteActionsUpdate();
    }

    _scheduleFavoriteActionsUpdate(): void {
      if (this._favoriteActionsHandle !== null) {
        return;
      }
      this._favoriteActionsHandle = window.requestAnimationFrame(() => {
        this._favoriteActionsHandle = null;
        this._updateFavoriteActions();
      });
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
        const valueKey = normalizeMatchValue(favorite.license_plate || favorite.id);
        if (valueKey) {
          byValue.set(valueKey, favorite);
        }
      }
      this._favoritesByPlate = byPlate;
      this._favoritesByPlateName = byPlateName;
      this._favoritesByValue = byValue;
    }

    _findFavorite(
      license: string,
      name: string
    ): FavoriteItem | null {
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

    _selectedFavoriteMatchesLicense(
      favorite: FavoriteItem,
      license: string
    ): boolean {
      const favoriteLicense = normalizePlateValue(
        favorite.license_plate || favorite.id
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
      this._requestRender();
      this._pendingRemoveFavoriteId = favoriteId;
      this._status = this._localize("message.removing_favorite");
      this._statusType = "info";
      this._requestRender();
      this._favoritesLoadedFor = null;
      this._favoritesError = null;
      try {
        await this._hass.callService(DOMAIN, "remove_favorite", {
          device_id: this._deviceId,
          favorite_id: favoriteId,
        });
      } catch (err: unknown) {
        this._status = this._localize("message.favorite_remove_failed");
        this._statusType = "warning";
        this._pendingRemoveFavoriteId = null;
        this._favoriteRemoveInFlight = false;
        this._requestRender();
        return;
      }
      await this._maybeLoadFavorites();
      this._favoriteRemoveInFlight = false;
      this._requestRender();
    }

    _updateFavoriteActions(): void {
      if (!this.shadowRoot) {
        return;
      }
      const controlsDisabled = this._isInEditor();
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("visitorName").trim();
      const matchingFavorite = this._findFavorite(license, name);
      const selectedFavorite = this._findFavoriteByValue(
        this._getInputValue("favorite")
      );
      const selectedFavoriteMatchesLicense = selectedFavorite
        ? this._selectedFavoriteMatchesLicense(selectedFavorite, license)
        : false;
      const canManage =
        !controlsDisabled && !this._favoritesLoading && this._deviceId;
      const shouldShowAdd =
        canManage
        && license
        && name
        && !matchingFavorite
        && !selectedFavoriteMatchesLicense;
      const shouldShowRemove =
        canManage
        && Boolean(selectedFavorite?.id || selectedFavorite?.license_plate)
        && selectedFavoriteMatchesLicense;
      const addWrap = this.shadowRoot.querySelector<HTMLElement>(
        "#addFavoriteWrap"
      );
      const addCheckbox = this.shadowRoot.querySelector<CheckedElement>(
        "#addFavorite"
      );
      const removeWrap = this.shadowRoot.querySelector<HTMLElement>(
        "#removeFavoriteWrap"
      );
      const removeButton = this.shadowRoot.querySelector<DisabledElement>(
        "#removeFavorite"
      );
      if (addWrap) {
        addWrap.style.display = shouldShowAdd ? "" : "none";
        addWrap.hidden = !shouldShowAdd;
      }
      if (removeWrap) {
        removeWrap.style.display = shouldShowRemove ? "" : "none";
        removeWrap.hidden = !shouldShowRemove;
      }
      if (removeButton) {
        const favoriteId =
          selectedFavorite?.id || selectedFavorite?.license_plate || "";
        removeButton.setAttribute("data-favorite-id", favoriteId);
      }
      if (addCheckbox) {
        if (!shouldShowAdd) {
          addCheckbox.checked = false;
        }
      }
    }

    async _handleStart(): Promise<void> {
      if (!this._hass) {
        return;
      }
      if (!this._deviceId) {
        this._status = this._localize("message.select_permit_before_start");
        this._statusType = "warning";
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
        this._status = this._localize("message.license_plate_required");
        this._statusType = "warning";
        this._startInFlight = false;
        this._requestRender();
        return;
      }

      const { start, end } = this._resolveTimes();
      if (!start || !end) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._startInFlight = false;
        this._requestRender();
        return;
      }
      if (end <= start) {
        this._status = this._localize("message.end_before_start");
        this._statusType = "warning";
        this._startInFlight = false;
        this._requestRender();
        return;
      }

      const addFavorite =
        this.shadowRoot?.querySelector<CheckedElement>("#addFavorite");
      const name = this._getInputValue("visitorName").trim();
      if (addFavorite?.checked && license && name) {
        const matchingFavorite = this._findFavorite(license, name);
        if (!matchingFavorite) {
          this._addFavorite(license, name);
        }
        addFavorite.checked = false;
      }

      try {
        await this._hass.callService(DOMAIN, "start_reservation", {
          device_id: this._deviceId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          license_plate: license,
        });
      } catch (err: unknown) {
        this._status = this._localize("message.reservation_update_failed");
        this._statusType = "warning";
        this._startInFlight = false;
        this._requestRender();
        return;
      }

      this._status = this._localize("message.reservation_requested");
      this._statusType = "success";
      this._setStartButtonSuccess();
      this._startInFlight = false;
      this._requestRender();
      window.dispatchEvent(
        new CustomEvent("city-visitor-parking-reservation-started", {
          detail: { device_id: this._deviceId },
        })
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
        const startDateValue = showStart ? this._getInputValue("startDate") : "";
        const startTimeValue = showStart ? this._getInputValue("startTime") : "";
        const endDateValue = showEnd ? this._getInputValue("endDate") : "";
        const endTimeValue = showEnd ? this._getInputValue("endTime") : "";
        start = this._parseDateTime(startDateValue, startTimeValue, fallbackStart);
        const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
        end = this._parseDateTime(endDateValue, endTimeValue, fallbackEnd);
      } else {
        const startValue = showStart ? this._getInputValue("startDateTime") : "";
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

    _formatReservationDateTime(value: string | undefined | null): string {
      if (!value) {
        return "";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return formatDateTimeLocal(date);
    }

    _getInputValue(id: string): string {
      const input = this.shadowRoot?.querySelector<ValueElement>(`#${id}`);
      return input?.value || "";
    }

    _setInputValue(id: string, value: string): void {
      const input = this.shadowRoot?.querySelector<ValueElement>(`#${id}`);
      if (input && value !== undefined) {
        this._setElementValue(input, value);
      }
    }

    _setElementValue(
      element: ValueElement | null,
      value: string | null | undefined
    ): void {
      if (!element) {
        return;
      }
      const safeValue = value ?? "";
      const updateComplete = element?.updateComplete;
      if (updateComplete && typeof updateComplete.then === "function") {
        updateComplete.then(() => {
          element.value = safeValue;
        });
        return;
      }
      element.value = safeValue;
    }

    _syncEndWithStart(useSplitDateTime: boolean): void {
      if (!this._config?.show_end_time) {
        return;
      }
      const offsetMs = 60 * 60 * 1000;
      const payWindowEnd = this._getCachedPayWindowEnd();
      if (useSplitDateTime) {
        const startDateValue = this._getInputValue("startDate");
        const startTimeValue = this._getInputValue("startTime");
        if (!startDateValue || !startTimeValue) {
          return;
        }
        const start = new Date(
          `${startDateValue}T${normalizeTimeValue(startTimeValue)}`
        );
        if (Number.isNaN(start.getTime())) {
          return;
        }
        const end = this._resolveDefaultEnd(start, payWindowEnd, offsetMs);
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
      const end = this._resolveDefaultEnd(start, payWindowEnd, offsetMs);
      this._setInputValue("endDateTime", formatDateTimeLocal(end));
    }

    async _applyEndDefaultFromPayWindow(
      useSplitDateTime: boolean
    ): Promise<void> {
      if (!this._config?.show_end_time) {
        return;
      }
      const endValue = useSplitDateTime
        ? this._getInputValue("endDate")
        : this._getInputValue("endDateTime");
      if (endValue) {
        return;
      }
      const payWindowEnd = await this._getPayWindowEnd();
      if (!payWindowEnd) {
        const now = new Date();
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 0, 0);
        if (useSplitDateTime) {
          this._setInputValue("endDate", formatDate(dayEnd));
          this._setInputValue("endTime", formatTime(dayEnd));
          return;
        }
        this._setInputValue("endDateTime", formatDateTimeLocal(dayEnd));
        return;
      }
      if (useSplitDateTime) {
        this._setInputValue("endDate", formatDate(payWindowEnd));
        this._setInputValue("endTime", formatTime(payWindowEnd));
        return;
      }
      this._setInputValue("endDateTime", formatDateTimeLocal(payWindowEnd));
    }

    _resolveDefaultEnd(
      start: Date,
      payWindowEnd: Date | null,
      offsetMs: number
    ): Date {
      if (payWindowEnd && payWindowEnd > start) {
        return payWindowEnd;
      }
      const fallback = new Date(start.getTime() + offsetMs);
      if (payWindowEnd === null) {
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 59, 0, 0);
        return dayEnd > start ? dayEnd : fallback;
      }
      return fallback;
    }

    _resetPayWindowEndCache(): void {
      this._payWindowEndEntityId = null;
      this._payWindowEndEntityDeviceId = null;
    }

    _getCachedPayWindowEnd(): Date | null {
      if (!this._hass || !this._deviceId) {
        return null;
      }
      if (
        !this._payWindowEndEntityId ||
        this._payWindowEndEntityDeviceId !== this._deviceId
      ) {
        return null;
      }
      const state = this._hass.states?.[this._payWindowEndEntityId];
      if (!state || !state.state) {
        return null;
      }
      const parsed = new Date(state.state);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    }

    async _getPayWindowEnd(): Promise<Date | null> {
      if (!this._hass || !this._deviceId) {
        return null;
      }
      if (
        !this._payWindowEndEntityId ||
        this._payWindowEndEntityDeviceId !== this._deviceId
      ) {
        try {
          const entities = await this._hass.callWS<Array<{
            entity_id: string;
            device_id?: string;
            unique_id?: string;
            platform?: string;
            domain?: string;
          }>>({ type: "config/entity_registry/list" });
          const match = entities.find(
            (entity) =>
              entity.device_id === this._deviceId &&
              entity.domain === "sensor" &&
              entity.unique_id?.endsWith(":next_chargeable_end")
          );
          this._payWindowEndEntityId = match?.entity_id ?? null;
          this._payWindowEndEntityDeviceId = this._deviceId;
        } catch {
          this._payWindowEndEntityId = null;
          this._payWindowEndEntityDeviceId = this._deviceId;
        }
      }
      return this._getCachedPayWindowEnd();
    }

    async _applyFavoriteSelection(plate: string, name: string): Promise<void> {
      this._setInputValue("visitorName", name);
      this._setInputValue("licensePlate", plate);
      const licenseInput =
        this.shadowRoot?.querySelector<ValueElement>("#licensePlate");
      const nameInput =
        this.shadowRoot?.querySelector<ValueElement>("#visitorName");
      const pending: Array<Promise<unknown>> = [];
      if (licenseInput?.updateComplete) {
        pending.push(licenseInput.updateComplete);
      }
      if (nameInput?.updateComplete) {
        pending.push(nameInput.updateComplete);
      }
      if (pending.length) {
        await Promise.all(pending);
      }
      this._scheduleFavoriteActionsUpdate();
    }

    _getActiveEntryId(): string | null {
      return this._config?.config_entry_id || this._selectedEntryId;
    }

    _localize(key: string, ...args: Array<string | number>): string {
      const lookupKey = `${TRANSLATION_PREFIX}.${key}`;
      const translated = this._hass?.localize?.(lookupKey, ...args);
      if (translated && translated !== lookupKey) {
        return translated;
      }
      return DEFAULT_STRINGS[key] ?? key;
    }

    _applyTheme(): void {
      if (!this._hass) {
        return;
      }
      const themeName = this._config?.theme;
      if (!themeName) {
        this._clearTheme();
        return;
      }
      const themes = this._hass.themes?.themes as
        | Record<string, Record<string, string>>
        | undefined;
      const theme = themes?.[themeName];
      if (!theme) {
        this._clearTheme();
        return;
      }
      if (this._appliedThemeName !== themeName) {
        this._clearTheme();
      }
      const applied: string[] = [];
      for (const [key, value] of Object.entries(theme)) {
        if (typeof value !== "string") {
          continue;
        }
        const cssVar = key.startsWith("--") ? key : `--${key}`;
        this.style.setProperty(cssVar, value);
        applied.push(cssVar);
      }
      this._appliedThemeVariables = applied;
      this._appliedThemeName = themeName;
    }

    async _ensureTranslations(): Promise<void> {
      if (!this._hass || this._translationsPromise) {
        return;
      }
      const loadTranslations = this._hass.loadBackendTranslation;
      if (typeof loadTranslations !== "function") {
        return;
      }
      this._translationsPromise = loadTranslations.call(
        this._hass,
        TRANSLATION_SECTION,
        DOMAIN
      );
      try {
        await this._translationsPromise;
      } finally {
        this._requestRender();
      }
    }

    _clearTheme(): void {
      if (this._appliedThemeVariables.length) {
        for (const cssVar of this._appliedThemeVariables) {
          this.style.removeProperty(cssVar);
        }
      }
      this._appliedThemeVariables = [];
      this._appliedThemeName = null;
    }

    _useSplitDateTime(): boolean {
      const supportsSplit = Boolean(
        customElements.get("ha-date-input") && customElements.get("ha-time-input")
      );
      if (this._splitDateTimeSupport === null || supportsSplit) {
        this._splitDateTimeSupport = supportsSplit;
      }
      return this._splitDateTimeSupport;
    }

    _isInEditor(): boolean {
      const selector =
        "hui-card-preview, hui-card-picker, hui-card-element-editor, " +
        "hui-card-edit-mode, hui-dialog-edit-card";
      let node: Node | null = this;
      while (node) {
        if (node instanceof HTMLElement && node.matches(selector)) {
          return true;
        }
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
    }

    _escape(value: string | number | null | undefined): string {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  }

  if (!customElements.get(CARD_TYPE)) {
    customElements.define(CARD_TYPE, CityVisitorParkingNewReservationCard);
  }

  const win = window as Window & {
    customCards?: Array<{ type: string; name: string; description: string }>;
  };
  win.customCards = win.customCards || [];
  win.customCards.push({
    type: CARD_TYPE,
    name: "City visitor parking",
    description: "Start a visitor parking reservation.",
  });
})();
