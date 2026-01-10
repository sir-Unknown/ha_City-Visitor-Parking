import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { getActiveCardConfigForm } from "./city-visitor-parking-active-card-editor";
import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import {
  DOMAIN,
  errorMessage,
  formatDateTimeLocal,
  isInEditor,
  registerCustomCard,
} from "./card-shared";

(() => {
  const CARD_TYPE = "city-visitor-parking-active-card";
  const SERVICE_LIST_ACTIVE_RESERVATIONS = "list_active_reservations";
  const SERVICE_UPDATE_RESERVATION = "update_reservation";
  const SERVICE_END_RESERVATION = "end_reservation";

  type HomeAssistant = {
    callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
    callService: <T = unknown>(
      domain: string,
      service: string,
      data: Record<string, unknown>,
    ) => Promise<T>;
    localize?: LocalizeFunc;
    language?: string;
  };
  type DeviceEntry = {
    id: string;
    identifiers?: Array<[string, string]>;
    config_entries?: string[];
  };
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
        font-size: 0.85rem;
        color: var(--secondary-text-color);
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
    `;
    _config: CardConfig | null;
    _hass: HomeAssistant | null;
    _activeReservations: ActiveReservation[];
    _activeReservationsError: string | null;
    _activeReservationsLoadedFor: string | null;
    _activeReservationsLoading: boolean;
    _reservationUpdateFieldsByDevice: Record<string, string[]>;
    _devicesPromise: Promise<DeviceEntry[]> | null;
    _status: string;
    _statusType: "info" | "warning" | "success";
    _reservationStartedHandler: (() => void) | null;
    _renderHandle: number | null;
    _reservationInFlight: Set<string>;
    _reservationInputValues: Map<string, { start?: string; end?: string }>;
    _onActionClick: (event: Event) => void;
    _onReservationInput: (event: Event) => void;

    constructor() {
      super();
      this._config = null;
      this._hass = null;
      this._activeReservations = [];
      this._activeReservationsError = null;
      this._activeReservationsLoadedFor = null;
      this._activeReservationsLoading = false;
      this._reservationUpdateFieldsByDevice = {};
      this._devicesPromise = null;
      this._status = "";
      this._statusType = "info";
      this._reservationStartedHandler = null;
      this._renderHandle = null;
      this._reservationInFlight = new Set();
      this._reservationInputValues = new Map();
      this._onActionClick = (event: Event) => this._handleActionClick(event);
      this._onReservationInput = (event: Event) =>
        this._handleReservationInput(event);
    }

    connectedCallback(): void {
      super.connectedCallback();
      if (!this._reservationStartedHandler) {
        this._reservationStartedHandler = () => {
          void this._maybeLoadActiveReservations(true);
        };
      }
      window.addEventListener(
        "city-visitor-parking-reservation-started",
        this._reservationStartedHandler,
      );
    }

    disconnectedCallback(): void {
      if (this._reservationStartedHandler) {
        window.removeEventListener(
          "city-visitor-parking-reservation-started",
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

    static getStubConfig(): CardConfig {
      return {
        type: `custom:${CARD_TYPE}`,
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        const globalHass = (window as Window & { hass?: HomeAssistant }).hass;
        throw new Error(
          localize(this._hass ?? globalHass, "message.invalid_config"),
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

    async _maybeLoadActiveReservations(force = false): Promise<void> {
      if (!this._hass || !this._config) {
        return;
      }
      const target = this._config.config_entry_id ?? "all";
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
        if (this._config.config_entry_id) {
          devices = devices.filter((device) =>
            (device.config_entries ?? []).includes(
              this._config!.config_entry_id!,
            ),
          );
        }
        if (!devices.length) {
          this._activeReservations = [];
          this._activeReservationsLoadedFor = target;
          return;
        }
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
        this._requestRender();
      }
    }

    _requestRender(): void {
      if (this._renderHandle !== null) {
        return;
      }
      this._renderHandle = window.requestAnimationFrame(() => {
        this._renderHandle = null;
        this.requestUpdate();
      });
    }

    render(): TemplateResult {
      if (!this._config) {
        return html``;
      }

      const title = this._config.title || "";
      const icon = this._config.icon;
      const showHeader = Boolean(title || icon);
      const controlsDisabled = this._isInEditor();

      return html`
        <ha-card @click=${this._onActionClick}>
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
            ${this._renderActiveReservations(controlsDisabled)}
            ${this._status
              ? html`<ha-alert alert-type=${this._statusType}
                  >${this._status}</ha-alert
                >`
              : nothing}
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
          ${this._activeReservationsLoading
            ? html`
                <div class="row spinner">
                  <ha-spinner size="small"></ha-spinner>
                  <span
                    >${this._localize(
                      "message.loading_active_reservations",
                    )}</span
                  >
                </div>
              `
            : nothing}
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
      const updateFields =
        reservation.device_id &&
        this._reservationUpdateFieldsByDevice[reservation.device_id]
          ? this._reservationUpdateFieldsByDevice[reservation.device_id]
          : [];
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      const allowUpdate = allowStart || allowEnd;
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const inputOverrides = this._reservationInputValues.get(
        reservation.reservation_id,
      );
      const startOverride = inputOverrides?.start;
      const endOverride = inputOverrides?.end;
      const startValue =
        startOverride !== undefined
          ? startOverride
          : this._formatReservationDateTime(reservation.start_time);
      const endValue =
        endOverride !== undefined
          ? endOverride
          : this._formatReservationDateTime(reservation.end_time);
      return html`
        <div class="active-reservation">
          <div class="active-reservation-summary">
            <div class="active-reservation-heading">${identify}</div>
            ${license
              ? html`<div class="active-reservation-label">
                  ${this._localize("field.license_plate")}: ${license}
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
            ></ha-textfield>
          </div>
          <div class="active-reservation-actions">
            <ha-button
              class="active-reservation-update"
              data-reservation-id=${reservation.reservation_id}
              ?outlined=${true}
              ?disabled=${controlsDisabled || isBusy || !allowUpdate}
            >
              ${this._localize("button.update_reservation")}
            </ha-button>
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
      const updateButton = target.closest<DisabledElement>(
        "ha-button.active-reservation-update",
      );
      if (updateButton) {
        const reservationId = updateButton.dataset.reservationId ?? "";
        void this._handleActiveReservationUpdate(reservationId);
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
      const target = event.target as ValueElement | null;
      if (!target) {
        return;
      }
      const element = target as HTMLElement;
      const reservationId = element.dataset.reservationId ?? "";
      const field = element.dataset.field;
      if (!reservationId || (field !== "start" && field !== "end")) {
        return;
      }
      const fieldKey: "start" | "end" = field === "start" ? "start" : "end";
      const value = target.value ?? "";
      const current = this._reservationInputValues.get(reservationId) ?? {};
      this._reservationInputValues.set(reservationId, {
        ...current,
        [fieldKey]: value,
      });
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
      const updateFields =
        this._reservationUpdateFieldsByDevice[deviceId] ?? [];
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      if (!allowStart && !allowEnd) {
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const inputOverrides = this._reservationInputValues.get(reservationId);
      const startValue = allowStart
        ? inputOverrides?.start !== undefined
          ? inputOverrides.start.trim()
          : this._formatReservationDateTime(reservation.start_time)
        : "";
      const endValue = allowEnd
        ? inputOverrides?.end !== undefined
          ? inputOverrides.end.trim()
          : this._formatReservationDateTime(reservation.end_time)
        : "";
      if ((allowStart && !startValue) || (allowEnd && !endValue)) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const parseDate = (value: string | null | undefined): Date | null => {
        if (!value) {
          return null;
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const startDate = allowStart
        ? parseDate(startValue)
        : parseDate(reservation.start_time);
      const endDate = allowEnd
        ? parseDate(endValue)
        : parseDate(reservation.end_time);
      if ((allowStart && !startDate) || (allowEnd && !endDate)) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      if (startDate && endDate && endDate <= startDate) {
        this._status = this._localize("message.end_before_start");
        this._statusType = "warning";
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
        this._status = this._errorMessage(
          err,
          "message.reservation_update_failed",
        );
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._status = this._localize("message.reservation_updated");
      this._statusType = "success";
      this._reservationInputValues.delete(reservationId);
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
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
        this._status = this._errorMessage(
          err,
          "message.reservation_end_failed",
        );
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._status = this._localize("message.reservation_ended");
      this._statusType = "success";
      this._reservationInputValues.delete(reservationId);
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
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

    _localize(key: string, ..._args: Array<string | number>): string {
      return localize(this._hass, key);
    }

    _errorMessage(err: unknown, fallbackKey: string): string {
      return errorMessage(err, fallbackKey, this._localize.bind(this));
    }

    async _getDomainDevices(): Promise<DeviceEntry[]> {
      if (!this._hass) {
        return [];
      }
      if (this._devicesPromise) {
        return this._devicesPromise;
      }
      this._devicesPromise = this._hass
        .callWS<DeviceEntry[]>({ type: "config/device_registry/list" })
        .then((devices) =>
          devices.filter((device) =>
            (device.identifiers ?? []).some(
              (identifier: [string, string]) => identifier[0] === DOMAIN,
            ),
          ),
        )
        .finally(() => {
          this._devicesPromise = null;
        });
      return this._devicesPromise;
    }

    _isInEditor(): boolean {
      return isInEditor(this);
    }
  }

  registerCustomCard(
    CARD_TYPE,
    CityVisitorParkingActiveCard,
    localize(
      (window as Window & { hass?: { localize?: LocalizeFunc } }).hass,
      "active_name",
    ),
    localize(
      (window as Window & { hass?: { localize?: LocalizeFunc } }).hass,
      "active_description",
    ),
  );
})();
