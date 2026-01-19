import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import {
  BASE_CARD_STYLES,
  DOMAIN,
  RESERVATION_STARTED_EVENT,
  createErrorMessage,
  createLocalize,
  createRenderScheduler,
  createStatusState,
  fetchPermitTitleMap,
  formatOptionalDateTimeLocal,
  getGlobalHass,
  getConfigEntryId,
  filterDomainDevices,
  getInvalidConfigError,
  hideCustomCardFromPicker,
  isHassRunning,
  isInEditor,
  parseDateTimeValue,
  resolvePermitLabelsByDevice,
  useStatusState,
  registerCustomCardWithTranslations,
  renderCardHeader,
  renderLoadingCard,
  renderStatusAlert,
  showPicker,
  type DeviceEntry,
  type HomeAssistant,
  type StatusState,
  type StatusType,
} from "./card-shared";
import { getActiveCardConfigForm } from "./city-visitor-parking-active-card-editor";
import { ensureTranslations } from "./localize";

(() => {
  const CARD_TYPE = "city-visitor-parking-active-card";
  const SERVICE_LIST_ACTIVE_RESERVATIONS = "list_active_reservations";
  const SERVICE_UPDATE_RESERVATION = "update_reservation";
  const SERVICE_END_RESERVATION = "end_reservation";

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
  type ValueElement = HTMLElement & { value?: string };
  type DisabledElement = HTMLElement & { disabled?: boolean };

  class CityVisitorParkingActiveCard extends LitElement {
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
        .reservation-input {
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
    _config: CardConfig | null;
    _hass: HomeAssistant | null;
    _activeReservations: ActiveReservation[];
    _activeReservationsError: string | null;
    _activeReservationsLoadedFor: string | null;
    _activeReservationsLoading: boolean;
    _suppressLoadingIndicator: boolean;
    _reservationUpdateFieldsByDevice: Record<string, string[]>;
    _devicesPromise: Promise<DeviceEntry[]> | null;
    _configEntriesPromise: Promise<Map<string, string>> | null;
    _configEntryTitleById: Map<string, string>;
    _permitLabelsByDeviceId: Map<string, string>;
    _statusState: StatusState;
    _reservationStartedHandler: (() => void) | null;
    _requestRender: () => void;
    _reservationInFlight: Set<string>;
    _reservationInputValues: Map<string, { start?: string; end?: string }>;
    _localize: (key: string, ...args: Array<string | number>) => string;
    _errorMessage: (err: unknown, fallbackKey: string) => string;
    _onActionClick: (event: Event) => void;
    _onReservationInput: (event: Event) => void;
    _onReservationChange: (event: Event) => void;
    _onPickerClick: (event: Event) => void;

    constructor() {
      super();
      this._config = null;
      this._hass = null;
      this._activeReservations = [];
      this._activeReservationsError = null;
      this._activeReservationsLoadedFor = null;
      this._activeReservationsLoading = false;
      this._suppressLoadingIndicator = false;
      this._reservationUpdateFieldsByDevice = {};
      this._devicesPromise = null;
      this._configEntriesPromise = null;
      this._configEntryTitleById = new Map();
      this._permitLabelsByDeviceId = new Map();
      this._statusState = createStatusState();
      this._reservationStartedHandler = null;
      this._requestRender = createRenderScheduler(() => this.requestUpdate());
      this._reservationInFlight = new Set();
      this._reservationInputValues = new Map();
      this._localize = createLocalize(() => this._hass);
      this._errorMessage = createErrorMessage(() => this._hass);
      this._onActionClick = (event: Event) => this._handleActionClick(event);
      this._onReservationInput = (event: Event) =>
        this._handleReservationInput(event);
      this._onReservationChange = (event: Event) =>
        this._handleReservationChange(event);
      this._onPickerClick = (event: Event) => this._handlePickerClick(event);
    }

    connectedCallback(): void {
      super.connectedCallback();
      if (!this._reservationStartedHandler) {
        this._reservationStartedHandler = () => {
          void this._maybeLoadActiveReservations(true);
        };
      }
      window.addEventListener(
        RESERVATION_STARTED_EVENT,
        this._reservationStartedHandler,
      );
    }

    disconnectedCallback(): void {
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
      return {
        type: `custom:${CARD_TYPE}`,
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw getInvalidConfigError(
          this._hass ?? getGlobalHass<HomeAssistant>(),
        );
      }
      this._config = { ...config };
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      void ensureTranslations(this._hass).then(() => this.requestUpdate());
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }

    getCardSize(): number {
      return 3;
    }

    async _maybeLoadActiveReservations(
      force = false,
      silent = false,
    ): Promise<void> {
      if (!this._hass || !this._config) {
        return;
      }
      if (!isHassRunning(this._hass)) {
        return;
      }
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
      this._suppressLoadingIndicator = silent;
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
          this._activeReservationsLoadedFor = target;
          return;
        }
        const entryTitles = await this._getConfigEntryTitles();
        this._permitLabelsByDeviceId = resolvePermitLabelsByDevice(
          devices,
          entryTitles,
        );
        type ActiveReservationsResult = {
          active_reservations?: ActiveReservation[];
          reservation_update_fields?: string[];
          response?: {
            active_reservations?: ActiveReservation[];
            reservation_update_fields?: string[];
          };
        };
        const results = await Promise.all(
          devices.map((device) =>
            this._hass!.callWS<ActiveReservationsResult>({
              type: "call_service",
              domain: DOMAIN,
              service: SERVICE_LIST_ACTIVE_RESERVATIONS,
              return_response: true,
              service_data: {
                device_id: device.id,
              },
            }),
          ),
        );
        const collected: ActiveReservation[] = [];
        for (const [index, result] of results.entries()) {
          const device = devices[index];
          const activeReservations =
            result?.active_reservations ||
            result?.response?.active_reservations;
          const updateFields =
            result?.reservation_update_fields ||
            result?.response?.reservation_update_fields;
          if (Array.isArray(updateFields)) {
            this._reservationUpdateFieldsByDevice[device.id] = updateFields;
          }
          if (Array.isArray(activeReservations)) {
            collected.push(
              ...activeReservations.map((reservation) => ({
                ...reservation,
                device_id: reservation.device_id || device.id,
              })),
            );
          }
        }
        this._activeReservations = collected;
        this._activeReservationsLoadedFor = target;
        const activeIds = new Set(
          collected.map((reservation) => reservation.reservation_id),
        );
        for (const reservationId of this._reservationInputValues.keys()) {
          if (!activeIds.has(reservationId)) {
            this._reservationInputValues.delete(reservationId);
          }
        }
      } catch (err: unknown) {
        this._activeReservations = [];
        this._activeReservationsError = this._errorMessage(
          err,
          "message.active_reservations_failed",
        );
        this._activeReservationsLoadedFor = null;
      } finally {
        this._activeReservationsLoading = false;
        this._suppressLoadingIndicator = false;
        this._requestRender();
      }
    }

    render(): TemplateResult {
      if (!this._config) {
        return html``;
      }
      if (!isHassRunning(this._hass)) {
        return renderLoadingCard(
          this._hass ?? getGlobalHass<HomeAssistant>(),
          html,
        );
      }

      const title = this._config.title || "";
      const icon = this._config.icon;
      const controlsDisabled = this._isInEditor();

      return html`
        <ha-card @click=${this._onActionClick}>
          ${renderCardHeader(title, icon, html, nothing)}
          <div class="card-content">
            ${this._renderActiveReservations(controlsDisabled)}
            ${renderStatusAlert(this._statusState, html, nothing)}
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
      const identify = name || license || reservation.reservation_id;
      const permitLabel = reservation.device_id
        ? this._permitLabelsByDeviceId.get(reservation.device_id)
        : null;
      const updateFields = this._getReservationUpdateFields(
        reservation.device_id,
      );
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const startValue = this._getReservationInputValue(
        reservation.reservation_id,
        "start",
        formatOptionalDateTimeLocal(reservation.start_time),
      );
      const endValue = this._getReservationInputValue(
        reservation.reservation_id,
        "end",
        formatOptionalDateTimeLocal(reservation.end_time),
      );
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
            <ha-textfield
              class="reservation-input active-reservation-start"
              data-reservation-id=${reservation.reservation_id}
              data-field="start"
              .label=${this._localize("field.start_time")}
              type="datetime-local"
              .value=${startValue}
              ?disabled=${controlsDisabled || !allowStart || isBusy}
              @input=${this._onReservationInput}
              @change=${this._onReservationChange}
              @click=${this._onPickerClick}
            ></ha-textfield>
            <ha-textfield
              class="reservation-input active-reservation-end"
              data-reservation-id=${reservation.reservation_id}
              data-field="end"
              .label=${this._localize("field.end_time")}
              type="datetime-local"
              .value=${endValue}
              ?disabled=${controlsDisabled || !allowEnd || isBusy}
              @input=${this._onReservationInput}
              @change=${this._onReservationChange}
              @click=${this._onPickerClick}
            ></ha-textfield>
          </div>
          <div class="active-reservation-actions">
            <ha-button
              class="active-reservation-end"
              data-reservation-id=${reservation.reservation_id}
              ?disabled=${controlsDisabled || isBusy}
            >
              ${this._localize("button.end_reservation")}
            </ha-button>
          </div>
        </div>
      `;
    }

    _handleActionClick(event: Event): void {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const endButton = target.closest<DisabledElement>(
        "ha-button.active-reservation-end",
      );
      if (endButton) {
        const reservationId = endButton.dataset.reservationId ?? "";
        void this._handleActiveReservationEnd(reservationId);
      }
    }

    _handleReservationInput(event: Event): void {
      const reservationField = this._getReservationField(event);
      if (!reservationField) {
        return;
      }
      const { reservationId, fieldKey, value } = reservationField;
      const current = this._reservationInputValues.get(reservationId) ?? {};
      this._reservationInputValues.set(reservationId, {
        ...current,
        [fieldKey]: value,
      });
    }

    _handleReservationChange(event: Event): void {
      if (this._isInEditor()) {
        return;
      }
      const reservationField = this._getReservationField(event);
      if (!reservationField) {
        return;
      }
      const { reservationId } = reservationField;
      this._handleReservationInput(event);
      void this._handleActiveReservationUpdate(reservationId);
    }

    _getReservationField(event: Event): {
      reservationId: string;
      fieldKey: "start" | "end";
      value: string;
    } | null {
      const target = event.target as ValueElement | null;
      if (!target) {
        return null;
      }
      const element = target as HTMLElement;
      const reservationId = element.dataset.reservationId ?? "";
      const field = element.dataset.field;
      if (!reservationId || (field !== "start" && field !== "end")) {
        return null;
      }
      const fieldKey: "start" | "end" = field === "start" ? "start" : "end";
      return { reservationId, fieldKey, value: target.value ?? "" };
    }

    _handlePickerClick(event: Event): void {
      showPicker(event, this._isInEditor());
    }

    _getReservationUpdateFields(deviceId: string | undefined): string[] {
      if (!deviceId) {
        return [];
      }
      return this._reservationUpdateFieldsByDevice[deviceId] ?? [];
    }

    _getReservationInputValue(
      reservationId: string,
      fieldKey: "start" | "end",
      fallback: string,
    ): string {
      const inputOverrides = this._reservationInputValues.get(reservationId);
      const override = inputOverrides?.[fieldKey];
      return override !== undefined ? override : fallback;
    }

    _setStatus(message: string, type: StatusType, clearAfterMs?: number): void {
      useStatusState(this._statusState, this._requestRender).set(
        message,
        type,
        clearAfterMs,
      );
    }

    _clearStatus(): void {
      useStatusState(this._statusState, this._requestRender).clear();
    }

    async _handleActiveReservationUpdate(reservationId: string): Promise<void> {
      if (!this._hass || !reservationId) {
        return;
      }
      const reservation = this._activeReservations.find(
        (item) => item.reservation_id === reservationId,
      );
      if (!reservation) {
        return;
      }
      const deviceId = reservation.device_id ?? "";
      if (!deviceId) {
        return;
      }
      if (this._reservationInFlight.has(reservationId)) {
        return;
      }
      this._reservationInFlight.add(reservationId);
      this._requestRender();
      const updateFields = this._getReservationUpdateFields(deviceId);
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      if (!allowStart && !allowEnd) {
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const startValue = allowStart
        ? this._getReservationInputValue(
            reservationId,
            "start",
            formatOptionalDateTimeLocal(reservation.start_time),
          ).trim()
        : "";
      const endValue = allowEnd
        ? this._getReservationInputValue(
            reservationId,
            "end",
            formatOptionalDateTimeLocal(reservation.end_time),
          ).trim()
        : "";
      if ((allowStart && !startValue) || (allowEnd && !endValue)) {
        this._setStatus(
          this._localize("message.start_end_required"),
          "warning",
        );
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const startDate = allowStart
        ? parseDateTimeValue(startValue)
        : parseDateTimeValue(reservation.start_time);
      const endDate = allowEnd
        ? parseDateTimeValue(endValue)
        : parseDateTimeValue(reservation.end_time);
      if ((allowStart && !startDate) || (allowEnd && !endDate)) {
        this._setStatus(
          this._localize("message.start_end_required"),
          "warning",
        );
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      if (startDate && endDate && endDate <= startDate) {
        this._setStatus(this._localize("message.end_before_start"), "warning");
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      try {
        const serviceData: Record<string, unknown> = {
          device_id: deviceId,
          reservation_id: reservationId,
        };
        if (allowStart && startDate) {
          serviceData.start_time = startDate.toISOString();
        }
        if (allowEnd && endDate) {
          serviceData.end_time = endDate.toISOString();
        }
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
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._setStatus(
        this._localize("message.reservation_updated"),
        "success",
        5000,
      );
      this._reservationInputValues.delete(reservationId);
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true, true);
    }

    async _handleActiveReservationEnd(reservationId: string): Promise<void> {
      if (!this._hass || !reservationId) {
        return;
      }
      const reservation = this._activeReservations.find(
        (item) => item.reservation_id === reservationId,
      );
      const deviceId = reservation?.device_id ?? "";
      if (!deviceId) {
        return;
      }
      if (this._reservationInFlight.has(reservationId)) {
        return;
      }
      this._reservationInFlight.add(reservationId);
      this._requestRender();
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
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._setStatus(
        this._localize("message.reservation_ended"),
        "success",
        5000,
      );
      this._reservationInputValues.delete(reservationId);
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }

    async _getConfigEntryTitles(): Promise<Map<string, string>> {
      if (!this._hass) {
        return new Map();
      }
      if (this._configEntriesPromise) {
        return this._configEntriesPromise;
      }
      const promise = fetchPermitTitleMap(this._hass)
        .then((entryTitles) => {
          this._configEntryTitleById = entryTitles;
          return this._configEntryTitleById;
        })
        .catch(() => {
          this._configEntryTitleById = new Map();
          return this._configEntryTitleById;
        })
        .finally(() => {
          this._configEntriesPromise = null;
        });
      this._configEntriesPromise = promise;
      return promise;
    }

    async _getDomainDevices(): Promise<DeviceEntry[]> {
      if (!this._hass) {
        return [];
      }
      if (this._devicesPromise) {
        return this._devicesPromise;
      }
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

    _isInEditor(): boolean {
      return isInEditor(this);
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
