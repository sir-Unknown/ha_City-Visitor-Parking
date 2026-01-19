import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import {
  BASE_CARD_STYLES,
  DOMAIN,
  PERMIT_PLACEHOLDER_VALUE,
  RESERVATION_STARTED_EVENT,
  buildPermitOptions,
  buildPermitTitleMap,
  clearStatusState,
  createErrorMessage,
  createLocalize,
  createRenderScheduler,
  createStatusState,
  fetchPermitEntries,
  formatOptionalDateTimeLocal,
  getCardText,
  getGlobalHass,
  getInvalidConfigError,
  isHassRunning,
  isInEditor,
  registerCustomCard,
  renderCardHeader,
  renderLoadingCard,
  renderStatusAlert,
  setStatusState,
  showPicker,
  type DeviceEntry,
  type HomeAssistant,
  type PermitOption,
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
    _permitOptions: PermitOption[];
    _permitOptionsLoaded: boolean;
    _permitOptionsLoading: boolean;
    _permitOptionsLoadPromise: Promise<void> | null;
    _selectedEntryId: string | null;
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
    _onPermitSelectChange: (event: Event) => void;

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
      this._permitOptions = [];
      this._permitOptionsLoaded = false;
      this._permitOptionsLoading = false;
      this._permitOptionsLoadPromise = null;
      this._selectedEntryId = null;
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
      this._onPermitSelectChange = (event: Event) =>
        this._handlePermitSelectChange(event);
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

    static getStubConfig(): CardConfig {
      return {
        type: `custom:${CARD_TYPE}`,
        title: getCardText("active_name"),
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw getInvalidConfigError(
          this._hass ?? getGlobalHass<HomeAssistant>(),
        );
      }
      this._config = { ...config };
      if (this._config.config_entry_id) {
        this._selectedEntryId = null;
      }
      this._requestRender();
      this._ensurePermitOptions();
      this._maybeSelectSinglePermit();
      void this._maybeLoadActiveReservations();
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      void ensureTranslations(this._hass).then(() => this.requestUpdate());
      this._requestRender();
      this._ensurePermitOptions();
      this._maybeSelectSinglePermit();
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
        this._permitLabelsByDeviceId =
          await this._getPermitLabelsByDeviceId(devices);
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
      const activeEntryId = this._getActiveEntryId();
      const showPermitPicker =
        !this._config.config_entry_id &&
        !(this._permitOptionsLoaded && this._permitOptions.length === 1);
      const permitPlaceholderKey = "message.select_permit";
      const permitPlaceholder = this._localize(permitPlaceholderKey);
      const permitPlaceholderText =
        permitPlaceholder === permitPlaceholderKey ? "" : permitPlaceholder;
      const permitSelectedText = activeEntryId
        ? this._permitOptions.find((entry) => entry.id === activeEntryId)
            ?.primary || activeEntryId
        : permitPlaceholderText;
      const permitSelectValue = activeEntryId ?? PERMIT_PLACEHOLDER_VALUE;
      const permitSelectDisabled =
        controlsDisabled || this._permitOptionsLoading;

      return html`
        <ha-card @click=${this._onActionClick}>
          ${renderCardHeader(title, icon, html, nothing)}
          <div class="card-content">
            ${showPermitPicker
              ? html`
                  <div class="row">
                    <ha-select
                      id="permitSelect"
                      .label=${this._localize("field.permit")}
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
      const showSpinner =
        this._activeReservationsLoading && !this._suppressLoadingIndicator;
      return html`
        <div class="row active-reservations">
          ${showSpinner
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
      const permitLabel = reservation.device_id
        ? this._permitLabelsByDeviceId.get(reservation.device_id)
        : null;
      const updateFields =
        reservation.device_id &&
        this._reservationUpdateFieldsByDevice[reservation.device_id]
          ? this._reservationUpdateFieldsByDevice[reservation.device_id]
          : [];
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const inputOverrides = this._reservationInputValues.get(
        reservation.reservation_id,
      );
      const startOverride = inputOverrides?.start;
      const endOverride = inputOverrides?.end;
      const startValue =
        startOverride !== undefined
          ? startOverride
          : formatOptionalDateTimeLocal(reservation.start_time);
      const endValue =
        endOverride !== undefined
          ? endOverride
          : formatOptionalDateTimeLocal(reservation.end_time);
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

    _handleReservationChange(event: Event): void {
      if (this._isInEditor()) {
        return;
      }
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
      this._handleReservationInput(event);
      void this._handleActiveReservationUpdate(reservationId);
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

    _handlePermitChange(value: string): void {
      const nextEntryId = value || null;
      if (nextEntryId === this._selectedEntryId) {
        return;
      }
      this._selectedEntryId = nextEntryId;
      this._activeReservationsLoadedFor = null;
      this._requestRender();
      void this._maybeLoadActiveReservations(true);
    }

    _handlePickerClick(event: Event): void {
      showPicker(event, this._isInEditor());
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
          : formatOptionalDateTimeLocal(reservation.start_time)
        : "";
      const endValue = allowEnd
        ? inputOverrides?.end !== undefined
          ? inputOverrides.end.trim()
          : formatOptionalDateTimeLocal(reservation.end_time)
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

    _ensurePermitOptions(): void {
      if (this._config?.config_entry_id || !this._hass) {
        return;
      }
      if (this._permitOptionsLoaded || this._permitOptionsLoadPromise) {
        return;
      }
      void this._loadPermitOptions();
    }

    _maybeSelectSinglePermit(): void {
      if (this._config?.config_entry_id) {
        return;
      }
      if (!this._permitOptionsLoaded || this._permitOptions.length !== 1) {
        return;
      }
      if (this._getActiveEntryId()) {
        return;
      }
      this._handlePermitChange(this._permitOptions[0].id);
    }

    async _loadPermitOptions(): Promise<void> {
      if (!this._hass || this._config?.config_entry_id) {
        return;
      }
      if (this._permitOptionsLoadPromise) {
        return this._permitOptionsLoadPromise;
      }
      this._permitOptionsLoading = true;
      this._requestRender();
      const loadPromise = (async () => {
        try {
          const result = await fetchPermitEntries(this._hass!);
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

    async _getPermitLabelsByDeviceId(
      devices: DeviceEntry[],
    ): Promise<Map<string, string>> {
      const entryTitles = await this._getConfigEntryTitles();
      const labels = new Map<string, string>();
      for (const device of devices) {
        const entryIds = Array.isArray(device.config_entries)
          ? device.config_entries
          : [];
        const entryId =
          entryIds.find((id) => entryTitles.has(id)) ?? entryIds[0];
        if (!entryId) {
          continue;
        }
        labels.set(device.id, entryTitles.get(entryId) ?? entryId);
      }
      return labels;
    }

    async _getConfigEntryTitles(): Promise<Map<string, string>> {
      if (!this._hass) {
        return new Map();
      }
      if (this._configEntriesPromise) {
        return this._configEntriesPromise;
      }
      const promise = fetchPermitEntries(this._hass)
        .then((entries) => {
          this._configEntryTitleById = buildPermitTitleMap(entries);
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
      this._devicesPromise = devicesPromise;
      return devicesPromise;
    }

    _getActiveEntryId(): string | null {
      return this._config?.config_entry_id || this._selectedEntryId;
    }

    _isInEditor(): boolean {
      return isInEditor(this);
    }
  }

  const registerCard = (): void => {
    registerCustomCard(
      CARD_TYPE,
      CityVisitorParkingActiveCard,
      getCardText("active_name"),
      getCardText("active_description"),
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
