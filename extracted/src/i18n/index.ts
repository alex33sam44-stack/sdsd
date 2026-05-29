import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGS = ["ar", "en", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const STORAGE_KEY = "app.lang";

export const isRtl = (lang: string) => lang.startsWith("ar");

export const applyHtmlLang = (lang: string) => {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = isRtl(lang) ? "rtl" : "ltr";
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
  })
  .then(() => {
    applyHtmlLang(i18n.language || "en");
  });

i18n.on("languageChanged", (lng) => {
  applyHtmlLang(lng);
});

export const setAppLanguage = async (lang: Lang) => {
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
};

export default i18n;
