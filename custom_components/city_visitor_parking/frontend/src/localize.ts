export type LocalizeFunc = (
  key: string,
  ...args: Array<string | number>
) => string;

type LocalizeTarget =
  | {
      localize?: LocalizeFunc;
      locale?: { language?: string };
      language?: string;
    }
  | LocalizeFunc
  | null
  | undefined;

type TranslationValue = string | TranslationObject;
interface TranslationObject {
  [key: string]: TranslationValue;
}

const DEFAULT_LANGUAGE = "en";
const translationsCache = new Map<string, TranslationObject>();
const translationsInFlight = new Map<string, Promise<void>>();

type HassLanguageContext = {
  locale?: { language?: string };
  language?: string;
};

const getGlobalHass = (): HassLanguageContext | null => {
  const globalHass = (window as Window & { hass?: HassLanguageContext }).hass;
  if (globalHass) {
    return globalHass;
  }
  return null;
};

const getStoredLanguage = (): string | undefined => {
  try {
    return localStorage.getItem("selectedLanguage") ?? undefined;
  } catch {
    return undefined;
  }
};

const getLanguage = (target: LocalizeTarget): string => {
  const globalHass = getGlobalHass();
  const documentLanguage = document.documentElement.lang || undefined;
  const storedLanguage = getStoredLanguage();
  if (!target || typeof target === "function") {
    return (
      globalHass?.language ||
      globalHass?.locale?.language ||
      documentLanguage ||
      storedLanguage ||
      navigator.language ||
      DEFAULT_LANGUAGE
    );
  }
  return (
    target.language ||
    target.locale?.language ||
    globalHass?.language ||
    globalHass?.locale?.language ||
    documentLanguage ||
    storedLanguage ||
    DEFAULT_LANGUAGE
  );
};

const getBaseUrl = (): string =>
  new URL(".", import.meta.url).toString().replace(/\/$/, "");

const fetchTranslations = async (
  baseUrl: string,
  language: string,
): Promise<TranslationObject | null> => {
  const response = await fetch(
    `${baseUrl}/translations/${language}.json`,
  ).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  try {
    return (await response.json()) as TranslationObject;
  } catch {
    return null;
  }
};

export const ensureTranslations = async (
  target: LocalizeTarget,
): Promise<void> => {
  const language = getLanguage(target);
  if (translationsCache.has(language)) {
    return;
  }
  const inFlight = translationsInFlight.get(language);
  if (inFlight) {
    await inFlight;
    return;
  }

  const loadPromise = (async () => {
    const baseUrl = getBaseUrl();
    const languageStrings = await fetchTranslations(baseUrl, language);
    if (languageStrings) {
      translationsCache.set(language, languageStrings);
      return;
    }

    const baseLanguage = language.split("-")[0];
    if (baseLanguage && baseLanguage !== language) {
      const baseStrings = await fetchTranslations(baseUrl, baseLanguage);
      if (baseStrings) {
        translationsCache.set(language, baseStrings);
        return;
      }
    }

    const fallbackStrings = await fetchTranslations(baseUrl, DEFAULT_LANGUAGE);
    translationsCache.set(language, fallbackStrings ?? {});
  })();

  translationsInFlight.set(language, loadPromise);
  await loadPromise;
  translationsInFlight.delete(language);
};

export const localize = (target: LocalizeTarget, key: string): string => {
  const language = getLanguage(target);
  const strings =
    translationsCache.get(language) || translationsCache.get(DEFAULT_LANGUAGE);
  if (strings) {
    const directValue = strings[key];
    if (typeof directValue === "string") {
      return directValue;
    }
    const cardStrings = strings.card;
    if (cardStrings && typeof cardStrings === "object") {
      const parts = key.split(".");
      let current: TranslationValue | undefined = cardStrings;
      for (const part of parts) {
        if (!current || typeof current !== "object") {
          current = undefined;
          break;
        }
        current = current[part];
      }
      if (typeof current === "string") {
        return current;
      }
    }
  }
  return key;
};
