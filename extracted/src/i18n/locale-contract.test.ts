import { describe, expect, it } from "vitest";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import { SUPPORTED_LANGS, isRtl } from "./index";

type LocaleTree = Record<string, unknown>;

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];

  return Object.entries(value as LocaleTree).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return flattenKeys(child, next);
    }
    return [next];
  });
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as LocaleTree).flatMap(collectStrings);
}

describe("i18n locale contract", () => {
  const locales = { ar, en, fr } as const;
  const baseKeys = flattenKeys(ar).sort();

  it("keeps Arabic, English, and French enabled", () => {
    expect(SUPPORTED_LANGS).toEqual(["ar", "en", "fr"]);
  });

  it("keeps every locale structurally aligned", () => {
    for (const [lang, locale] of Object.entries(locales)) {
      expect(flattenKeys(locale).sort(), `${lang} locale keys`).toEqual(baseKeys);
    }
  });

  it("uses English copy in the English locale", () => {
    const englishValues = collectStrings(en).join("\n");
    expect(englishValues).not.toMatch(/[\u0600-\u06FF]/);
    expect(en.common.language).toBe("Language");
    expect(en.settings.language).toBe("Interface language");
    expect(en.admin.dashboard).toBe("Admin dashboard");
  });

  it("keeps layout direction safe per language", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("ar-EG")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("fr")).toBe(false);
  });
});
