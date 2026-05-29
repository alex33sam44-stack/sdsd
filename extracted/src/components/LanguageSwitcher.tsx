import { Check, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setAppLanguage, SUPPORTED_LANGS, type Lang } from "@/i18n";

type Props = {
  variant?: "icon" | "full";
  className?: string;
};

const LANG_LABEL_KEY: Record<Lang, string> = {
  ar: "common.arabic",
  en: "common.english",
  fr: "common.french",
};

const LANG_SHORT: Record<Lang, string> = {
  ar: "ع",
  en: "EN",
  fr: "FR",
};

const normalize = (lng: string): Lang => {
  if (lng?.startsWith("ar")) return "ar";
  if (lng?.startsWith("fr")) return "fr";
  return "en";
};

/**
 * Language switcher. The "icon" variant is a dropdown menu that lists all
 * supported languages with the active one marked. The "full" variant is the
 * labeled control used inside the Settings page.
 */
export const LanguageSwitcher = ({ variant = "icon", className }: Props) => {
  const { i18n, t } = useTranslation();
  const current = normalize(i18n.language);
  const order = SUPPORTED_LANGS;

  const switchTo = (lang: Lang) => {
    void setAppLanguage(lang);
  };

  if (variant === "full") {
    return (
      <div
        className={
          "rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3 " +
          (className ?? "")
        }
      >
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-secondary" strokeWidth={2.5} />
          <h2 className="font-black text-secondary">{t("settings.language")}</h2>
        </div>
        <p className="text-sm text-muted-foreground font-semibold">
          {t("settings.languageDesc")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {order.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => switchTo(lang)}
              className={`h-11 rounded-lg border-2 border-secondary font-black shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform ${
                current === lang ? "bg-primary text-secondary" : "bg-surface text-secondary"
              }`}
            >
              {t(LANG_LABEL_KEY[lang])}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <LanguageDropdown current={current} order={order} className={className} switchTo={switchTo} t={t} />;
};

type DropdownProps = {
  current: Lang;
  order: readonly Lang[];
  className?: string;
  switchTo: (lang: Lang) => void;
  t: (key: string) => string;
};

const LanguageDropdown = ({ current, order, className, switchTo, t }: DropdownProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={"relative " + (className ?? "")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("common.language")}
        title={t("common.language")}
        className="h-11 px-2 min-w-11 grid place-items-center rounded-lg bg-surface border-2 border-secondary shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
      >
        <span className="flex items-center gap-1 text-secondary font-black text-xs">
          <Languages className="w-4 h-4" strokeWidth={2.5} />
          {LANG_SHORT[current]}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 mt-2 min-w-[10rem] rounded-xl border-2 border-secondary bg-surface shadow-tactile-sm overflow-hidden z-50"
        >
          {order.map((lang) => {
            const active = lang === current;
            return (
              <button
                key={lang}
                role="menuitemradio"
                aria-checked={active}
                type="button"
                onClick={() => {
                  switchTo(lang);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 h-11 font-black text-sm border-b-2 border-secondary last:border-b-0 transition-colors ${
                  active ? "bg-primary text-secondary" : "bg-surface text-secondary hover:bg-primary/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="inline-grid place-items-center w-7 h-7 rounded-md bg-secondary text-primary text-xs">
                    {LANG_SHORT[lang]}
                  </span>
                  {t(LANG_LABEL_KEY[lang])}
                </span>
                {active && <Check className="w-4 h-4" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
