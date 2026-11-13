/** Shared frontend type definitions for cards, editors, and translations. */
export type LocalizeFunc = (
  key: string,
  ...args: Array<string | number>
) => string;

/** Value accepted anywhere frontend code can localize text. */
export type LocalizeTarget =
  | {
      localize?: LocalizeFunc;
      locale?: { language?: string };
      language?: string;
    }
  | LocalizeFunc
  | null
  | undefined;

/** Recursive JSON-like translation value used by the frontend cache. */
export type TranslationValue = string | TranslationObject;
/** Object shape used for loaded translation files. */
export interface TranslationObject {
  [key: string]: TranslationValue;
}

/** Minimal subset of the Home Assistant frontend object used by the cards. */
export type HomeAssistant = {
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

/** Home Assistant device entry fields needed for integration device routing. */
export type DeviceEntry = {
  id: string;
  name?: string | null;
  identifiers?: Array<[string, string]>;
  config_entry_id?: string;
};

/** One reservation, built by `reservation_payload()` in `payloads.py`. */
export type ReservationPayload = {
  reservation_id: string;
  /** UTC ISO8601 timestamps. */
  start_time: string;
  end_time: string;
  /** Absent when the provider returned no usable plate. */
  license_plate?: string;
  /** Present when the plate matches a favorite. */
  favorite_id?: string;
  favorite_name?: string;
  /** Parking area id, present only when the reservation has a parking area. */
  parking_area_id?: string;
  /** Parking area display name (falls back to the id server-side), with `parking_area_id`. */
  parking_area_name?: string;
  /** Paid window of the reservation's parking area that applies to it, when known. */
  parking_area_paid_start?: string;
  parking_area_paid_end?: string;
};

/**
 * Reservations of one permit, built by `build_reservations_payload()` in
 * `payloads.py`. Returned by the `list_reservations` service (which fetches
 * from the provider first) and by the `city_visitor_parking/reservations`
 * websocket command (which returns the coordinator data as is).
 */
export type ReservationsResponse = {
  /** Reservations that have not ended yet; `count` is their number. */
  reservations: ReservationPayload[];
  count: number;
  active_count: number;
  future_count: number;
  /** True when the last coordinator update failed and the data is older. */
  stale: boolean;
  /** Reservation fields the provider can update natively. */
  reservation_update_fields: string[];
};

/** Config entry fields used for permit selection in the frontend. */
export type PermitEntry = {
  entry_id: string;
  title?: string | null;
  state?: string | null;
  disabled_by?: string | null;
};

/** Display-ready permit option for selector components. */
export type PermitOption = {
  id: string;
  label: string;
  disabled: boolean;
};

/** Lightweight favorite data accepted by form and selector helpers. */
export type FavoriteOption = {
  id?: string;
  license_plate?: string;
  name?: string;
};
/** Favorite payload shape returned by service and websocket responses. */
export type FavoriteItem = FavoriteOption & {
  [key: string]: unknown;
};

/** Normalized parking area status state consumed by the reservation card UI. */
export type PaidParkingStatus = {
  state: "paid" | "free" | null;
  kind: "current" | "next" | null;
  start: string | null;
  end: string | null;
  remainingMinutes: number | null;
  balanceUnit: string | null;
};

/**
 * One entry of `PaidParkingStatusResponse.parking_areas`.
 *
 * State and window fields are computed exactly like the top-level
 * `PaidParkingStatusResponse` fields (weekday overrides applied), so an entry can
 * replace them when displaying the status of that parking area.
 */
export type ParkingAreaStatus = {
  /** Opaque provider parking area id; send back unchanged as `parking_area_id`. */
  parking_area_id: string;
  /** Display name of the parking area. */
  name: string;
  /** Current effective state of this parking area. */
  state: "paid" | "free";
  /** Kind of the window referenced by `window_start`/`window_end`. */
  window_kind: "current" | "next" | null;
  /** UTC ISO8601 start timestamp of the effective window, or `null`. */
  window_start: string | null;
  /** UTC ISO8601 end timestamp of the effective window, or `null`. */
  window_end: string | null;
  /** UTC ISO8601 timestamp of the next state change, or `null`. */
  next_change_time: string | null;
};

/**
 * Payload returned by the Python websocket handler `city_visitor_parking/status`.
 *
 * `build_status_payload()` in `payloads.py` always returns this full key set.
 * Fields use `null` when a value is intentionally unavailable, instead of
 * omitting the key entirely.
 */
export type PaidParkingStatusResponse = {
  /**
   * Current effective parking area state after applying weekday overrides.
   * Guaranteed to be `"paid"` or `"free"`.
   */
  state: "paid" | "free";

  /**
   * Describes the effective window referenced by `window_start`/`window_end`.
   * `"current"` is only returned while the parking area is paid right now.
   * `"next"` is only returned while the parking area is currently free and a next
   * paid window exists today or later.
   * `null` means there is no relevant current/next effective window.
   */
  window_kind: "current" | "next" | null;

  /**
   * UTC ISO8601 start timestamp for the effective window selected by
   * `window_kind`, or `null` when no effective window is available.
   */
  window_start: string | null;

  /**
   * UTC ISO8601 end timestamp for the effective window selected by
   * `window_kind`, or `null` when no effective window is available.
   */
  window_end: string | null;

  /**
   * Non-negative remaining permit balance.
   * `build_status_payload()` clamps this value to `0` or higher.
   */
  remaining_balance: number;

  /**
   * Permit balance unit from coordinator data, or `null` when the provider
   * does not expose a string balance unit.
   */
  balance_unit: string | null;

  /**
   * Parking areas the permit can park in. The first entry is the provider's default
   * parking area, which the top-level state and window fields describe. Empty when
   * the provider or permit exposes no parking areas.
   */
  parking_areas: ParkingAreaStatus[];
};

/** HTMLElement variant used for simple input-like value access. */
export type ValueElement = HTMLElement & { value?: string };
/** Progress-button instance with imperative success and error helpers. */
export type ProgressButtonElement = HTMLElement & {
  actionSuccess?: () => void;
  actionError?: () => void;
};

/** Severity levels for temporary in-card status messaging. */
export type StatusType = "info" | "warning" | "success";
/** Mutable status state stored on base card classes. */
export type StatusState = {
  message: string;
  type: StatusType;
  clearHandle: number | null;
};

/** Home Assistant card-picker element shape used for runtime patching. */
export type PickerCtor = CustomElementConstructor & {
  prototype: {
    _loadCards?: () => void;
    __cvpHidePatched?: boolean;
    __cvpHideTypes?: Set<string>;
  };
};

/** Minimal form schema entry used by label/helper resolvers. */
export type FormSchema = { name: string };
/** Select-option tuple consumed by Home Assistant selector definitions. */
export type SelectOption = [string, string];

/** Config shape for the new-reservation Lovelace card editor. */
export type ParkingCardEditorConfig = {
  type: string;
  title?: string;
  icon?: string;
  show_name?: boolean;
  show_favorites?: boolean;
  show_start_time?: boolean;
  show_end_time?: boolean;
  default_license_plate?: string;
  config_entry_id?: string;
  parking_area_id?: string;
  show_parking_area?: boolean;
};

/** Generic schema payload returned to Lovelace card config forms. */
export type CardEditorFormSchema = ReadonlyArray<Record<string, unknown>>;

/** Config shape for the active-reservations Lovelace card editor. */
export type ActiveParkingCardEditorConfig = {
  type: string;
  title?: string;
  icon?: string;
  config_entry_id?: string;
};
