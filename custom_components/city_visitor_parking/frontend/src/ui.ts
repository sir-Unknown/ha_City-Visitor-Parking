import { css, html, nothing, type TemplateResult } from "lit";
import type {
  FavoriteOption,
  HomeAssistant,
  LocalizeTarget,
  ProgressButtonElement,
  StatusState,
  StatusType,
} from "./types";
import { getGlobalHass, localize } from "./translations";
import { DOMAIN, formatBalanceLabel, normalizeMatchValue } from "./helpers";

export { css };

export const BASE_CARD_STYLES = css`
  :host {
    display: block;
  }
  ha-card {
    position: relative;
  }
  .card-content {
    display: flex;
    flex-direction: column;
  }
  .row > ha-input,
  .row > ha-textfield,
  .row > ha-select,
  .row > ha-selector,
  .row > ha-alert {
    margin: 0;
  }
  .card-content > .row + .row {
    margin-top: var(--ha-space-2);
  }
  .card-content > .row.datetime-row {
    margin-top: var(--ha-space-1);
  }
  .datetime-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--ha-space-2);
  }
  .datetime-fields > .datetime-row {
    margin-top: 0;
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
  .datetime-row ha-input,
  .datetime-row ha-textfield {
    width: 100%;
  }
`;

export const createStatusState = (): StatusState => ({
  message: "",
  type: "info",
  clearHandle: null,
});

export const triggerProgressButtonFeedback = async (
  host: {
    updateComplete: Promise<boolean>;
    renderRoot: { querySelector: (s: string) => Element | null };
  },
  selector: string,
  outcome: "success" | "error",
): Promise<void> => {
  await host.updateComplete;
  const button = host.renderRoot.querySelector(
    selector,
  ) as ProgressButtonElement | null;
  if (!button) return;
  if (outcome === "success") {
    button.actionSuccess?.();
  } else {
    button.actionError?.();
  }
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
  if (!state.message && state.type === "info") return;
  state.message = "";
  state.type = "info";
  requestRender();
};

export const HA_STARTING_MESSAGE_KEY = "ui.panel.lovelace.warning.starting";

export const getCardText = (key: string): string | null => {
  const value = localize(getGlobalHass<LocalizeTarget>(), key);
  return value === key ? null : value;
};

export const getLoadingMessage = (
  hass: LocalizeTarget | null | undefined,
): string => {
  const hassLocalize = typeof hass === "function" ? hass : hass?.localize;
  const haMessage = hassLocalize?.(HA_STARTING_MESSAGE_KEY);
  if (haMessage && haMessage !== HA_STARTING_MESSAGE_KEY) return haMessage;
  const key = "message.home_assistant_loading";
  const message = localize(hass, key);
  return message === key ? "" : message;
};

export const renderLoadingCard = (
  hass: LocalizeTarget | null | undefined,
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

export const renderCardHeader = (
  title: string,
  icon: string | undefined,
): unknown => {
  if (!title && !icon) return nothing;
  return html`
    <h1 class="card-header">
      <div class="name">
        ${icon ? html`<ha-icon class="icon" .icon=${icon}></ha-icon>` : nothing}
        ${title}
      </div>
    </h1>
  `;
};

export const renderPermitSelect = (params: {
  hass: HomeAssistant | null | undefined;
  label: string;
  value: string;
  disabled: boolean;
  preview?: boolean;
  onSelected: (event: Event) => void;
}): TemplateResult => {
  if (params.preview) {
    return html`
      <div class="row">
        <ha-input
          appearance="material"
          .label=${params.label}
          .value=${params.value}
          ?disabled=${true}
        ></ha-input>
      </div>
    `;
  }
  return html`
    <div class="row">
      <ha-selector
        id="permitSelect"
        .hass=${params.hass}
        .selector=${{
          config_entry: {
            integration: DOMAIN,
          },
        }}
        .label=${params.label}
        .value=${params.value}
        .required=${false}
        ?disabled=${params.disabled}
        @value-changed=${params.onSelected}
      ></ha-selector>
    </div>
  `;
};

export const renderFavoriteSelect = (params: {
  showName: boolean;
  showFavorites: boolean;
  favoriteValue: string;
  favoriteSelectDisabled: boolean;
  hass: HomeAssistant | null | undefined;
  favoritesOptions: FavoriteOption[];
  favoritesError: string | null;
  preview?: boolean;
  wrapSelect?: (content: TemplateResult) => unknown;
  localize: (key: string, ...args: Array<string | number>) => string;
  onSelected: (event: Event) => void;
}): TemplateResult | typeof nothing => {
  if (!params.showName) return nothing;

  type FavoriteSelectOption = {
    value: string;
    label: string;
  };

  const seenValues = new Set<string>();
  const selectOptions: FavoriteSelectOption[] = [];

  for (const favorite of params.favoritesOptions) {
    const name = favorite.name?.trim() || "";
    const valueKey = normalizeMatchValue(name);
    if (!valueKey || seenValues.has(valueKey)) continue;
    seenValues.add(valueKey);
    selectOptions.push({ value: name, label: name });
  }
  selectOptions.sort(
    (first, second) =>
      first.label.localeCompare(second.label) ||
      first.value.localeCompare(second.value),
  );
  const inputValue = params.favoriteValue;

  if (params.preview) {
    return html`
      <div class="row">
        <ha-input
          appearance="material"
          .label=${params.localize("field.name")}
          .value=${inputValue}
          ?disabled=${true}
        ></ha-input>
      </div>
    `;
  }

  if (!params.showFavorites) {
    return html`
      <div class="row">
        <ha-input
          id="favorite"
          appearance="material"
          .label=${params.localize("field.name")}
          .value=${inputValue}
        ></ha-input>
      </div>
    `;
  }

  const selectContent = html`
    <ha-selector
      id="favorite"
      .hass=${params.hass}
      .selector=${{
        select: {
          options: selectOptions,
          mode: "dropdown",
          custom_value: true,
          clearable: true,
        },
      }}
      .label=${params.localize("field.name")}
      .value=${inputValue}
      .required=${false}
      ?disabled=${params.favoriteSelectDisabled}
      @value-changed=${params.onSelected}
    ></ha-selector>
  `;

  const wrappedSelect = params.wrapSelect
    ? params.wrapSelect(selectContent)
    : selectContent;

  return html`
    <div class="row">
      ${wrappedSelect}
      ${params.favoritesError
        ? html`<ha-alert alert-type="warning">
            ${params.favoritesError}
          </ha-alert>`
        : nothing}
    </div>
  `;
};

export const renderFavoriteActionRow = (params: {
  showFavorites: boolean;
  showAddFavorite: boolean;
  showRemoveFavorite: boolean;
  selectedFavoriteId: string;
  favoriteRemoveDisabled: boolean;
  addFavoriteChecked: boolean;
  startInFlight: boolean;
  startButtonSuccess: boolean;
  startButtonWarning: boolean;
  startButtonTimeConflict: boolean;
  startDisabled: boolean;
  hasTarget: boolean;
  remainingMinutes: number | null;
  balanceUnit: string | null;
  localize: (key: string, ...args: Array<string | number>) => string;
}): TemplateResult => {
  const showFavoriteButton =
    params.showFavorites &&
    (params.showRemoveFavorite || params.showAddFavorite);
  const showBalance =
    !showFavoriteButton && params.hasTarget && params.remainingMinutes !== null;
  return html`
    <div class="row actions">
      <div class="favorite-actions">
        ${params.showFavorites
          ? params.showRemoveFavorite
            ? html`
                <ha-badge
                  id="removeFavorite"
                  type="button"
                  .label=${params.localize("action.remove_favorite")}
                  data-favorite-id=${params.selectedFavoriteId}
                  ?disabled=${params.favoriteRemoveDisabled}
                  title=${params.localize("action.remove_favorite")}
                  aria-label=${params.localize("action.remove_favorite")}
                >
                  <ha-icon slot="icon" icon="mdi:trash-can-outline"></ha-icon>
                </ha-badge>
              `
            : params.showAddFavorite
              ? html`
                  <ha-badge
                    id="addFavoriteWrap"
                    type="button"
                    .label=${params.localize("action.add_favorite")}
                    class=${params.addFavoriteChecked ? "badge-checked" : ""}
                    title=${params.localize("action.add_favorite")}
                    aria-label=${params.localize("action.add_favorite")}
                    aria-pressed=${params.addFavoriteChecked ? "true" : "false"}
                  >
                    <ha-icon
                      slot="icon"
                      icon=${params.addFavoriteChecked
                        ? "mdi:heart"
                        : "mdi:heart-outline"}
                    ></ha-icon>
                  </ha-badge>
                `
              : nothing
          : nothing}
        ${showBalance
          ? (() => {
              const { text, icon } = formatBalanceLabel(
                params.remainingMinutes!,
                params.balanceUnit,
              );
              return html`
                <ha-badge .label=${text}>
                  <ha-icon slot="icon" icon=${icon}></ha-icon>
                </ha-badge>
              `;
            })()
          : nothing}
      </div>
      ${(() => {
        const isSuccess = params.startButtonSuccess;
        const isWarning = params.startButtonWarning;
        const isTimeConflict = params.startButtonTimeConflict;
        const isDisabled = params.startDisabled && !isSuccess;
        const buttonClass = `start-button${isSuccess ? " success" : isWarning ? " warning" : ""}`;
        const label = isWarning
          ? params.localize("action.permit_unavailable")
          : isTimeConflict
            ? params.localize("action.time_unavailable")
            : params.localize("action.start_reservation");
        return html`
          <ha-progress-button
            id="startReservation"
            class=${buttonClass}
            variant=${isSuccess ? "success" : isWarning ? "danger" : nothing}
            appearance=${isSuccess || isWarning || isTimeConflict
              ? "filled"
              : nothing}
            .progress=${params.startInFlight}
            ?disabled=${isDisabled}
            aria-label=${label}
            title=${label}
          >
            ${label}
          </ha-progress-button>
        `;
      })()}
    </div>
  `;
};
