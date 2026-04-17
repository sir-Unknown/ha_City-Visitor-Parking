import { css, html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import type {
  DeviceEntry,
  FavoriteItem,
  HomeAssistant,
  PermitOption,
  ZoneStatus,
  ZoneStatusResponse,
} from "./types";
import { ensureTranslations, getGlobalHass } from "./translations";
import {
  DOMAIN,
  RESERVATION_ENDED_EVENT,
  EMPTY_ZONE_STATUS,
  RESERVATION_STARTED_EVENT,
  applyZoneStatus,
  buildPermitOptions,
  clearFavoriteTransientState,
  createFavoriteIndex,
  extractEventValue,
  fetchPermitEntries,
  filterDomainDevices,
  formatDateTimeLocal,
  getConfigEntryId,
  invalidateFavoritesCache,
  isHassRunning,
  normalizeMatchValue,
  normalizePlateValue,
  parseDateTimeValue,
  setPendingPermitDefaults,
} from "./helpers";
import {
  BASE_CARD_STYLES,
  renderCardHeader,
  renderFavoriteActionRow,
  renderFavoriteSelect,
  renderLoadingCard,
  renderPermitSelect,
  triggerProgressButtonFeedback,
} from "./ui";
import { BaseLocalizedCard, registerCustomCardWithTranslations } from "./base";
import { getCardConfigForm } from "./editor-parking";

const CARD_TYPE = "city-visitor-parking-card";
const WS_LIST_FAVORITES = "city_visitor_parking/favorites";
const WS_GET_STATUS = "city_visitor_parking/status";
// Minimum interval between status fetches triggered by hass updates.
const STATUS_THROTTLE_MS = 60000;
// Background polling interval for zone status (and on page visibility restore).
// The coordinator already polls at 5–30 min; no need to fetch more often than that.
const STATUS_REFRESH_MS = 300000;

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
  _onReservationEnded = (event: Event) =>
    void this._handleReservationEnded(event);

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(RESERVATION_ENDED_EVENT, this._onReservationEnded);
  }

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
      throw new Error(this._localize("message.invalid_config"));
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
      this._deviceEntryId = getConfigEntryId(this._config) || priorEntryId;
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
    const nextLanguage =
      (hass.language as string | undefined) || navigator.language || "en";
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
    window.removeEventListener(
      RESERVATION_ENDED_EVENT,
      this._onReservationEnded,
    );
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
    if (!this._permitOptionsLoaded || this._permitOptions.length !== 1) return;
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
    if (this._permitOptions.some((o) => o.id === entryId && o.disabled)) return;
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
        const stillPresent = this._favorites.some((favorite: FavoriteItem) => {
          const candidate = normalizeMatchValue(
            favorite.id || favorite.license_plate,
          );
          return candidate === pendingId;
        });
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
    const permitSelectDisabled = controlsDisabled || this._permitOptionsLoading;
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
      const currentValue = normalizeMatchValue(this._getInputValue("favorite"));
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
    if (field?.id === "startDateTime") {
      this._syncEndDateWithStart();
    }
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
    if (field?.id === "startDateTime") {
      this._syncEndDateWithStart();
    }
  }

  _handlePermitSelectChange(event: Event): void {
    if (this._isInEditor()) return;
    const target = event.currentTarget as
      | (HTMLElement & { value?: string })
      | null;
    this._handlePermitChange(extractEventValue(event, target));
  }

  _handleFavoriteSelectChange(event: Event): void {
    if (
      !this._config?.show_favorites ||
      !this._config?.show_name ||
      this._isInEditor()
    )
      return;
    const select = event.currentTarget as
      | (HTMLElement & { value?: string })
      | null;
    const path = event.composedPath();
    const pathValueElement = path.find(
      (node): node is HTMLElement & { value?: string } =>
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
    const favorite = this._favoritesByValue.get(normalizeMatchValue(nextValue));
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
      // Invalidate active-plate cache so the next render re-fetches and
      // picks up reservations ended or changed outside this card.
      this._activeReservationsLoadedFor = null;
      void this._loadActivePlates(entryId);
    };
    this._statusRefreshHandle = window.setInterval(refresh, STATUS_REFRESH_MS);
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
    this._setStatus(this._localize("message.removing_favorite"), "info", 5000);
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
    let element: (HTMLElement & { value?: string }) | null = null;
    let inputElement: HTMLInputElement | HTMLTextAreaElement | null = null;
    for (const node of path) {
      if (!element && node instanceof HTMLElement && ids.has(node.id)) {
        element = node as HTMLElement & { value?: string };
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

  _syncEndDateWithStart(): void {
    if (!this._config?.show_start_time || !this._config?.show_end_time) return;
    const start = parseDateTimeValue(this._getInputValue("startDateTime"));
    const end = parseDateTimeValue(this._getInputValue("endDateTime"));
    if (!start || !end) return;
    if (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate()
    ) {
      return;
    }
    const syncedEnd = new Date(end);
    syncedEnd.setFullYear(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
    this._setInputValue("endDateTime", formatDateTimeLocal(syncedEnd));
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
      // Only apply result if the entry hasn't changed while awaiting (P1).
      if (this._activeReservationsLoadedFor === entryId) {
        this._activeReservationsByPlate = byPlate;
      }
    } catch {
      // Reset loaded marker so a future call can retry (P2).
      this._activeReservationsLoadedFor = null;
      this._activeReservationsByPlate = new Map();
    }
    this._requestRender();
  }

  async _handleReservationEnded(event: Event): Promise<void> {
    const activeEntryId = this._getActiveEntryId();
    if (!this._hass || !activeEntryId) return;
    const detail = (
      event as CustomEvent<{
        device_id?: string | null;
      }>
    ).detail;
    const deviceId = (detail?.device_id ?? "").trim();
    if (deviceId && this._deviceId && deviceId !== this._deviceId) return;
    this._activeReservationsLoadedFor = null;
    await this._loadActivePlates(activeEntryId);
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
