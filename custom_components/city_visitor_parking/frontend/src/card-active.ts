/** Lovelace card for listing and updating active visitor parking reservations. */
import { css, html, nothing, type TemplateResult } from "lit";
import type { DeviceEntry, HomeAssistant, ValueElement } from "./types";
import { ensureTranslations, getGlobalHass, localize } from "./translations";
import {
  DOMAIN,
  RESERVATION_ENDED_EVENT,
  RESERVATION_STARTED_EVENT,
  buildPermitTitleMap,
  fetchPermitEntries,
  filterDomainDevices,
  formatOptionalDateTimeLocal,
  getConfigEntryId,
  isHassRunning,
  makeDedupedLoader,
  normalizePlateValue,
  parseDateTimeValue,
  resolvePermitLabelsByDevice,
} from "./helpers";
import {
  BASE_CARD_STYLES,
  renderCardHeader,
  renderLoadingCard,
  triggerProgressButtonFeedback,
} from "./ui";
import {
  BaseLocalizedCard,
  hideCustomCardFromPicker,
  registerCustomCardWithTranslations,
} from "./base";
import { getActiveCardConfigForm } from "./editor-active";

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

/** Interactive card that shows active reservations for the selected permit. */
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
  _reservationInputValues = new Map<string, { start?: string; end?: string }>();
  _onActionClick = (event: Event) => this._handleActionClick(event);
  _onReservationInput = (event: Event) => this._handleReservationInput(event);
  _onReservationChange = (event: Event) => this._handleReservationChange(event);

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
      for (const reservationId of [...this._endButtonSuccessByReservationId]) {
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
    const updateFlags = this._getReservationUpdateFlags(reservation.device_id);
    const allowStart = Boolean(updateFlags & UPDATE_START_FLAG);
    const allowEnd = Boolean(updateFlags & UPDATE_END_FLAG);
    const isBusy = this._reservationInFlight.has(reservation.reservation_id);
    const endButtonSuccess = this._endButtonSuccessByReservationId.has(
      reservation.reservation_id,
    );
    const startValue =
      this._getReservationInputOverride(reservation.reservation_id, "start") ??
      formatOptionalDateTimeLocal(reservation.start_time);
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
      this._endButtonSuccessResolverByReservationId.set(reservationId, resolve);
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
    window.dispatchEvent(
      new CustomEvent(RESERVATION_ENDED_EVENT, {
        detail: {
          device_id: deviceId,
        },
      }),
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
