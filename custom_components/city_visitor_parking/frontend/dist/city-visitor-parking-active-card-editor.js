// src/localize.ts
var DEFAULT_LANGUAGE = "en";
var translationsCache = /* @__PURE__ */ new Map();
var translationsInFlight = /* @__PURE__ */ new Map();
var getGlobalHass = () => {
  const globalHass = window.hass;
  if (globalHass) {
    return globalHass;
  }
  return null;
};
var getLanguage = (target) => {
  const globalHass = getGlobalHass();
  if (!target || typeof target === "function") {
    return globalHass?.locale?.language || globalHass?.language || navigator.language || DEFAULT_LANGUAGE;
  }
  return target.locale?.language || target.language || globalHass?.locale?.language || globalHass?.language || DEFAULT_LANGUAGE;
};
var getBaseUrl = () => new URL(".", import.meta.url).toString().replace(/\/$/, "");
var fetchTranslations = async (baseUrl, language) => {
  const response = await fetch(
    `${baseUrl}/translations/${language}.json`
  ).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
};
var ensureTranslations = async (target) => {
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
var localize = (target, key) => {
  const language = getLanguage(target);
  const strings = translationsCache.get(language) || translationsCache.get(DEFAULT_LANGUAGE);
  if (strings) {
    const directValue = strings[key];
    if (typeof directValue === "string") {
      return directValue;
    }
    const cardStrings = strings.card;
    if (cardStrings && typeof cardStrings === "object") {
      const parts = key.split(".");
      let current = cardStrings;
      for (const part of parts) {
        if (!current || typeof current !== "object") {
          current = void 0;
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

// src/card-shared.ts
var DOMAIN = "city_visitor_parking";

// src/city-visitor-parking-active-card-editor.ts
var getFieldKey = (prefix, name) => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};
var getActiveCardConfigForm = async (hassOrLocalize) => {
  await ensureTranslations(hassOrLocalize);
  return {
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false
      },
      {
        name: "title",
        selector: { text: {} },
        required: false
      },
      {
        name: "icon",
        selector: { icon: {} },
        required: false
      }
    ],
    computeLabel: (schema) => localize(hassOrLocalize, getFieldKey("active_editor.field", schema.name)),
    computeHelper: (schema) => {
      const key = getFieldKey("active_editor.description", schema.name);
      const helper = localize(hassOrLocalize, key);
      return helper === key ? "" : helper;
    }
  };
};
export {
  getActiveCardConfigForm
};
