import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Loader2, MapPin, Navigation, AlertTriangle } from "lucide-react";
import type { Station, TaxiLine } from "@/data/stations";
import {
  CONFIDENCE_LABEL_KEY,
  DIRECTION_HINT_KEY,
  ENTRANCE_SVG,
  directionHint,
  estimateBayWalkSeconds,
  formatWalkDuration,
  projectUserToSvg,
  zoneCenter,
  type LocationConfidence,
  type SvgPoint,
} from "@/lib/stationGuidance";

type Props = {
  station: Station;
  activeLine: TaxiLine | null;
  /** Optional controlled state — when provided, parent owns the user fix so
   *  it can also drive the SVG overlay. */
  userPos?: { point: SvgPoint; confidence: LocationConfidence } | null;
  onUserPosChange?: (p: { point: SvgPoint; confidence: LocationConfidence } | null) => void;
};

const confidenceClass: Record<LocationConfidence, string> = {
  high: "bg-success text-success-foreground border-secondary",
  medium: "bg-primary text-primary-foreground border-secondary",
  low: "bg-surface-alt text-secondary border-secondary",
  unknown: "bg-surface-alt text-secondary border-secondary",
};

/**
 * Station-level guidance.
 *
 * - Always renders a small "أين أقف الآن؟" panel with walking-time pills for
 *   every line, computed from the station entrance (so the user gets useful
 *   information even before granting location permission).
 * - When the user opts in to geolocation AND the result is reliable enough,
 *   we project the position onto the SVG and update the start point.
 * - The SVG overlay is rendered as a sibling absolutely-positioned layer
 *   over the existing StationMap with pointer-events: none — it never
 *   intercepts taps and never replaces the original interactive map.
 */
export const StationGuidance = ({ station, activeLine, userPos, onUserPosChange }: Props) => {
  const { t, i18n } = useTranslation();
  const [internalPos, setInternalPos] = useState<{ point: SvgPoint; confidence: LocationConfidence } | null>(null);
  const pos = userPos !== undefined ? userPos : internalPos;
  const setPos = (p: { point: SvgPoint; confidence: LocationConfidence } | null) => {
    if (onUserPosChange) onUserPosChange(p);
    else setInternalPos(p);
  };
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Reset projected position when switching stations.
  useEffect(() => {
    setPos(null);
    setGeoError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.id]);

  const requestLocation = () => {
    setGeoError(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoError(t("guidance.geoUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const projected = projectUserToSvg(
          p.coords.latitude,
          p.coords.longitude,
          station,
          p.coords.accuracy ?? 9999
        );
        setPos(projected);
        setLocating(false);
      },
      () => {
        setGeoError(t("guidance.geoFailed"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  };

  // Derived: where do we start walking from?
  const startPoint: SvgPoint =
    pos && (pos.confidence === "high" || pos.confidence === "medium")
      ? pos.point
      : ENTRANCE_SVG;
  const startsFromEntrance = startPoint === ENTRANCE_SVG;
  const confidence: LocationConfidence = pos?.confidence ?? "unknown";

  // Active-line guidance (only when one is selected).
  const active = activeLine
    ? {
        line: activeLine,
        seconds: estimateBayWalkSeconds(activeLine.zone, startPoint),
        hint: directionHint(activeLine.zone, startPoint),
        target: zoneCenter(activeLine.zone),
      }
    : null;

  return (
    <section
      aria-label={t("guidance.sectionLabel")}
      className="rounded-2xl border-2 border-secondary bg-surface p-4 space-y-3 shadow-tactile-sm"
    >
      <header className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary border-2 border-secondary grid place-items-center shrink-0">
          <Compass className="w-5 h-5 text-secondary" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-secondary leading-tight text-balance">
            {t("guidance.whereAmITitle")}
          </h3>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5">
            {t("guidance.subtitle")}
          </p>
        </div>
        <span
          className={`pill !text-[11px] !py-0.5 !px-2 ${confidenceClass[confidence]}`}
          title={t("guidance.confTitle")}
        >
          {t(CONFIDENCE_LABEL_KEY[confidence])}
        </span>
      </header>

      {/* Action: ask for location (or refresh) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={requestLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-secondary bg-surface-alt px-3 h-9 text-xs font-black text-secondary shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
          ) : (
            <Navigation className="w-3.5 h-3.5" strokeWidth={2.5} />
          )}
          {pos ? t("guidance.refreshLocation") : t("guidance.useMyLocation")}
        </button>
        {startsFromEntrance && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <MapPin className="w-3 h-3" strokeWidth={2.5} />
            {t("guidance.startingFromEntrance")}
          </span>
        )}
      </div>

      {/* Weak-confidence honesty */}
      {pos && (pos.confidence === "low" || pos.confidence === "unknown") && (
        <div className="rounded-lg border-2 border-dashed border-secondary/50 bg-surface-alt p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-secondary shrink-0 mt-0.5" strokeWidth={2.5} />
          <p className="text-[12px] font-semibold text-secondary leading-relaxed">
            {t("guidance.weakLocation")}
          </p>
        </div>
      )}

      {geoError && (
        <p className="text-xs font-bold text-destructive">{geoError}</p>
      )}

      {/* Active line guidance */}
      {active && (
        <div className="rounded-xl border-2 border-secondary bg-primary/15 p-3 space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="w-2.5 h-8 rounded-md border-2 border-secondary shrink-0"
              style={{ backgroundColor: active.line.color }}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-black text-muted-foreground">
                {t("guidance.targetBay")}
              </p>
              <p className="font-black text-secondary truncate text-sm">
                {active.line.destination}
              </p>
            </div>
            <span className="ms-auto pill !text-[11px] !py-0.5 !px-2 bg-secondary text-secondary-foreground border-secondary">
              {formatWalkDuration(active.seconds, i18n.language)}
            </span>
          </div>
          <p className="text-sm font-bold text-secondary">{t(DIRECTION_HINT_KEY[active.hint])}</p>
          {active.line.pickupArea && (
            <p className="text-[11px] font-semibold text-muted-foreground leading-relaxed">
              {active.line.pickupArea}
            </p>
          )}
        </div>
      )}

      {/* Walking-time pills for every line (always visible, even before geo) */}
      {!active && station.lines.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {station.lines.map((l) => {
            const sec = estimateBayWalkSeconds(l.zone, startPoint);
            return (
              <li
                key={l.id}
                className="rounded-lg border-2 border-secondary bg-surface p-2 flex items-center gap-2 shadow-tactile-sm"
              >
                <span
                  aria-hidden
                  className="w-2 h-7 rounded-sm border border-secondary shrink-0"
                  style={{ backgroundColor: l.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-black text-secondary truncate">
                    {l.destination}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    {formatWalkDuration(sec, i18n.language)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/**
 * SVG overlay rendered ON TOP of the existing StationMap. Same 100x100
 * viewBox. pointer-events: none so the underlying map remains interactive.
 *
 * Renders nothing until we have a target line OR a confidently projected
 * user position.
 */
export const StationGuidanceOverlay = ({
  station,
  activeLine,
  userPos,
}: {
  station: Station;
  activeLine: TaxiLine | null;
  userPos: { point: SvgPoint; confidence: LocationConfidence } | null;
}) => {
  void station;
  const start: SvgPoint =
    userPos && (userPos.confidence === "high" || userPos.confidence === "medium")
      ? userPos.point
      : ENTRANCE_SVG;
  if (!activeLine && !userPos) return null;
  const target = activeLine ? zoneCenter(activeLine.zone) : null;

  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    >
      {target && (
        <line
          x1={start.x}
          y1={start.y}
          x2={target.x}
          y2={target.y}
          stroke="#0A1128"
          strokeWidth="0.8"
          strokeDasharray="2 1.5"
          strokeLinecap="round"
        />
      )}
      {/* User position marker (only when we trust it). */}
      {userPos && (userPos.confidence === "high" || userPos.confidence === "medium") && (
        <g>
          <circle cx={userPos.point.x} cy={userPos.point.y} r="2.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="0.6" />
          <circle cx={userPos.point.x} cy={userPos.point.y} r="4.5" fill="#2563EB" fillOpacity="0.18" />
        </g>
      )}
      {/* Target marker */}
      {target && (
        <g>
          <circle cx={target.x} cy={target.y} r="2" fill="#DC2626" stroke="#FFFFFF" strokeWidth="0.6" />
        </g>
      )}
    </svg>
  );
};
