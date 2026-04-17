import type { LocalizeFunc, LocalizeTarget, TranslationObject } from "./types";

const DEFAULT_LANGUAGE = "en";
const BASE_URL = new URL(".", import.meta.url).toString().replace(/\/$/, "");
const translationsCache = new Map<string, TranslationObject>();
const translationsInFlight = new Map<string, Promise<void>>();
const translationLookupCache = new Map<string, Map<string, string>>();

export const getGlobalHass = <T>(): T | undefined =>
  (window as Window & { hass?: T }).hass;

const getStoredLanguage = (): string | undefined => {
  try {
    return localStorage.getItem("selectedLanguage") ?? undefined;
  } catch {
    return undefined;
  }
};

const getLanguage = (target: LocalizeTarget): string => {
  const globalHass = getGlobalHass<{
    locale?: { language?: string };
    language?: string;
  }>();
  const targetLang =
    target && typeof target !== "function"
      ? target.language || target.locale?.language
      : undefined;
  return (
    targetLang ||
    globalHass?.language ||
    globalHass?.locale?.language ||
    document.documentElement.lang ||
    getStoredLanguage() ||
    navigator.language ||
    DEFAULT_LANGUAGE
  );
};

const fetchTranslations = async (
  baseUrl: string,
  language: string,
): Promise<TranslationObject | null> => {
  const response = await fetch(
    `${baseUrl}/translations/${language}.json`,
  ).catch(() => null);
  if (!response || !response.ok) return null;
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
  if (translationsCache.has(language)) return;
  const inFlight = translationsInFlight.get(language);
  if (inFlight) {
    await inFlight;
    return;
  }
  const cache = (strings: TranslationObject): void => {
    translationsCache.set(language, strings);
    translationLookupCache.delete(language);
  };
  const loadPromise = (async () => {
    const languageStrings = await fetchTranslations(BASE_URL, language);
    if (languageStrings) return cache(languageStrings);
    const baseLanguage = language.split("-")[0];
    if (baseLanguage && baseLanguage !== language) {
      const baseStrings = await fetchTranslations(BASE_URL, baseLanguage);
      if (baseStrings) return cache(baseStrings);
    }
    cache((await fetchTranslations(BASE_URL, DEFAULT_LANGUAGE)) ?? {});
  })();
  translationsInFlight.set(language, loadPromise);
  await loadPromise;
  translationsInFlight.delete(language);
};

const resolveTranslationValue = (
  obj: TranslationObject,
  parts: string[],
): string | undefined => {
  let current: TranslationObject | string = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = current[part] as TranslationObject | string;
  }
  return typeof current === "string" ? current : undefined;
};

export const localize = (target: LocalizeTarget, key: string): string => {
  const language = getLanguage(target);
  let lookup = translationLookupCache.get(language);
  if (!lookup) {
    lookup = new Map();
    translationLookupCache.set(language, lookup);
  }
  if (lookup.has(key)) return lookup.get(key)!;
  const strings = translationsCache.get(language);
  const parts = key.split(".");
  const value = strings ? resolveTranslationValue(strings, parts) : undefined;
  const result = value ?? key;
  lookup.set(key, result);
  return result;
};

export const createLocalize =
  (
    getHass: () => LocalizeTarget | null | undefined,
  ): ((key: string, ...args: Array<string | number>) => string) =>
  (key: string, ..._args: Array<string | number>) =>
    localize(getHass(), key);

export const getHassLanguage = (
  hass: { language?: unknown; locale?: unknown } | null | undefined,
): string | undefined => {
  if (typeof hass?.language === "string" && hass.language) return hass.language;
  const loc = hass?.locale as { language?: unknown } | undefined;
  return typeof loc?.language === "string" ? loc.language : undefined;
};

export type { LocalizeFunc, LocalizeTarget };
