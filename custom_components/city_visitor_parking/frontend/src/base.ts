/** Shared Lit base classes and registration helpers for the custom cards. */
import { LitElement } from "lit";
import type {
  HomeAssistant,
  LocalizeTarget,
  PickerCtor,
  StatusType,
} from "./types";
import {
  ensureTranslations,
  getGlobalHass,
  createLocalize,
} from "./translations";
import { createErrorMessage } from "./helpers";
import {
  createStatusState,
  clearStatusState,
  setStatusState,
  getCardText,
} from "./ui";

export { LitElement };

/** Batches repeated update requests into a single animation frame. */
export const createRenderScheduler = (
  requestUpdate: () => void,
): (() => void) => {
  let handle: number | null = null;
  return () => {
    if (handle !== null) return;
    handle = window.requestAnimationFrame(() => {
      handle = null;
      requestUpdate();
    });
  };
};

/** Detects whether a node is rendered inside a Lovelace card editor context. */
export const isInEditor = (startNode: Node): boolean => {
  const selector =
    "hui-card-preview, hui-card-picker, hui-card-element-editor, " +
    "hui-card-edit-mode, hui-dialog-edit-card";
  let node: Node | null = startNode;
  while (node) {
    if (node instanceof HTMLElement && node.matches(selector)) return true;
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

/** Base class for cards that need localized text and shared status messaging. */
export abstract class BaseLocalizedCard<TConfig> extends LitElement {
  _config: TConfig | null = null;
  _hass: HomeAssistant | null = null;
  _statusState = createStatusState();
  _requestRender = createRenderScheduler(() => this.requestUpdate());
  _localize = createLocalize(() => this._hass);
  _errorMessage = createErrorMessage(() => this._hass);

  _setStatus(message: string, type: StatusType, clearAfterMs?: number): void {
    setStatusState(
      this._statusState,
      message,
      type,
      this._requestRender,
      clearAfterMs,
    );
  }

  _clearStatus(): void {
    clearStatusState(this._statusState, this._requestRender);
  }

  _isInEditor(): boolean {
    return isInEditor(this);
  }
}

/** Defines a custom element in the active registries when it is still missing. */
export const defineElementIfMissing = (
  tagName: string,
  ctor: CustomElementConstructor,
): void => {
  const scopedRegistry = (
    window as Window & { __scopedElementsRegistry?: CustomElementRegistry }
  ).__scopedElementsRegistry;
  for (const registry of [customElements, scopedRegistry]) {
    if (registry && !registry.get(tagName)) registry.define(tagName, ctor);
  }
};

/** Registers a Lovelace custom card and keeps its picker metadata up to date. */
export const registerCustomCard = (
  cardType: string,
  ctor: CustomElementConstructor,
  name: string,
  description: string,
): void => {
  defineElementIfMissing(cardType, ctor);
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

/** Registers a custom card using translated picker labels when available. */
export const registerCustomCardWithTranslations = (
  cardType: string,
  ctor: CustomElementConstructor,
  nameKey: string,
  descriptionKey: string,
): void => {
  const registerCard = (): void => {
    const name = getCardText(nameKey) ?? cardType;
    const description = descriptionKey
      ? (getCardText(descriptionKey) ?? "")
      : "";
    registerCustomCard(cardType, ctor, name, description);
  };
  // Register immediately so Lovelace can instantiate the element before
  // translations finish loading; then refresh picker metadata when ready.
  registerCard();
  const hass = getGlobalHass<HomeAssistant>();
  void ensureTranslations(hass).then(registerCard);
};

/** Hides a card type from the Lovelace picker without affecting existing cards. */
export const hideCustomCardFromPicker = (cardType: string): void => {
  const applyPatch = (pickerCtor: PickerCtor): void => {
    const { prototype } = pickerCtor;
    if (!prototype.__cvpHideTypes) prototype.__cvpHideTypes = new Set();
    prototype.__cvpHideTypes.add(cardType);
    if (prototype.__cvpHidePatched) return;
    const originalLoadCards = prototype._loadCards;
    if (!originalLoadCards) return;
    prototype._loadCards = function () {
      originalLoadCards.call(this);
      const hideTypes = prototype.__cvpHideTypes;
      if (Array.isArray((this as { _cards?: unknown })._cards)) {
        (this as { _cards: Array<{ card?: { type?: string } }> })._cards = (
          this as { _cards: Array<{ card?: { type?: string } }> }
        )._cards.filter((entry) => !hideTypes?.has(entry.card?.type ?? ""));
      }
    };
    prototype.__cvpHidePatched = true;
  };
  const existing = customElements.get("hui-card-picker") as
    | PickerCtor
    | undefined;
  if (existing) {
    applyPatch(existing);
  } else {
    customElements
      .whenDefined("hui-card-picker")
      .then(() =>
        applyPatch(customElements.get("hui-card-picker") as PickerCtor),
      );
  }
};

/** Base class for lightweight card editors backed by `ha-form`. */
export abstract class BaseCardEditor<TConfig> extends LitElement {
  public hass?: unknown;
  protected _config?: TConfig;

  setConfig(config: TConfig): void {
    this._config = config;
    this.requestUpdate();
  }

  protected _handleValueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const config = ev.detail?.value ?? {};
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

export type { LocalizeTarget };
