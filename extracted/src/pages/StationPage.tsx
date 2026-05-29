import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TaxiLine } from "@/data/stations";
import { formatRelativeArabic, toArabicDigits } from "@/lib/storage";
import { isRtl } from "@/i18n";
import { TopBar } from "@/components/TopBar";
import { StationMap } from "@/components/StationMap";
import { LineSheet } from "@/components/LineSheet";
import { Car, Repeat, Loader2, Route as RouteIcon, Clock3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStation } from "@/modules/shared/hooks/useStationsData";
import { freshnessCategory, FRESHNESS_LABEL_KEY, type FreshnessCategory } from "@/lib/ranking";
import { StationGuidance, StationGuidanceOverlay } from "@/components/StationGuidance";
import { AddStationLineDialog } from "@/components/AddStationLineDialog";
import { useUserContributions } from "@/hooks/useUserContributions";
import type { LocationConfidence, SvgPoint } from "@/lib/stationGuidance";

const freshnessChip: Record<FreshnessCategory, string> = {
  now: "bg-success text-success-foreground border-secondary",
  recent: "bg-surface-alt text-secondary border-secondary",
  stale: "bg-destructive text-destructive-foreground border-destructive",
};

const StationPage = () => {
  const { stationId = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rtl = isRtl(i18n.language);
  const { data: station, isLoading } = useStation(stationId);
  const [activeLine, setActiveLine] = useState<TaxiLine | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);
  const [userPos, setUserPos] = useState<{ point: SvgPoint; confidence: LocationConfidence } | null>(null);
  const contributions = useUserContributions();

  const lines = useMemo(() => station?.lines ?? [], [station]);
  const pendingStationLines = useMemo(
    () => contributions.filter((item) => item.type === "station_line" && item.stationId === station?.id),
    [contributions, station?.id],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }
  if (!station) return <Navigate to="/" replace />;

  const fmt = (n: number) => (rtl ? toArabicDigits(n) : String(n));

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={station.name} showSettings />

      <div className="px-5 pt-5 pb-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-muted-foreground tracking-wide">{t("station.area")}</p>
            <p className="font-bold text-secondary truncate">{station.area}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="pill bg-primary">
              <Car className="w-4 h-4" strokeWidth={2.5} />
              <span className="tabular">{t("station.linesCount", { count: lines.length, defaultValue_one: "{{count}} line", defaultValue_other: "{{count}} lines" })}</span>
            </div>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-secondary bg-surface px-3 py-1.5 text-xs font-black text-secondary shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
              aria-label={t("station.changeStation")}
            >
              <Repeat className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>{t("station.changeStation")}</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <StationMap
            lines={lines}
            highlightedId={activeLine?.id}
            onSelectLine={(l) => setActiveLine(l)}
          />
          {/* Guidance overlay — sized to the SVG (1:1 aspect, full width). */}
          <div
            className="absolute top-0 left-0 w-full pointer-events-none"
            style={{ aspectRatio: "1 / 1" }}
            aria-hidden
          >
            <StationGuidanceOverlay
              station={station}
              activeLine={activeLine}
              userPos={userPos}
            />
          </div>
        </div>

        <StationGuidance
          station={station}
          activeLine={activeLine}
          userPos={userPos}
          onUserPosChange={setUserPos}
        />


        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary border-2 border-secondary grid place-items-center shrink-0">
              <RouteIcon className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-black text-secondary text-base">{t("contrib.stationLineCardTitle")}</h2>
              <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                {t("contrib.stationLineCardDesc")}
              </p>
            </div>
          </div>
          {pendingStationLines.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-secondary/30 bg-surface-alt p-3">
              <p className="text-xs font-black text-secondary mb-2 flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5" strokeWidth={2.5} />
                {t("contrib.pendingLineSuggestions", { count: pendingStationLines.length })}
              </p>
              <div className="flex flex-wrap gap-2">
                {pendingStationLines.slice(0, 4).map((item) => (
                  <span key={item.id} className="pill bg-primary !text-[10px] !py-0.5 !px-2">
                    {item.destination}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={() => setShowAddLine(true)} className="btn-primary w-full">
            <RouteIcon className="w-5 h-5" strokeWidth={2.5} />
            {t("contrib.addLineInStation")}
          </button>
        </section>

        <div>
          <h2 className="font-black text-secondary text-lg mb-3">{t("station.availableLines")}</h2>
          <ul className="space-y-3">
            {lines.map((l) => {
              const fresh = freshnessCategory(l.updatedAt);
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setActiveLine(l)}
                    className="w-full text-start rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform flex items-center gap-3"
                  >
                    <span
                      aria-hidden
                      className="w-3 h-12 rounded-md border-2 border-secondary shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-secondary truncate">{l.destination}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span
                          className={`pill !text-[10px] !py-0 !px-1.5 ${freshnessChip[fresh]}`}
                        >
                          {t(FRESHNESS_LABEL_KEY[fresh])}
                        </span>
                        <p className="text-xs text-muted-foreground font-semibold">
                          {formatRelativeArabic(l.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <span className={`pill ${l.cars > 0 ? "bg-primary" : "bg-destructive text-destructive-foreground border-destructive"}`}>
                      <Car className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span className="tabular">{fmt(l.cars)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <LineSheet line={activeLine} stationId={station.id} onClose={() => setActiveLine(null)} />
      {showAddLine && <AddStationLineDialog station={station} onClose={() => setShowAddLine(false)} />}
    </div>
  );
};

export default StationPage;
