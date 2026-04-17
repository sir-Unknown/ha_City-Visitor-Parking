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
  config_entries?: string[];
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

/** Normalized zone status state consumed by the reservation card UI. */
export type ZoneStatus = {
  state: "chargeable" | "free" | null;
  kind: "current" | "next" | null;
  start: string | null;
  end: string | null;
  remainingMinutes: number | null;
  balanceUnit: string | null;
};

/**
 * Payload returned by the Python websocket handler `city_visitor_parking/status`.
 *
 * `build_status_payload()` in `payloads.py` always returns this full key set.
 * Fields use `null` when a value is intentionally unavailable, instead of
 * omitting the key entirely.
 */
export type ZoneStatusResponse = {
  /**
   * Current effective zone state after applying weekday overrides.
   * Guaranteed to be `"chargeable"` or `"free"`.
   */
  state: "chargeable" | "free";

  /**
   * Describes the effective window referenced by `window_start`/`window_end`.
   * `"current"` is only returned while the zone is chargeable right now.
   * `"next"` is only returned while the zone is currently free and a next
   * chargeable window exists today or later.
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
   * Non-negative remaining permit balance in minutes.
   * `build_status_payload()` clamps this value to `0` or higher.
   */
  remaining_minutes: number;

  /**
   * Permit balance unit from coordinator data, or `null` when the provider
   * does not expose a string balance unit.
   */
  balance_unit: string | null;
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
