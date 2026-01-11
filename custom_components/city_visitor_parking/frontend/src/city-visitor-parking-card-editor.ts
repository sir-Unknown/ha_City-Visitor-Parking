import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import { DOMAIN } from "./card-shared";

type FormSchema = { name: string };

const getFieldKey = (prefix: string, name: string): string => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};

export const getCardConfigForm = async (
  hassOrLocalize?: { localize?: LocalizeFunc } | LocalizeFunc,
): Promise<{
  readonly schema: ReadonlyArray<Record<string, unknown>>;
  readonly computeLabel: (schema: FormSchema) => string;
  readonly computeHelper: (schema: FormSchema) => string;
}> => {
  await ensureTranslations(hassOrLocalize);
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
        required: false,
      },
      {
        name: "icon",
        selector: { icon: {} },
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
    computeLabel: (schema) => {
      const key = getFieldKey("editor.field", schema.name);
      const label = localize(hassOrLocalize, key);
      return label === key ? "" : label;
    },
    computeHelper: (schema) => {
      const key = getFieldKey("editor.description", schema.name);
      const helper = localize(hassOrLocalize, key);
      return helper === key ? "" : helper;
    },
  };
};
