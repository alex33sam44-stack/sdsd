import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Home, Briefcase, GraduationCap, Stethoscope, Star, X } from "lucide-react";
import { saveSavedPlace, type SavedPlaceKind } from "@/lib/quickAccess";

type Props = {
  defaultLabel?: string;
  lat: number;
  lng: number;
  area?: string;
  onClose: () => void;
  onSaved?: () => void;
};

const KIND_META: { kind: SavedPlaceKind; icon: React.ElementType; labelKey: string }[] = [
  { kind: "home", icon: Home, labelKey: "quick.kind.home" },
  { kind: "work", icon: Briefcase, labelKey: "quick.kind.work" },
  { kind: "university", icon: GraduationCap, labelKey: "quick.kind.university" },
  { kind: "hospital", icon: Stethoscope, labelKey: "quick.kind.hospital" },
  { kind: "custom", icon: Star, labelKey: "quick.kind.custom" },
];

export function SaveDestinationDialog({ defaultLabel = "", lat, lng, area, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<SavedPlaceKind>("custom");
  const [label, setLabel] = useState(defaultLabel);

  const submit = () => {
    const finalLabel =
      kind === "custom" ? label.trim() || defaultLabel || t("quick.untitled") : t(`quick.kind.${kind}`);
    if (!finalLabel) return;
    saveSavedPlace({ kind, label: finalLabel, lat, lng, area });
    onSaved?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border-2 border-secondary rounded-t-2xl sm:rounded-2xl shadow-tactile p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-black text-secondary text-lg">{t("quick.saveTitle")}</h3>
          <button
            onClick={onClose}
            aria-label={t("planner.clear")}
            className="h-9 w-9 grid place-items-center rounded-md hover:bg-surface-alt"
          >
            <X className="w-5 h-5 text-secondary" strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-xs font-bold text-muted-foreground truncate">{defaultLabel}</p>

        <div>
          <p className="text-xs font-black text-secondary mb-2">{t("quick.pickKind")}</p>
          <div className="grid grid-cols-5 gap-2">
            {KIND_META.map(({ kind: k, icon: Icon }) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 ${
                    active
                      ? "bg-primary border-secondary text-secondary"
                      : "bg-surface border-secondary/40 text-secondary hover:bg-surface-alt"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={2.5} />
                  <span className="text-[10px] font-black leading-tight">{t(`quick.kind.${k}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {kind === "custom" && (
          <div>
            <label className="text-xs font-black text-secondary mb-1 block">{t("quick.customLabel")}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("quick.customPlaceholder")}
              className="w-full h-11 px-3 rounded-lg border-2 border-secondary bg-surface font-bold text-secondary"
              maxLength={40}
            />
          </div>
        )}

        <button onClick={submit} className="btn-primary w-full">
          {t("quick.saveCta")}
        </button>
      </div>
    </div>
  );
}
