/** Editor schema helpers for the new-reservation Lovelace card. */
import { html, type TemplateResult } from "lit";
import type {
  CardEditorFormSchema,
  HomeAssistant,
  LocalizeTarget,
  ParkingCardEditorConfig,
  SelectOption,
  FormSchema,
  ParkingAreaStatus,
} from "./types";
import {
  DOMAIN,
  MIN_SELECTABLE_PARKING_AREAS,
  dropForeignParkingAreaId,
  fetchPermitEntries,
  fetchPermitParkingAreas,
  getParkingAreaEditorVisibility,
  isPermitEntryDisabled,
} from "./helpers";
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

/** Parking area settings shown next to the permit setting; omitted when not offered. */
type ParkingAreaEditorFields = {
  /** Options for the `parking_area_id` picker, or `null` to hide it. */
  parkingAreaOptions: Array<{ value: string; label: string }> | null;
  showParkingAreaToggle: boolean;
};

const NO_PARKING_AREA_FIELDS: ParkingAreaEditorFields = {
  parkingAreaOptions: null,
  showParkingAreaToggle: false,
};

const buildCardEditorSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
  parkingAreaFields: ParkingAreaEditorFields = NO_PARKING_AREA_FIELDS,
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
      ...(parkingAreaFields.parkingAreaOptions
        ? [
            {
              name: "parking_area_id",
              selector: {
                select: {
                  options: parkingAreaFields.parkingAreaOptions,
                  mode: "dropdown",
                },
              },
              required: false,
            },
          ]
        : []),
      ...(parkingAreaFields.showParkingAreaToggle
        ? [
            {
              name: "show_parking_area",
              selector: { boolean: {} },
              default: true,
            },
          ]
        : []),
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
  // Parking areas per permit from the status websocket; empty when a fetch failed.
  private _parkingAreasByEntryId = new Map<string, ParkingAreaStatus[]>();
  private _parkingAreasLoading = new Set<string>();
  // Enabled permits, loaded only while no permit is configured.
  private _permitIds: string[] | null = null;
  private _permitIdsLoading = false;

  protected willUpdate(): void {
    if (this.hass) this._ensureParkingAreas(this.hass as HomeAssistant);
  }

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
      this._config?.parking_area_id ||
      this._config?.show_parking_area === false ||
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
          this._getParkingAreaFields(),
        )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }

  protected _normalizeConfig(
    config: ParkingCardEditorConfig,
  ): ParkingCardEditorConfig {
    return dropForeignParkingAreaId(
      config,
      this._config?.config_entry_id,
      this._parkingAreasByEntryId,
    );
  }

  /** Parking area settings for the current config; see `getParkingAreaEditorVisibility`. */
  private _getParkingAreaFields(): ParkingAreaEditorFields {
    const entryId = this._config?.config_entry_id;
    const permitParkingAreas = entryId
      ? (this._parkingAreasByEntryId.get(entryId) ?? [])
      : [];
    const { showParkingAreaSelect, showParkingAreaToggle } =
      getParkingAreaEditorVisibility({
        permitConfigured: Boolean(entryId),
        permitParkingAreaCount: permitParkingAreas.length,
        anyPermitHasParkingAreas: (this._permitIds ?? []).some(
          (id) =>
            (this._parkingAreasByEntryId.get(id)?.length ?? 0) >=
            MIN_SELECTABLE_PARKING_AREAS,
        ),
      });
    return {
      parkingAreaOptions: showParkingAreaSelect
        ? permitParkingAreas.map((parkingArea) => ({
            value: parkingArea.parking_area_id,
            label: parkingArea.name || parkingArea.parking_area_id,
          }))
        : null,
      showParkingAreaToggle,
    };
  }

  /**
   * Loads the parking areas that decide which parking area settings are shown: those of the
   * configured permit, or, without one, those of every enabled permit.
   */
  private _ensureParkingAreas(hass: HomeAssistant): void {
    const entryId = this._config?.config_entry_id;
    if (entryId) {
      this._loadParkingAreas(hass, entryId);
      return;
    }
    if (this._permitIds) {
      for (const id of this._permitIds) this._loadParkingAreas(hass, id);
      return;
    }
    if (this._permitIdsLoading) return;
    this._permitIdsLoading = true;
    void fetchPermitEntries(hass)
      .then((entries) => {
        this._permitIds = entries
          .filter((entry) => !isPermitEntryDisabled(entry))
          .map((entry) => entry.entry_id);
      })
      .catch(() => {
        this._permitIds = [];
      })
      .finally(() => {
        this._permitIdsLoading = false;
        this.requestUpdate();
      });
  }

  private _loadParkingAreas(hass: HomeAssistant, entryId: string): void {
    if (
      this._parkingAreasByEntryId.has(entryId) ||
      this._parkingAreasLoading.has(entryId)
    ) {
      return;
    }
    this._parkingAreasLoading.add(entryId);
    void fetchPermitParkingAreas(hass, entryId).then((parkingAreas) => {
      this._parkingAreasByEntryId.set(entryId, parkingAreas);
      this._parkingAreasLoading.delete(entryId);
      this.requestUpdate();
    });
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
