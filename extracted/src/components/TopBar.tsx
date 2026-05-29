import { ArrowRight, ArrowLeft, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { isRtl } from "@/i18n";

type Props = {
  title: string;
  backTo?: string;
  showSettings?: boolean;
};

export const TopBar = ({ title, backTo, showSettings }: Props) => {
  const { t, i18n } = useTranslation();
  const rtl = isRtl(i18n.language);
  const BackArrow = rtl ? ArrowRight : ArrowLeft;

  return (
    <header className="sticky top-0 z-30 bg-primary border-b-2 border-secondary">
      <div className="h-16 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {backTo ? (
            <Link
              to={backTo}
              aria-label={t("common.back")}
              className="h-11 w-11 grid place-items-center rounded-lg bg-surface border-2 border-secondary shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
            >
              <BackArrow className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </Link>
          ) : (
            <div className="h-11 w-11 grid place-items-center rounded-lg bg-secondary text-primary font-black text-lg">
              {t("common.platformName")}
            </div>
          )}
          <h1 className="font-bold text-lg text-secondary truncate text-balance">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher variant="icon" />
          {showSettings && (
            <Link
              to="/settings"
              aria-label={t("common.settings")}
              className="h-11 w-11 grid place-items-center rounded-lg bg-surface border-2 border-secondary shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
            >
              <Settings className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
