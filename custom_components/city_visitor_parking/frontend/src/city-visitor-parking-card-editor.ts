import { html, LitElement, type TemplateResult } from "lit";
import { DOMAIN, getGlobalHass, type HomeAssistant } from "./card-shared";
import {
  buildCardTypeOptions,
  buildFormHelpers,
  type FormSchema,
} from "./card-editor-shared";
import type { LocalizeFunc } from "./localize";
import { ensureTranslations } from "./localize";

type CardConfig = {
  type: string;
  title?: string;
  icon?: string;
  show_favorites?: boolean;
  show_start_time?: boolean;
  show_end_time?: boolean;
  config_entry_id?: string;
};

type FormSchemaConfig = ReadonlyArray<Record<string, unknown>>;

const buildSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
): FormSchemaConfig => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-card",
    options: cardTypeOptions,
  },
  {
    name: "title",
    selector: { text: {} },
    required: false,
  },
  {
    name: "icon",
    selector: { icon: {} },
    required: false,
  },
  {
    type: "expandable",
    name: "display_options",
    expanded: displayOptionsExpanded,
    flatten: true,
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false,
      },
      {
        name: "show_favorites",
        selector: { boolean: {} },
        default: true,
      },
      {
        name: "show_start_time",
        selector: { boolean: {} },
        default: true,
      },
      {
        name: "show_end_time",
        selector: { boolean: {} },
        default: true,
      },
    ],
  },
];

export class CityVisitorParkingCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  public hass?: HomeAssistant;
  private _config?: CardConfig;

  setConfig(config: CardConfig): void {
    this._config = config;
  }

  private _handleValueChanged(ev: CustomEvent<{ value: CardConfig }>): void {
    ev.stopPropagation();
    this._config = ev.detail.value;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: ev.detail.value },
      }),
    );
  }

  protected render(): TemplateResult {
    if (!this.hass) {
      return html``;
    }
    const localizeTarget = this.hass;
    void ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      "editor",
    );
    const cardTypeOptions = buildCardTypeOptions(localizeTarget, "editor");
    const displayOptionsExpanded = Boolean(
      this._config?.config_entry_id ||
      this._config?.show_favorites === false ||
      this._config?.show_start_time === false ||
      this._config?.show_end_time === false,
    );
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildSchema(cardTypeOptions, displayOptionsExpanded)}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
}

customElements.define(
  "city-visitor-parking-card-editor",
  CityVisitorParkingCardEditor,
);

export const getCardConfigForm = async (
  hassOrLocalize?: HomeAssistant | LocalizeFunc,
): Promise<{
  readonly schema: ReadonlyArray<Record<string, unknown>>;
  readonly computeLabel: (schema: FormSchema) => string;
  readonly computeHelper: (schema: FormSchema) => string;
}> => {
  const localizeTarget =
    hassOrLocalize && typeof hassOrLocalize !== "function"
      ? hassOrLocalize
      : (getGlobalHass<HomeAssistant>() ?? hassOrLocalize);
  await ensureTranslations(localizeTarget);
  const { computeLabel, computeHelper } = buildFormHelpers(
    localizeTarget,
    "editor",
  );
  const cardTypeOptions = buildCardTypeOptions(localizeTarget, "editor");
  return {
    schema: buildSchema(cardTypeOptions, false),
    computeLabel,
    computeHelper,
  };
};
