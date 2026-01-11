import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { getCardConfigForm } from "./city-visitor-parking-card-editor";
import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import {
  DOMAIN,
  errorMessage,
  formatDate,
  formatDateTimeLocal,
  formatTime,
  isInEditor,
  registerCustomCard,
} from "./card-shared";

(() => {
  const CARD_TYPE = "city-visitor-parking-card";
  const WS_LIST_FAVORITES = "city_visitor_parking/favorites";
  const FAVORITE_PLACEHOLDER_VALUE = "__favorite_placeholder__";

  type HassState = {
    state?: string;
    attributes?: Record<string, unknown>;
  };
  type HomeAssistant = {
    callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
    callService: <T = unknown>(
      domain: string,
      service: string,
      data: Record<string, unknown>,
    ) => Promise<T>;
    localize?: LocalizeFunc;
    language?: string;
    locale?: Record<string, unknown>;
    states?: Record<string, HassState>;
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

  const CONFIG_ENTRY_SELECTOR = {
    config_entry: { integration: DOMAIN },
  };

  const normalizeTimeValue = (value: string): string =>
    value.length === 5 ? `${value}:00` : value;
  const normalizeMatchValue = (value: string | undefined | null): string =>
    String(value ?? "")
      .trim()
      .toLowerCase();
  const normalizePlateValue = (value: string | undefined | null): string =>
    normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");
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
    static styles = css`
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
        gap: var(
          --entities-card-row-gap,
          var(--card-row-gap, var(--ha-space-2))
        );
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
    `;
    _config: CardConfig | null;
    _hass: HomeAssistant | null;
    _deviceId: string | null;
    _deviceEntryId: string | null;
    _deviceLoadPromise: Promise<void> | null;
    _deviceIdByEntryId: Map<string, string | null>;
    _favorites: FavoriteItem[];
    _favoritesError: string | null;
    _favoritesLoadedFor: string | null;
    _favoritesLoading: boolean;
    _favoritesByPlate: Map<string, FavoriteItem>;
    _favoritesByPlateName: Map<string, FavoriteItem>;
    _favoritesByValue: Map<string, FavoriteItem>;
    _formValues: Record<string, string>;
    _pendingRemoveFavoriteId: string | null;
    _selectedEntryId: string | null;
    _startButtonSuccess: boolean;
    _startButtonSuccessTimeout: number | null;
    _startInFlight: boolean;
    _favoriteRemoveInFlight: boolean;
    _addFavoriteChecked: boolean;
    _suppressFavoriteClear: boolean;
    _payWindowEndEntityId: string | null;
    _payWindowEndEntityDeviceId: string | null;
    _payWindowEndEntityByDeviceId: Map<string, string | null>;
    _status: string;
    _statusType: "info" | "warning" | "success";
    _renderHandle: number | null;
    _translationsVersion: number;
    _splitDateTimeSupport: boolean | null;
    _onClick: (event: Event) => void;
    _onInput: (event: Event) => void;
    _onChange: (event: Event) => void;
    _onPermitSelectChange: (event: Event) => void;
    _onFavoriteSelectChange: (event: Event) => void;

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
      this._favoritesLoading = false;
      this._favoritesByPlate = new Map();
      this._favoritesByPlateName = new Map();
      this._favoritesByValue = new Map();
      this._formValues = {};
      this._pendingRemoveFavoriteId = null;
      this._selectedEntryId = null;
      this._startButtonSuccess = false;
      this._startButtonSuccessTimeout = null;
      this._startInFlight = false;
      this._favoriteRemoveInFlight = false;
      this._addFavoriteChecked = false;
      this._suppressFavoriteClear = false;
      this._payWindowEndEntityId = null;
      this._payWindowEndEntityDeviceId = null;
      this._payWindowEndEntityByDeviceId = new Map();
      this._status = "";
      this._statusType = "info";
      this._renderHandle = null;
      this._translationsVersion = 0;
      this._splitDateTimeSupport = null;
      this._onClick = (event: Event) => this._handleClick(event);
      this._onInput = (event: Event) => this._handleInput(event);
      this._onChange = (event: Event) => this._handleChange(event);
      this._onPermitSelectChange = (event: Event) =>
        this._handlePermitSelectChange(event);
      this._onFavoriteSelectChange = (event: Event) =>
        this._handleFavoriteSelectChange(event);
    }

    static async getConfigForm(hass?: HomeAssistant): Promise<{
      readonly schema: ReadonlyArray<Record<string, unknown>>;
    }> {
      return getCardConfigForm(hass);
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
        const globalHass = (window as Window & { hass?: HomeAssistant }).hass;
        throw new Error(
          localize(this._hass ?? globalHass, "message.invalid_config"),
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
        this._resetPayWindowEndCache();
        if (entryChanged) {
          this._resetFavoritesState();
        }
      } else if (entryChanged) {
        this._resetDeviceState();
      }
      this._requestRender();
      this._ensureDeviceId();
      void this._loadData();
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      void ensureTranslations(this._hass).then(() => {
        this._translationsVersion += 1;
        this.requestUpdate();
      });
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
      const cachedDeviceId = this._deviceIdByEntryId.get(entryId);
      if (cachedDeviceId !== undefined) {
        this._deviceId = cachedDeviceId;
        this._deviceEntryId = entryId;
        this._resetPayWindowEndCache();
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
        this._setFavorites(
          Array.isArray(result?.favorites) ? result.favorites : [],
        );
      } catch (err: unknown) {
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
      this._renderHandle = window.setTimeout(() => {
        this._renderHandle = null;
        this.requestUpdate();
      }, 0);
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
      if (!this._hass) {
        return html`
          <ha-card>
            <div class="card-content">
              <ha-alert alert-type="warning">
                ${this._getLoadingMessage()}
              </ha-alert>
            </div>
          </ha-card>
        `;
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
      const localize = this._localize.bind(this);
      const { showAddFavorite, showRemoveFavorite, selectedFavorite } =
        this._getFavoriteActionState();
      const favoriteRemoveDisabled =
        controlsDisabled || this._favoriteRemoveInFlight;
      const favoritesOptions = this._favorites;
      const favoriteSelectDisabled = controlsDisabled || this._favoritesLoading;
      const startDisabled =
        controlsDisabled || !hasDevice || this._startInFlight;

      return html`
        <ha-card
          @click=${this._onClick}
          @input=${this._onInput}
          @change=${this._onChange}
        >
          ${showHeader
            ? html`
                <h1 class="card-header">
                  <div class="name">
                    ${icon
                      ? html`<ha-icon class="icon" .icon=${icon}></ha-icon>`
                      : nothing}
                    ${title}
                  </div>
                </h1>
              `
            : nothing}
          <div class="card-content">
            ${showReservationForm
              ? html`
                  ${hasTarget && !hasDevice
                    ? html`
                        <ha-alert alert-type="warning">
                          ${localize("message.no_device_for_permit")}
                        </ha-alert>
                      `
                    : nothing}
                  ${showPermitPicker
                    ? html`
                        <div class="row">
                          <ha-selector
                            id="permitSelect"
                            .hass=${this._hass}
                            .selector=${CONFIG_ENTRY_SELECTOR}
                            .label=${localize("field.permit")}
                            .value=${activeEntryId ?? null}
                            @value-changed=${this._onPermitSelectChange}
                          ></ha-selector>
                        </div>
                      `
                    : nothing}
                  ${showFavorites
                    ? html`
                        <div class="row">
                          ${keyed(
                            this._translationsVersion,
                            html`<ha-select
                              id="favorite"
                              .label=${localize("field.favorite")}
                              .value=${favoriteValue}
                              ?disabled=${favoriteSelectDisabled}
                              @selected=${this._onFavoriteSelectChange}
                            >
                              <mwc-list-item
                                value=${FAVORITE_PLACEHOLDER_VALUE}
                              >
                                ${localize("message.select_favorite")}
                              </mwc-list-item>
                              ${favoritesOptions.map(
                                (favorite: FavoriteItem) => {
                                  const value =
                                    favorite.license_plate || favorite.id || "";
                                  const label =
                                    favorite.name ||
                                    favorite.license_plate ||
                                    favorite.id ||
                                    "";
                                  return html`<mwc-list-item value=${value}
                                    >${label}</mwc-list-item
                                  >`;
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
                  ${showFavorites && this._favoritesLoading
                    ? html`
                        <div class="row spinner">
                          <ha-spinner size="small"></ha-spinner>
                          <span>${localize("message.loading_favorites")}</span>
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
                                  <ha-icon
                                    icon="mdi:trash-can-outline"
                                  ></ha-icon>
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
            ${this._status
              ? html`
                  <ha-alert alert-type=${this._statusType}
                    >${this._status}</ha-alert
                  >
                `
              : nothing}
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

      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const useSplitDateTime = this._useSplitDateTime();

      const now = new Date();
      const startDefault = new Date(now.getTime() + 60 * 1000);
      const payWindowEnd = this._getCachedPayWindowEnd();
      let defaultsUpdated = false;
      if (useSplitDateTime) {
        if (showStart && !this._getInputValue("startDate")) {
          this._formValues.startDate = formatDate(startDefault);
          defaultsUpdated = true;
        }
        if (showStart && !this._getInputValue("startTime")) {
          this._formValues.startTime = formatTime(startDefault);
          defaultsUpdated = true;
        }
        if (showEnd && !this._getInputValue("endDate") && payWindowEnd) {
          this._formValues.endDate = formatDate(payWindowEnd);
          defaultsUpdated = true;
        }
        if (showEnd && !this._getInputValue("endTime") && payWindowEnd) {
          this._formValues.endTime = formatTime(payWindowEnd);
          defaultsUpdated = true;
        }
        void this._applyEndDefaultFromPayWindow(true);
      } else {
        if (showStart && !this._getInputValue("startDateTime")) {
          this._formValues.startDateTime = formatDateTimeLocal(startDefault);
          defaultsUpdated = true;
        }
        if (showEnd && !this._getInputValue("endDateTime") && payWindowEnd) {
          this._formValues.endDateTime = formatDateTimeLocal(payWindowEnd);
          defaultsUpdated = true;
        }
        void this._applyEndDefaultFromPayWindow(false);
      }

      if (defaultsUpdated) {
        this._requestRender();
      }

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
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if ("id" in target && typeof target.id === "string") {
        const value = (target as ValueElement).value ?? "";
        if (INPUT_VALUE_IDS.has(target.id)) {
          this._setInputValue(target.id, value);
        }
      }
      if (target.id === "licensePlate" || target.id === "visitorName") {
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
        target.id === "startDateTime" &&
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
      if ("id" in target && typeof target.id === "string") {
        const value = (target as ValueElement).value ?? "";
        if (CHANGE_VALUE_IDS.has(target.id)) {
          this._setInputValue(target.id, value);
        }
      }
      if (target.id === "addFavorite") {
        this._addFavoriteChecked = (target as CheckedElement).checked;
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      if (
        target.id === "startDateTime" &&
        this._config?.show_start_time &&
        this._config?.show_end_time &&
        !this._useSplitDateTime()
      ) {
        this._syncEndWithStart(false);
        return;
      }
      if (
        (target.id === "startDate" || target.id === "startTime") &&
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
      const value = detail?.value ?? "";
      this._handlePermitChange(value);
    }

    _handleFavoriteSelectChange(event: Event): void {
      if (!this._config?.show_favorites || this._isInEditor()) {
        return;
      }
      const select = event.currentTarget as ValueElement | null;
      const plate = select?.value;
      this._setInputValue("favorite", plate ?? "");
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
        this._resetDeviceState();
        this._status = "";
        this._statusType = "info";
        this._requestRender();
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
      this._resetDeviceState();
      this._status = "";
      this._statusType = "info";
      this._requestRender();
      this._ensureDeviceId();
      this._maybeLoadFavorites();
    }

    _resetFavoritesState(): void {
      this._favoritesLoadedFor = null;
      this._setFavorites([]);
    }

    _resetDeviceState(): void {
      this._deviceId = null;
      this._deviceEntryId = null;
      this._resetPayWindowEndCache();
      this._resetFavoritesState();
    }

    _setFavorites(favorites: FavoriteItem[]): void {
      this._favorites = favorites;
      this._rebuildFavoriteIndex();
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
        this._status = this._errorMessage(
          err,
          "message.favorite_remove_failed",
        );
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
        this._status = this._errorMessage(
          err,
          "message.reservation_start_failed",
        );
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
      return this._formValues[id] ?? "";
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
      const payWindowEnd = this._getCachedPayWindowEnd();
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
      useSplitDateTime: boolean,
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
      offsetMs: number,
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
      const cachedEntityId = this._payWindowEndEntityByDeviceId.get(
        this._deviceId,
      );
      if (cachedEntityId !== undefined) {
        this._payWindowEndEntityId = cachedEntityId;
        this._payWindowEndEntityDeviceId = this._deviceId;
        return this._getCachedPayWindowEnd();
      }
      if (
        !this._payWindowEndEntityId ||
        this._payWindowEndEntityDeviceId !== this._deviceId
      ) {
        try {
          const entities = await this._hass.callWS<
            Array<{
              entity_id: string;
              device_id?: string;
              unique_id?: string;
              platform?: string;
              domain?: string;
            }>
          >({ type: "config/entity_registry/list" });
          const match = entities.find(
            (entity) =>
              entity.device_id === this._deviceId &&
              entity.domain === "sensor" &&
              entity.unique_id?.endsWith(":next_chargeable_end"),
          );
          const entityId = match?.entity_id ?? null;
          if (entityId) {
            this._payWindowEndEntityByDeviceId.set(this._deviceId, entityId);
          }
          this._payWindowEndEntityId = entityId;
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
      await this.updateComplete;
      this._scheduleFavoriteActionsUpdate();
    }

    _getActiveEntryId(): string | null {
      return this._config?.config_entry_id || this._selectedEntryId;
    }

    _localize(key: string, ..._args: Array<string | number>): string {
      return localize(this._hass, key);
    }

    _errorMessage(err: unknown, fallbackKey: string): string {
      return errorMessage(err, fallbackKey, this._localize.bind(this));
    }

    _getLoadingMessage(): string {
      const key = "message.home_assistant_loading";
      const message = localize(this._hass, key);
      return message === key
        ? "Home Assistant is loading. Not all data is available yet."
        : message;
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

    _isInEditor(): boolean {
      return isInEditor(this);
    }
  }

  const globalHass = (window as Window & {
    hass?: { localize?: LocalizeFunc };
  }).hass;
  const getCardText = (key: string, fallback: string): string => {
    const value = localize(globalHass, key);
    return value === key ? fallback : value;
  };
  const registerCard = (): void => {
    registerCustomCard(
      CARD_TYPE,
      CityVisitorParkingNewReservationCard,
      getCardText("name", "City visitor parking"),
      getCardText("description", "Start your visitor parking reservation."),
    );
  };
  registerCard();
  void ensureTranslations(globalHass).then(registerCard);
})();
