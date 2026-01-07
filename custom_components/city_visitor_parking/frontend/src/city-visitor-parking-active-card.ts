import { getActiveCardConfigForm } from "./city-visitor-parking-active-card-editor";

(() => {
  const DOMAIN = "city_visitor_parking";
  const CARD_TYPE = "city-visitor-parking-active-card";
  const SERVICE_LIST_ACTIVE_RESERVATIONS = "list_active_reservations";
  const SERVICE_UPDATE_RESERVATION = "update_reservation";
  const SERVICE_END_RESERVATION = "end_reservation";
  const TRANSLATION_SECTION = "card";
  const TRANSLATION_PREFIX = `component.${DOMAIN}.${TRANSLATION_SECTION}`;
  const DEFAULT_STRINGS: Record<string, string> = {
    "field.license_plate": "License plate",
    "field.start_time": "Start time",
    "field.end_time": "End time",
    "section.active_reservations": "Active reservations",
    "button.update_reservation": "Update reservation",
    "button.end_reservation": "End reservation",
    "message.loading_active_reservations": "Loading active reservations",
    "message.no_active_reservations": "No active reservations",
    "message.active_reservations_failed": "Could not load active reservations",
    "message.start_end_required": "Start and end time are required.",
    "message.end_before_start": "End time must be after start time.",
    "message.reservation_updated": "Reservation updated.",
    "message.reservation_update_failed": "Could not update reservation.",
    "message.reservation_ended": "Reservation ended.",
    "message.reservation_end_failed": "Could not end reservation.",
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
    themes?: {
      themes?: Record<string, Record<string, string>>;
    };
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
    theme?: string;
    config_entry_id?: string;
  };
  type ValueElement = HTMLElement & { value?: string };
  type DisabledElement = HTMLElement & { disabled?: boolean };

  class CityVisitorParkingActiveCard extends HTMLElement {
    _config: CardConfig | null;
    _hass: HomeAssistant | null;
    _activeReservations: ActiveReservation[];
    _activeReservationsError: string | null;
    _activeReservationsLoadedFor: string | null;
    _activeReservationsLoading: boolean;
    _reservationUpdateFieldsByDevice: Record<string, string[]>;
    _devicesPromise: Promise<DeviceEntry[]> | null;
    _translationsPromise: Promise<unknown> | null;
    _status: string;
    _statusType: "info" | "warning" | "success";
    _appliedThemeVariables: string[];
    _appliedThemeName: string | null;
    _reservationStartedHandler: (() => void) | null;
    _renderHandle: number | null;
    _localizeEscapedFn: (key: string, ...args: Array<string | number>) => string;
    _reservationInFlight: Set<string>;
    _clickHandler: (event: Event) => void;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = null;
      this._hass = null;
      this._activeReservations = [];
      this._activeReservationsError = null;
      this._activeReservationsLoadedFor = null;
      this._activeReservationsLoading = false;
      this._reservationUpdateFieldsByDevice = {};
      this._devicesPromise = null;
      this._translationsPromise = null;
      this._status = "";
      this._statusType = "info";
      this._appliedThemeVariables = [];
      this._appliedThemeName = null;
      this._reservationStartedHandler = null;
      this._renderHandle = null;
      this._localizeEscapedFn = (key: string, ...args: Array<string | number>) =>
        this._escape(this._localize(key, ...args));
      this._reservationInFlight = new Set();
      this._clickHandler = (event: Event) => this._handleActionClick(event);
    }

    connectedCallback(): void {
      if (!this._reservationStartedHandler) {
        this._reservationStartedHandler = () => {
          void this._maybeLoadActiveReservations(true);
        };
      }
      window.addEventListener(
        "city-visitor-parking-reservation-started",
        this._reservationStartedHandler
      );
      this.shadowRoot?.addEventListener("click", this._clickHandler);
    }

    disconnectedCallback(): void {
      if (this._reservationStartedHandler) {
        window.removeEventListener(
          "city-visitor-parking-reservation-started",
          this._reservationStartedHandler
        );
      }
      this.shadowRoot?.removeEventListener("click", this._clickHandler);
    }

    static getConfigForm(): {
      readonly schema: ReadonlyArray<Record<string, unknown>>;
    } {
      return getActiveCardConfigForm();
    }

    static getStubConfig(): CardConfig {
      return {
        type: `custom:${CARD_TYPE}`,
      };
    }

    setConfig(config: CardConfig): void {
      if (!config || !config.type) {
        throw new Error("Invalid card config");
      }
      this._config = { ...config };
      this._applyTheme();
      void this._ensureTranslations();
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      void this._ensureTranslations();
      this._applyTheme();
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
            (device.config_entries ?? []).includes(this._config!.config_entry_id!)
          );
        }
        if (!devices.length) {
          this._activeReservations = [];
          this._activeReservationsLoadedFor = target;
          return;
        }
        const results = await Promise.all(
          devices.map((device) =>
            this._hass!.callWS<{
              active_reservations?: ActiveReservation[];
              response?: { active_reservations?: ActiveReservation[] };
              reservation_update_fields?: string[];
              response?: {
                active_reservations?: ActiveReservation[];
                reservation_update_fields?: string[];
              };
            }>({
              type: "call_service",
              domain: DOMAIN,
              service: SERVICE_LIST_ACTIVE_RESERVATIONS,
              return_response: true,
              service_data: {
                device_id: device.id,
              },
            })
          )
        );
        const collected: ActiveReservation[] = [];
        for (const [index, result] of results.entries()) {
          const device = devices[index];
          const activeReservations =
            result?.active_reservations || result?.response?.active_reservations;
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
              }))
            );
          }
        }
        this._activeReservations = collected;
        this._activeReservationsLoadedFor = target;
      } catch (err: unknown) {
        this._activeReservations = [];
        this._activeReservationsError = this._localize(
          "message.active_reservations_failed"
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
        this._render();
      });
    }

    _render(): void {
      if (!this.shadowRoot || !this._config) {
        return;
      }

      const title = this._config.title || "";
      const icon = this._config.icon;
      const showHeader = Boolean(title || icon);
      const controlsDisabled = this._isInEditor();
      const localize = this._localizeEscapedFn;

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
          .active-reservations {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .active-reservations-header {
            font-weight: 600;
            font-size: 1rem;
          }
          .active-reservation {
            border: 1px solid var(--divider-color, #e6e6e6);
            border-radius: 8px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .active-reservation-summary {
            display: flex;
            flex-direction: column;
            gap: 4px;
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
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 8px;
          }
          .reservation-input {
            width: 100%;
          }
          .active-reservation-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .active-reservation-end {
            margin-left: auto;
          }
          .active-reservations-empty {
            font-size: 0.9rem;
            color: var(--secondary-text-color);
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
            ${this._renderActiveReservations(localize, controlsDisabled)}
            ${this._status ? `
              <ha-alert alert-type="${this._statusType}">${this._escape(
                this._status
              )}</ha-alert>
            ` : ""}
          </div>
        </ha-card>
      `;
    }

    _renderActiveReservations(
      localize: (key: string, ...args: Array<string | number>) => string,
      controlsDisabled: boolean
    ): string {
      const hasReservations = this._activeReservations.length > 0;
      const showEmpty =
        !this._activeReservationsLoading &&
        !this._activeReservationsError &&
        !hasReservations;
      return `
        <div class="row active-reservations">
          ${
            this._activeReservationsLoading
              ? `
                <div class="row spinner">
                  <ha-spinner size="small"></ha-spinner>
                  <span>${localize("message.loading_active_reservations")}</span>
                </div>
              `
              : ""
          }
          ${
            this._activeReservationsError
              ? `
                <ha-alert alert-type="warning">${this._escape(
                  this._activeReservationsError
                )}</ha-alert>
              `
              : ""
          }
          ${
            showEmpty
              ? `<div class="active-reservations-empty">${localize(
                  "message.no_active_reservations"
                )}</div>`
              : ""
          }
          ${this._activeReservations
            .map((reservation) =>
              this._renderActiveReservation(localize, reservation, controlsDisabled)
            )
            .join("")}
        </div>
      `;
    }

    _renderActiveReservation(
      localize: (key: string, ...args: Array<string | number>) => string,
      reservation: ActiveReservation,
      controlsDisabled: boolean
    ): string {
      const name = reservation.name ?? reservation.favorite_name;
      const license = reservation.license_plate ?? "";
      const identify = name || license || reservation.reservation_id;
      const updateFields =
        reservation.device_id &&
        this._reservationUpdateFieldsByDevice[reservation.device_id]
          ? this._reservationUpdateFieldsByDevice[reservation.device_id]
          : ["start_time", "end_time"];
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const disabledAttr = controlsDisabled || isBusy ? "disabled" : "";
      const startDisabledAttr =
        controlsDisabled || !allowStart || isBusy ? "disabled" : "";
      const endDisabledAttr =
        controlsDisabled || !allowEnd || isBusy ? "disabled" : "";
      return `
        <div
          class="active-reservation"
          data-reservation-id="${this._escape(reservation.reservation_id)}"
          data-device-id="${this._escape(reservation.device_id ?? "")}"        
        >
          <div class="active-reservation-summary">
            <div class="active-reservation-heading">
              ${this._escape(identify ?? "")}
            </div>
            ${license ? `<div class="active-reservation-label">${localize(
              "field.license_plate"
            )}: ${this._escape(license)}</div>` : ""}
          </div>
          <div class="active-reservation-times">
            <ha-textfield
              class="reservation-input active-reservation-start"
              label="${localize("field.start_time")}"
              type="datetime-local"
              value="${this._escape(
                this._formatReservationDateTime(reservation.start_time)
              )}"
              ${startDisabledAttr}
            ></ha-textfield>
            <ha-textfield
              class="reservation-input active-reservation-end"
              label="${localize("field.end_time")}"
              type="datetime-local"
              value="${this._escape(
                this._formatReservationDateTime(reservation.end_time)
              )}"
              ${endDisabledAttr}
            ></ha-textfield>
          </div>
          <div class="active-reservation-actions">
            <ha-button
              class="active-reservation-update"
              data-reservation-id="${this._escape(reservation.reservation_id)}"
              outlined
              ${disabledAttr}
            >
              ${localize("button.update_reservation")}
            </ha-button>
            <ha-button
              class="active-reservation-end"
              data-reservation-id="${this._escape(reservation.reservation_id)}"
              ${disabledAttr}
            >
              ${localize("button.end_reservation")}
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
        ".active-reservation-update"
      );
      if (updateButton) {
        const reservationId = updateButton.dataset.reservationId ?? "";
        void this._handleActiveReservationUpdate(reservationId, updateButton);
        return;
      }
      const endButton = target.closest<DisabledElement>(
        ".active-reservation-end"
      );
      if (endButton) {
        const reservationId = endButton.dataset.reservationId ?? "";
        void this._handleActiveReservationEnd(reservationId, endButton);
      }
    }

    async _handleActiveReservationUpdate(
      reservationId: string,
      trigger: HTMLElement | null
    ): Promise<void> {
      if (!this._hass || !reservationId) {
        return;
      }
      const row = trigger?.closest<HTMLElement>(".active-reservation");
      if (!row) {
        return;
      }
      const deviceId = row.dataset.deviceId || "";
      if (!deviceId) {
        return;
      }
      if (this._reservationInFlight.has(reservationId)) {
        return;
      }
      this._reservationInFlight.add(reservationId);
      this._requestRender();
      const startInput =
        row.querySelector<ValueElement>(".active-reservation-start");
      const endInput =
        row.querySelector<ValueElement>(".active-reservation-end");
      const startValue = startInput?.value?.trim() ?? "";
      const endValue = endInput?.value?.trim() ?? "";
      if (!startValue || !endValue) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const startDate = new Date(startValue);
      const endDate = new Date(endValue);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      if (endDate <= startDate) {
        this._status = this._localize("message.end_before_start");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      try {
        await this._hass.callService(DOMAIN, SERVICE_UPDATE_RESERVATION, {
          device_id: deviceId,
          reservation_id: reservationId,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        });
      } catch (err: unknown) {
        this._status = this._localize("message.reservation_update_failed");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._status = this._localize("message.reservation_updated");
      this._statusType = "success";
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }

    async _handleActiveReservationEnd(
      reservationId: string,
      trigger: HTMLElement | null
    ): Promise<void> {
      if (!this._hass || !reservationId) {
        return;
      }
      const row = trigger?.closest<HTMLElement>(".active-reservation");
      const deviceId = row?.dataset.deviceId || "";
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
        this._status = this._localize("message.reservation_end_failed");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._status = this._localize("message.reservation_ended");
      this._statusType = "success";
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
      const pad = (valueToPad: number | string): string =>
        String(valueToPad).padStart(2, "0");
      const formatDate = (target: Date): string =>
        `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
          target.getDate()
        )}`;
      const formatDateTimeLocal = (target: Date): string =>
        `${formatDate(target)}T${pad(target.getHours())}:${pad(
          target.getMinutes()
        )}`;
      return formatDateTimeLocal(date);
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
              (identifier: [string, string]) => identifier[0] === DOMAIN
            )
          )
        )
        .finally(() => {
          this._devicesPromise = null;
        });
      return this._devicesPromise;
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
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  }

  if (!customElements.get(CARD_TYPE)) {
    customElements.define(CARD_TYPE, CityVisitorParkingActiveCard);
  }

  const win = window as Window & {
    customCards?: Array<{ type: string; name: string; description: string }>;
  };
  win.customCards = win.customCards || [];
  win.customCards.push({
    type: CARD_TYPE,
    name: "City visitor parking active",
    description: "Show active visitor parking reservations.",
  });
})();
