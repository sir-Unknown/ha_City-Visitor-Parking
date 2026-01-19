import type { LocalizeFunc } from "./localize";
import { localize } from "./localize";

type LocalizeTarget = Parameters<typeof localize>[0];
export type FormSchema = { name: string };
type SelectOption = [string, string];

const getFieldKey = (prefix: string, name: string): string => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};

export const buildFormHelpers = (
  localizeTarget: LocalizeTarget | LocalizeFunc,
  prefix: string,
): {
  computeLabel: (schema: FormSchema) => string;
  computeHelper: (schema: FormSchema) => string;
} => ({
  computeLabel: (schema) => {
    const key = getFieldKey(`${prefix}.field`, schema.name);
    const label = localize(localizeTarget, key);
    return label === key ? "" : label;
  },
  computeHelper: (schema) => {
    const key = getFieldKey(`${prefix}.description`, schema.name);
    const helper = localize(localizeTarget, key);
    return helper === key ? "" : helper;
  },
});

export const buildCardTypeOptions = (
  localizeTarget: LocalizeTarget | LocalizeFunc,
  prefix: string,
): SelectOption[] => {
  const newKey = `${prefix}.value.card_type.new`;
  const activeKey = `${prefix}.value.card_type.active`;
  const newLabel = localize(localizeTarget, newKey);
  const activeLabel = localize(localizeTarget, activeKey);
  return [
    [
      "custom:city-visitor-parking-card",
      newLabel === newKey ? "New reservation card" : newLabel,
    ],
    [
      "custom:city-visitor-parking-active-card",
      activeLabel === activeKey ? "Active reservations card" : activeLabel,
    ],
  ];
};
