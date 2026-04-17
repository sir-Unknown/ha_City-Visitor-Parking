/** Editor schema helpers for the active-reservations Lovelace card. */
import { html, type TemplateResult } from "lit";
import type {
  ActiveParkingCardEditorConfig,
  CardEditorFormSchema,
  LocalizeTarget,
} from "./types";
import { DOMAIN } from "./helpers";
import { ensureTranslations, localize } from "./translations";
import { BaseCardEditor, defineElementIfMissing } from "./base";
import { buildCardTypeOptions, createConfigFormGetter } from "./editor-parking";

type LocalizeFunc = (key: string, ...args: Array<string | number>) => string;
type FormSchema = { name: string };

/** Builds localized field-label and helper-text resolvers for `ha-form`. */
const buildFormHelpers = (
  localizeTarget: LocalizeTarget | LocalizeFunc,
  prefix: string,
): {
  computeLabel: (schema: FormSchema) => string;
  computeHelper: (schema: FormSchema) => string;
} => {
  const resolve = (section: string, name: string): string => {
    const fieldName = name === "config_entry_id" ? "config_entry" : name;
    const key = `${prefix}.${section}.${fieldName}`;
    const result = localize(localizeTarget, key);
    return result === key ? "" : result;
  };
  return {
    computeLabel: (schema) => resolve("field", schema.name),
    computeHelper: (schema) => resolve("description", schema.name),
  };
};

const buildActiveCardEditorSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
  displayOptionsTitle: string,
): CardEditorFormSchema => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-active-card",
    options: cardTypeOptions,
  },
  { name: "title", selector: { text: {} }, required: false },
  { name: "icon", selector: { icon: {} }, required: false },
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

/** Lovelace editor element for configuring the active-reservations card. */
export class CityVisitorParkingActiveCardEditor extends BaseCardEditor<ActiveParkingCardEditorConfig> {
  protected render(): TemplateResult {
    if (!this.hass) return html``;
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
        .schema=${buildActiveCardEditorSchema(
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

defineElementIfMissing(
  "city-visitor-parking-active-card-editor",
  CityVisitorParkingActiveCardEditor,
);

/** Returns the config-form schema for the active-reservations card. */
export const getActiveCardConfigForm = createConfigFormGetter(
  "active_editor",
  (cardTypeOptions, target) =>
    buildActiveCardEditorSchema(
      cardTypeOptions,
      false,
      localize(target, "active_editor.field.display_options"),
    ),
);
