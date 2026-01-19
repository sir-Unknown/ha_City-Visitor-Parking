import { css, type TemplateResult } from "lit";
import type { LocalizeFunc } from "./localize";
import { localize } from "./localize";

export const DOMAIN = "city_visitor_parking";
export const RESERVATION_STARTED_EVENT =
  "city-visitor-parking-reservation-started";

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
  identifiers?: Array<[string, string]>;
  config_entries?: string[];
};

export type PermitEntry = {
  entry_id: string;
  title?: string | null;
};

export type PermitOption = {
  id: string;
  primary: string;
  secondary: string;
};

export const PERMIT_PLACEHOLDER_VALUE = "__permit_placeholder__";

export type StatusType = "info" | "warning" | "success";
export type StatusState = {
  message: string;
  type: StatusType;
  clearHandle: number | null;
};

export const createStatusState = (): StatusState => ({
  message: "",
  type: "info",
  clearHandle: null,
});

export const BASE_CARD_STYLES = css`
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
    gap: var(--entities-card-row-gap, var(--card-row-gap, var(--ha-space-2)));
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

const splitPermitLabel = (
  label: string,
  entryId: string,
): { primary: string; secondary: string } => {
  const trimmed = label.trim();
  if (!trimmed) {
    return { primary: entryId, secondary: "" };
  }
  const parts = trimmed
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return { primary: parts[0], secondary: parts.slice(1).join(" - ") };
  }
  if (trimmed !== entryId) {
    return { primary: trimmed, secondary: entryId };
  }
  return { primary: trimmed, secondary: "" };
};

export const buildPermitOptions = (entries: PermitEntry[]): PermitOption[] =>
  entries
    .map((entry) => {
      const label = entry.title || entry.entry_id;
      const { primary, secondary } = splitPermitLabel(label, entry.entry_id);
      return {
        id: entry.entry_id,
        primary,
        secondary,
      };
    })
    .sort(
      (first, second) =>
        first.primary.localeCompare(second.primary) ||
        first.secondary.localeCompare(second.secondary),
    );

export const buildPermitTitleMap = (
  entries: PermitEntry[],
): Map<string, string> =>
  new Map(
    entries.map((entry) => [entry.entry_id, entry.title || entry.entry_id]),
  );

export const fetchPermitEntries = async (
  hass: HomeAssistant,
): Promise<PermitEntry[]> =>
  hass.callWS<PermitEntry[]>({
    type: "config_entries/get",
    type_filter: ["device", "hub", "service"],
    domain: DOMAIN,
  });

const errorMessage = (
  err: unknown,
  fallbackKey: string,
  localizeFn: (key: string, ...args: Array<string | number>) => string,
): string => {
  const message = (err as { message?: unknown })?.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  const dataMessage = (err as { data?: { message?: unknown } })?.data?.message;
  if (typeof dataMessage === "string" && dataMessage.trim()) {
    return dataMessage;
  }
  return localizeFn(fallbackKey);
};

export const pad = (value: number | string): string =>
  String(value).padStart(2, "0");

export const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const formatTime = (date: Date): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

export const formatDateTimeLocal = (date: Date): string =>
  `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

type LocalizeTarget = Parameters<typeof localize>[0];
export type HtmlRenderer = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => TemplateResult;

const HA_STARTING_MESSAGE_KEY = "ui.panel.lovelace.warning.starting";
const HA_STATE_NOT_RUNNING = "NOT_RUNNING";

export const getGlobalHass = <T>(): T | undefined =>
  (window as Window & { hass?: T }).hass;

export const getCardText = (key: string): string => {
  const value = localize(getGlobalHass<LocalizeTarget>(), key);
  return value === key ? "" : value;
};

export const renderCardHeader = (
  title: string,
  icon: string | undefined,
  html: HtmlRenderer,
  nothingValue: unknown,
): unknown => {
  if (!title && !icon) {
    return nothingValue;
  }
  return html`
    <h1 class="card-header">
      <div class="name">
        ${icon
          ? html`<ha-icon class="icon" .icon=${icon}></ha-icon>`
          : nothingValue}
        ${title}
      </div>
    </h1>
  `;
};

export const localizeCard = (
  hass: LocalizeTarget | null | undefined,
  key: string,
): string => localize(hass, key);

export const errorMessageFrom = (
  hass: LocalizeTarget | null | undefined,
  err: unknown,
  fallbackKey: string,
): string => errorMessage(err, fallbackKey, (key) => localize(hass, key));

export const createLocalize = (
  getHass: () => LocalizeTarget | null | undefined,
): ((key: string, ...args: Array<string | number>) => string) => {
  return (key: string, ..._args: Array<string | number>) =>
    localize(getHass(), key);
};

export const createErrorMessage = (
  getHass: () => LocalizeTarget | null | undefined,
): ((err: unknown, fallbackKey: string) => string) => {
  return (err: unknown, fallbackKey: string) =>
    errorMessageFrom(getHass(), err, fallbackKey);
};

export const getInvalidConfigError = (
  hass: LocalizeTarget | null | undefined,
): Error => new Error(localize(hass, "message.invalid_config"));

export const getLoadingMessage = (
  hass: LocalizeTarget | null | undefined,
): string => {
  const hassLocalize = typeof hass === "function" ? hass : hass?.localize;
  const haMessage = hassLocalize?.(HA_STARTING_MESSAGE_KEY);
  if (haMessage && haMessage !== HA_STARTING_MESSAGE_KEY) {
    return haMessage;
  }
  const key = "message.home_assistant_loading";
  const message = localize(hass, key);
  return message === key ? "" : message;
};

export const renderLoadingCard = (
  hass: LocalizeTarget | null | undefined,
  html: HtmlRenderer,
): TemplateResult => {
  const loadingMessage = getLoadingMessage(
    hass ?? getGlobalHass<LocalizeTarget>(),
  );
  return html`
    <ha-card>
      <div class="card-content">
        <ha-alert alert-type="warning">${loadingMessage}</ha-alert>
      </div>
    </ha-card>
  `;
};

export const setStatusState = (
  state: StatusState,
  message: string,
  type: StatusType,
  requestRender: () => void,
  clearAfterMs?: number,
): void => {
  if (state.clearHandle !== null) {
    window.clearTimeout(state.clearHandle);
    state.clearHandle = null;
  }
  state.message = message;
  state.type = type;
  if (clearAfterMs) {
    state.clearHandle = window.setTimeout(() => {
      state.clearHandle = null;
      state.message = "";
      state.type = "info";
      requestRender();
    }, clearAfterMs);
  }
};

export const clearStatusState = (
  state: StatusState,
  requestRender: () => void,
): void => {
  if (state.clearHandle !== null) {
    window.clearTimeout(state.clearHandle);
    state.clearHandle = null;
  }
  if (!state.message && state.type === "info") {
    return;
  }
  state.message = "";
  state.type = "info";
  requestRender();
};

export const renderStatusAlert = (
  state: StatusState,
  html: HtmlRenderer,
  nothingValue: unknown,
): unknown =>
  state.message
    ? html`<ha-alert alert-type=${state.type}>${state.message}</ha-alert>`
    : nothingValue;

export const formatOptionalDateTimeLocal = (
  value: string | undefined | null,
): string => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return formatDateTimeLocal(date);
};

type HassState = { config?: { state?: string } };

export const isHassRunning = (hass: HassState | null | undefined): boolean =>
  hass?.config?.state === "RUNNING";

export const isHassStarting = (hass: HassState | null | undefined): boolean =>
  hass?.config?.state === HA_STATE_NOT_RUNNING;

export const scheduleRender = (
  handle: number | null,
  setHandle: (handle: number | null) => void,
  requestUpdate: () => void,
): void => {
  if (handle !== null) {
    return;
  }
  const nextHandle = window.requestAnimationFrame(() => {
    setHandle(null);
    requestUpdate();
  });
  setHandle(nextHandle);
};

export const createRenderScheduler = (
  requestUpdate: () => void,
): (() => void) => {
  let handle: number | null = null;
  return () =>
    scheduleRender(
      handle,
      (nextHandle) => {
        handle = nextHandle;
      },
      requestUpdate,
    );
};

export const showPicker = (event: Event, isInEditor: boolean): void => {
  if (isInEditor) {
    return;
  }
  const target = event.currentTarget as
    | (HTMLElement & { inputElement?: HTMLInputElement })
    | null;
  if (!target) {
    return;
  }
  const inputElement =
    target.inputElement ?? target.shadowRoot?.querySelector("input");
  (
    inputElement as (HTMLInputElement & { showPicker?: () => void }) | null
  )?.showPicker?.();
};

export const isInEditor = (startNode: Node): boolean => {
  const selector =
    "hui-card-preview, hui-card-picker, hui-card-element-editor, " +
    "hui-card-edit-mode, hui-dialog-edit-card";
  let node: Node | null = startNode;
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
};

export const registerCustomCard = (
  cardType: string,
  ctor: CustomElementConstructor,
  name: string,
  description: string,
): void => {
  const scopedRegistry = (
    window as Window & { __scopedElementsRegistry?: CustomElementRegistry }
  ).__scopedElementsRegistry;
  const registries = new Set(
    [customElements, scopedRegistry].filter(
      (registry): registry is CustomElementRegistry => Boolean(registry),
    ),
  );
  for (const registry of registries) {
    if (!registry.get(cardType)) {
      registry.define(cardType, ctor);
    }
  }

  const win = window as Window & {
    customCards?: Array<{ type: string; name: string; description: string }>;
  };
  win.customCards = win.customCards || [];
  const existing = win.customCards.find((card) => card.type === cardType);
  if (existing) {
    existing.name = name;
    existing.description = description;
    return;
  }
  win.customCards.push({ type: cardType, name, description });
};
