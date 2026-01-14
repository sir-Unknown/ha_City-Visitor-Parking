import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import { DOMAIN, getGlobalHass, type HomeAssistant } from "./card-shared";

type FormSchema = { name: string };

const getFieldKey = (prefix: string, name: string): string => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};

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
  return {
    schema: [
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
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false,
      },
    ],
    computeLabel: (schema) => {
      const key = getFieldKey("active_editor.field", schema.name);
      const label = localize(localizeTarget, key);
      return label === key ? "" : label;
    },
    computeHelper: (schema) => {
      const key = getFieldKey("active_editor.description", schema.name);
      const helper = localize(localizeTarget, key);
      return helper === key ? "" : helper;
    },
  };
};
