import type { LocalizeFunc } from "./localize";
import { ensureTranslations, localize } from "./localize";
import { DOMAIN, getGlobalHass, type HomeAssistant } from "./card-shared";

type FormSchema = { name: string };
type PermitOption = { value: string; label: string };

const getFieldKey = (prefix: string, name: string): string => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};

const splitPermitLabel = (
  label: string,
  entryId: string,
): { primary: string; secondary: string } => {
  const trimmed = label.trim();
  if (!trimmed) {
    return { primary: entryId, secondary: "" };
  }
  const parts = trimmed
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return { primary: parts[0], secondary: parts.slice(1).join(" - ") };
  }
  if (trimmed !== entryId) {
    return { primary: trimmed, secondary: entryId };
  }
  return { primary: trimmed, secondary: "" };
};

const getPermitOptions = async (
  hass: HomeAssistant | null | undefined,
): Promise<PermitOption[]> => {
  if (!hass) {
    return [];
  }
  try {
    const entries = await hass.callWS<
      Array<{ entry_id: string; title?: string | null }>
    >({
      type: "config_entries/get",
      type_filter: ["device", "hub", "service"],
      domain: DOMAIN,
    });
    return entries
      .map((entry) => {
        const label = entry.title || entry.entry_id;
        const { primary, secondary } = splitPermitLabel(label, entry.entry_id);
        return {
          value: entry.entry_id,
          label: secondary ? `${primary} - ${secondary}` : primary,
        };
      })
      .sort((first, second) =>
        first.label.localeCompare(second.label, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  } catch {
    return [];
  }
};

export const getCardConfigForm = async (
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
  const permitOptions = await getPermitOptions(
    typeof localizeTarget === "function" ? null : localizeTarget,
  );
  const permitPlaceholderKey = "message.select_permit";
  const permitPlaceholder = localize(localizeTarget, permitPlaceholderKey);
  const permitPlaceholderLabel =
    permitPlaceholder === permitPlaceholderKey ? "" : permitPlaceholder;
  const permitSelectorOptions: PermitOption[] = permitPlaceholderLabel
    ? [{ value: "", label: permitPlaceholderLabel }, ...permitOptions]
    : permitOptions;
  return {
    schema: [
      {
        name: "config_entry_id",
        selector: { select: { options: permitSelectorOptions } },
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
      const label = localize(localizeTarget, key);
      return label === key ? "" : label;
    },
    computeHelper: (schema) => {
      const key = getFieldKey("editor.description", schema.name);
      const helper = localize(localizeTarget, key);
      return helper === key ? "" : helper;
    },
  };
};
