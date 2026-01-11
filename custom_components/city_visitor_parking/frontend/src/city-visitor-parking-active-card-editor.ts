import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import { DOMAIN } from "./card-shared";

type FormSchema = { name: string };

const getFieldKey = (prefix: string, name: string): string => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};

export const getActiveCardConfigForm = async (
  hassOrLocalize?: { localize?: LocalizeFunc } | LocalizeFunc,
): Promise<{
  readonly schema: ReadonlyArray<Record<string, unknown>>;
  readonly computeLabel: (schema: FormSchema) => string;
  readonly computeHelper: (schema: FormSchema) => string;
}> => {
  await ensureTranslations(hassOrLocalize);
  const defaultTitleKey = "section.active_reservations";
  const defaultTitleValue = localize(hassOrLocalize, defaultTitleKey);
  const defaultTitle =
    defaultTitleValue === defaultTitleKey
      ? "Active reservations"
      : defaultTitleValue;
  return {
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false,
      },
      {
        name: "title",
        selector: { text: {} },
        default: defaultTitle,
        required: false,
      },
      {
        name: "icon",
        selector: { icon: {} },
        required: false,
      },
    ],
    computeLabel: (schema) =>
      localize(hassOrLocalize, getFieldKey("active_editor.field", schema.name)),
    computeHelper: (schema) => {
      const key = getFieldKey("active_editor.description", schema.name);
      const helper = localize(hassOrLocalize, key);
      return helper === key ? "" : helper;
    },
  };
};
