import { useEffect } from "react";
import { TaxiLine } from "@/data/stations";
import { formatRelativeTime, formatNumber } from "@/lib/storage";
import { Bus, Car, Clock, MapPin, Navigation, X, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isRtl } from "@/i18n";
import {
  computeConfidence,
  freshnessCategory,
  CONFIDENCE_LABEL_KEY,
  FRESHNESS_LABEL_KEY,
  type ConfidenceLevel,
  type FreshnessCategory,
} from "@/lib/ranking";

const confidenceClass: Record<ConfidenceLevel, string> = {
  high: "bg-success text-success-foreground border-secondary",
  medium: "bg-primary text-primary-foreground border-secondary",
  low: "bg-surface-alt text-secondary border-secondary",
};
const freshnessClass: Record<FreshnessCategory, string> = {
  now: "bg-success text-success-foreground border-secondary",
  recent: "bg-surface-alt text-secondary border-secondary",
  stale: "bg-destructive text-destructive-foreground border-destructive",
};

type Props = {
  line: TaxiLine | null;
  stationId: string;
  onClose: () => void;
};

export const LineSheet = ({ line, stationId, onClose }: Props) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rtl = isRtl(i18n.language);
  const ArrowIcon = rtl ? ArrowLeft : ArrowRight;

  useEffect(() => {
    if (!line) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [line, onClose]);

  if (!line) return null;

  const carsLabel = formatNumber(line.cars, i18n.language);
  const lineStatus = (line as { status?: string }).status ?? "active";
  const confidence = computeConfidence({
    updatedAt: line.updatedAt,
    status: lineStatus,
    stopsCount: line.stops?.length ?? 0,
    hasPickupArea: !!line.pickupArea,
  }).level;
  const freshness = freshnessCategory(line.updatedAt);

  return (
    <div className="fixed inset-0 z-50 flex justify-center" aria-modal="true" role="dialog">
      {/* Scrim */}
      <button
        aria-label={t("lineSheet.close")}
        onClick={onClose}
        className="absolute inset-0 bg-secondary/60 animate-fade-in"
      />
      {/* Sheet */}
      <div className="absolute bottom-0 inset-x-0 max-w-[480px] mx-auto animate-sheet-up">
        <div className="bg-surface rounded-t-3xl border-t-2 border-x-2 border-secondary p-6 pb-8 shadow-[0_-8px_0_0_hsl(var(--secondary))]">
          {/* Grabber */}
          <div className="mx-auto w-12 h-1.5 rounded-full bg-secondary/30 mb-5" />

          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden
                className="w-4 h-12 rounded-md border-2 border-secondary shrink-0"
                style={{ backgroundColor: line.color }}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-muted-foreground">{t("lineSheet.destination")}</p>
                <h2 className="text-2xl font-black text-secondary truncate text-balance">
                  {line.destination}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("lineSheet.close")}
              className="h-10 w-10 grid place-items-center rounded-lg border-2 border-secondary bg-surface shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
            >
              <X className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </button>
          </div>

          {/* Confidence + freshness pills (additive, non-destructive). */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={`pill !text-[11px] !py-0.5 !px-2 ${confidenceClass[confidence]}`}>
              <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
              {t("confidence.title")}: {t(CONFIDENCE_LABEL_KEY[confidence])}
            </span>
            <span className={`pill !text-[11px] !py-0.5 !px-2 ${freshnessClass[freshness]}`}>
              {t(FRESHNESS_LABEL_KEY[freshness])}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border-2 border-secondary bg-primary/15 p-3">
              <div className="flex items-center gap-2 text-secondary">
                <Car className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-xs font-bold">{t("lineSheet.availableCars")}</span>
              </div>
              <p className="mt-1 text-3xl font-black text-secondary tabular">
                {carsLabel}
              </p>
            </div>
            <div className="rounded-xl border-2 border-secondary bg-surface-alt p-3">
              <div className="flex items-center gap-2 text-secondary">
                <Clock className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-xs font-bold">{t("lineSheet.lastUpdate")}</span>
              </div>
              <p className="mt-1 text-base font-bold text-secondary leading-tight pt-1">
                {formatRelativeTime(line.updatedAt, i18n.language)}
              </p>
            </div>
          </div>

          {line.vehicleType && (
            <div className="rounded-xl border-2 border-secondary bg-surface-alt p-3 mb-3 flex items-center gap-2">
              <Bus className="w-4 h-4 text-secondary shrink-0" strokeWidth={2.5} />
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("lineSheet.vehicleType")}</p>
                <p className="text-sm font-bold text-secondary">{line.vehicleType}</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border-2 border-dashed border-secondary/40 p-3 mb-5 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-secondary mt-0.5 shrink-0" strokeWidth={2.5} />
            <div>
              <p className="text-xs font-bold text-muted-foreground">{t("lineSheet.pickupHere")}</p>
              <p className="text-sm font-semibold text-secondary">{line.pickupArea}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => navigate(`/route/${stationId}/${line.id}`)}
              className="btn-primary w-full"
            >
              <span>{t("lineSheet.viewRoute")}</span>
              <ArrowIcon className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <button
              onClick={() => navigate(`/route/${stationId}/${line.id}?start=1`)}
              disabled={line.cars === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-secondary text-secondary-foreground font-black py-3 px-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50 disabled:active:translate-y-0"
            >
              <Navigation className="w-5 h-5" strokeWidth={2.5} />
              <span>{t("lineSheet.startTrip")}</span>
            </button>
          </div>
          {line.cars === 0 && (
            <p className="text-center text-xs font-bold text-destructive mt-3">
              {t("lineSheet.noCars")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
