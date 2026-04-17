/** Editor schema helpers for the new-reservation Lovelace card. */
import { html, type TemplateResult } from "lit";
import type {
  CardEditorFormSchema,
  LocalizeTarget,
  ParkingCardEditorConfig,
  SelectOption,
  FormSchema,
} from "./types";
import { DOMAIN } from "./helpers";
import { ensureTranslations, localize, getGlobalHass } from "./translations";
import { BaseCardEditor, defineElementIfMissing } from "./base";

type LocalizeFunc = (key: string, ...args: Array<string | number>) => string;

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

/** Returns the selectable card types shown by the Lovelace card editor. */
export const buildCardTypeOptions = (
  localizeTarget: LocalizeTarget | LocalizeFunc,
  prefix: string,
): SelectOption[] => {
  const t = (key: string): string => {
    const result = localize(localizeTarget, `${prefix}.value.card_type.${key}`);
    return result === `${prefix}.value.card_type.${key}` ? "" : result;
  };
  return [
    ["custom:city-visitor-parking-card", t("new") || "New reservation card"],
    [
      "custom:city-visitor-parking-active-card",
      t("active") || "Active reservations card",
    ],
  ];
};

const buildCardEditorSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
): CardEditorFormSchema => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-card",
    options: cardTypeOptions,
  },
  { name: "title", selector: { text: {} }, required: false },
  { name: "icon", selector: { icon: {} }, required: false },
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
      { name: "show_name", selector: { boolean: {} }, default: true },
      { name: "show_favorites", selector: { boolean: {} }, default: true },
      { name: "show_start_time", selector: { boolean: {} }, default: true },
      { name: "show_end_time", selector: { boolean: {} }, default: true },
      {
        name: "default_license_plate",
        selector: { text: {} },
        required: false,
      },
    ],
  },
];

/** Lovelace editor element for configuring the new-reservation card. */
export class CityVisitorParkingCardEditor extends BaseCardEditor<ParkingCardEditorConfig> {
  protected render(): TemplateResult {
    if (!this.hass) return html``;
    const localizeTarget = this.hass;
    void ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      "editor",
    );
    const cardTypeOptions = buildCardTypeOptions(localizeTarget, "editor");
    const displayOptionsExpanded = Boolean(
      this._config?.config_entry_id ||
      this._config?.show_name === false ||
      this._config?.show_favorites === false ||
      this._config?.show_start_time === false ||
      this._config?.show_end_time === false ||
      this._config?.default_license_plate,
    );
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildCardEditorSchema(
          cardTypeOptions,
          displayOptionsExpanded,
        )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
}

defineElementIfMissing(
  "city-visitor-parking-card-editor",
  CityVisitorParkingCardEditor,
);

/** Creates the async config-form getter used by Lovelace card metadata APIs. */
export const createConfigFormGetter =
  (
    prefix: string,
    buildSchema: (
      cardTypeOptions: ReadonlyArray<readonly [string, string]>,
      target: LocalizeTarget,
    ) => CardEditorFormSchema,
  ) =>
  async (hassOrLocalize?: LocalizeTarget | LocalizeFunc) => {
    const localizeTarget: LocalizeTarget =
      hassOrLocalize && typeof hassOrLocalize !== "function"
        ? (hassOrLocalize as LocalizeTarget)
        : ((getGlobalHass<LocalizeTarget>() ??
            hassOrLocalize) as LocalizeTarget);
    await ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      prefix,
    );
    const cardTypeOptions = buildCardTypeOptions(localizeTarget, prefix);
    return {
      schema: buildSchema(cardTypeOptions, localizeTarget),
      computeLabel,
      computeHelper,
    };
  };

/** Returns the config-form schema for the new-reservation card. */
export const getCardConfigForm = createConfigFormGetter(
  "editor",
  (cardTypeOptions) => buildCardEditorSchema(cardTypeOptions, false),
);
