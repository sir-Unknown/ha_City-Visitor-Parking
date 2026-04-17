export type LocalizeFunc = (
  key: string,
  ...args: Array<string | number>
) => string;

export type LocalizeTarget =
  | {
      localize?: LocalizeFunc;
      locale?: { language?: string };
      language?: string;
    }
  | LocalizeFunc
  | null
  | undefined;

export type TranslationValue = string | TranslationObject;
export interface TranslationObject {
  [key: string]: TranslationValue;
}

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

export type DeviceEntry = {
  id: string;
  name?: string | null;
  identifiers?: Array<[string, string]>;
  config_entries?: string[];
};

export type PermitEntry = {
  entry_id: string;
  title?: string | null;
  state?: string | null;
  disabled_by?: string | null;
};

export type PermitOption = {
  id: string;
  label: string;
  disabled: boolean;
};

export type FavoriteOption = {
  id?: string;
  license_plate?: string;
  name?: string;
};
export type FavoriteItem = FavoriteOption & {
  [key: string]: unknown;
};

export type ZoneStatus = {
  state: "chargeable" | "free" | null;
  kind: "current" | "next" | null;
  start: string | null;
  end: string | null;
  remainingMinutes: number | null;
  balanceUnit: string | null;
};

export type ValueElement = HTMLElement & { value?: string };
export type ProgressButtonElement = HTMLElement & {
  actionSuccess?: () => void;
  actionError?: () => void;
};

export type StatusType = "info" | "warning" | "success";
export type StatusState = {
  message: string;
  type: StatusType;
  clearHandle: number | null;
};

export type PickerCtor = CustomElementConstructor & {
  prototype: {
    _loadCards?: () => void;
    __cvpHidePatched?: boolean;
    __cvpHideTypes?: Set<string>;
  };
};

export type FormSchema = { name: string };
export type SelectOption = [string, string];

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

export type CardEditorFormSchema = ReadonlyArray<Record<string, unknown>>;

export type ActiveParkingCardEditorConfig = {
  type: string;
  title?: string;
  icon?: string;
  config_entry_id?: string;
};

// ZoneStatusResponse: shape of the payload returned by the Python
// websocket handler city_visitor_parking/status (see payloads.py build_status_payload).
export type ZoneStatusResponse = {
  state?: string | null;
  window_kind?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  remaining_minutes?: number | null;
  balance_unit?: string | null;
};
