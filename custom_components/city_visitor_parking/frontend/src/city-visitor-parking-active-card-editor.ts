import { html, LitElement, type TemplateResult } from "lit";
import {
  buildCardTypeOptions,
  buildFormHelpers,
  type FormSchema,
} from "./card-editor-shared";
import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import { DOMAIN, getGlobalHass, type HomeAssistant } from "./card-shared";

type CardConfig = {
  type: string;
  title?: string;
  icon?: string;
  config_entry_id?: string;
};

type FormSchemaConfig = ReadonlyArray<Record<string, unknown>>;

const buildSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
  displayOptionsTitle: string,
): FormSchemaConfig => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-active-card",
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
    title: displayOptionsTitle,
    expanded: displayOptionsExpanded,
    flatten: true,
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false,
      },
    ],
  },
];

export class CityVisitorParkingActiveCardEditor extends LitElement {
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
      "active_editor",
    );
    const cardTypeOptions = buildCardTypeOptions(
      localizeTarget,
      "active_editor",
    );
    const displayOptionsTitle = localize(
      localizeTarget,
      "active_editor.field.display_options",
    );
    const displayOptionsExpanded = Boolean(this._config?.config_entry_id);
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildSchema(
          cardTypeOptions,
          displayOptionsExpanded,
          displayOptionsTitle,
        )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
}

customElements.define(
  "city-visitor-parking-active-card-editor",
  CityVisitorParkingActiveCardEditor,
);

export const getActiveCardConfigForm = async (
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
    "active_editor",
  );
  const cardTypeOptions = buildCardTypeOptions(localizeTarget, "active_editor");
  const displayOptionsTitle = localize(
    localizeTarget,
    "active_editor.field.display_options",
  );
  return {
    schema: buildSchema(cardTypeOptions, false, displayOptionsTitle),
    computeLabel,
    computeHelper,
  };
};
