/** Editor schema helpers for the new-reservation Lovelace card. */
import { html, type TemplateResult } from "lit";
import type {
  CardEditorFormSchema,
  HomeAssistant,
  LocalizeTarget,
  ParkingCardEditorConfig,
  SelectOption,
  FormSchema,
  ZoneStatusZone,
} from "./types";
import {
  DOMAIN,
  MIN_SELECTABLE_ZONES,
  dropForeignZoneId,
  fetchPermitEntries,
  fetchPermitZones,
  getZoneEditorVisibility,
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

/** Zone settings shown next to the permit setting; omitted when not offered. */
type ZoneEditorFields = {
  /** Options for the `zone_id` picker, or `null` to hide it. */
  zoneOptions: Array<{ value: string; label: string }> | null;
  showZoneToggle: boolean;
};

const NO_ZONE_FIELDS: ZoneEditorFields = {
  zoneOptions: null,
  showZoneToggle: false,
};

const buildCardEditorSchema = (
  cardTypeOptions: ReadonlyArray<readonly [string, string]>,
  displayOptionsExpanded: boolean,
  zoneFields: ZoneEditorFields = NO_ZONE_FIELDS,
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
      ...(zoneFields.zoneOptions
        ? [
            {
              name: "zone_id",
              selector: {
                select: { options: zoneFields.zoneOptions, mode: "dropdown" },
              },
              required: false,
            },
          ]
        : []),
      ...(zoneFields.showZoneToggle
        ? [{ name: "show_zone", selector: { boolean: {} }, default: true }]
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
  // Zones per permit from the status websocket; empty when a fetch failed.
  private _zonesByEntryId = new Map<string, ZoneStatusZone[]>();
  private _zonesLoading = new Set<string>();
  // Enabled permits, loaded only while no permit is configured.
  private _permitIds: string[] | null = null;
  private _permitIdsLoading = false;

  protected willUpdate(): void {
    if (this.hass) this._ensureZones(this.hass as HomeAssistant);
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
      this._config?.zone_id ||
      this._config?.show_zone === false ||
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
          this._getZoneFields(),
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
    return dropForeignZoneId(
      config,
      this._config?.config_entry_id,
      this._zonesByEntryId,
    );
  }

  /** Zone settings for the current config; see `getZoneEditorVisibility`. */
  private _getZoneFields(): ZoneEditorFields {
    const entryId = this._config?.config_entry_id;
    const permitZones = entryId
      ? (this._zonesByEntryId.get(entryId) ?? [])
      : [];
    const { showZoneSelect, showZoneToggle } = getZoneEditorVisibility({
      permitConfigured: Boolean(entryId),
      permitZoneCount: permitZones.length,
      anyPermitHasZones: (this._permitIds ?? []).some(
        (id) =>
          (this._zonesByEntryId.get(id)?.length ?? 0) >= MIN_SELECTABLE_ZONES,
      ),
    });
    return {
      zoneOptions: showZoneSelect
        ? permitZones.map((zone) => ({
            value: zone.zone_id,
            label: zone.name || zone.zone_id,
          }))
        : null,
      showZoneToggle,
    };
  }

  /**
   * Loads the zones that decide which zone settings are shown: those of the
   * configured permit, or, without one, those of every enabled permit.
   */
  private _ensureZones(hass: HomeAssistant): void {
    const entryId = this._config?.config_entry_id;
    if (entryId) {
      this._loadZones(hass, entryId);
      return;
    }
    if (this._permitIds) {
      for (const id of this._permitIds) this._loadZones(hass, id);
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

  private _loadZones(hass: HomeAssistant, entryId: string): void {
    if (this._zonesByEntryId.has(entryId) || this._zonesLoading.has(entryId)) {
      return;
    }
    this._zonesLoading.add(entryId);
    void fetchPermitZones(hass, entryId).then((zones) => {
      this._zonesByEntryId.set(entryId, zones);
      this._zonesLoading.delete(entryId);
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
