import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { SavedPlacesPanel } from "@/components/SavedPlacesPanel";
import { SaveDestinationDialog } from "@/components/SaveDestinationDialog";
import {
  parsePlaceParam,
  pushRecentDestination,
  pushRecentSearch,
} from "@/lib/quickAccess";
import { Bookmark } from "lucide-react";
import {
  planTrip,
  searchPlaces,
  googleMapsUrl,
  findNearbyKnownStops,
  type PlanResult,
  type Place,
  type SearchHit,
  type ResultLabel,
} from "@/lib/planner";
import { formatNumber, formatRelativeTime } from "@/lib/storage";
import type { Station as PlannerStation } from "@/data/stations";
import { timeSync } from "@/lib/perf";
import {
  CONFIDENCE_LABEL_KEY,
  FRESHNESS_LABEL_KEY,
  type ConfidenceLevel,
  type FreshnessCategory,
  type Reason,
  type ReasonTone,
} from "@/lib/ranking";
import { MODE_LABEL_KEY, MODE_BADGE_KEY, type TransportMode } from "@/lib/transportMode";
import { useTenant } from "@/modules/tenancy/TenantContext";
import { routeShareUrl, routeWhatsAppUrl } from "@/lib/whatsappShare";
import { markInstallValueMoment } from "@/lib/installPrompt";
import { useAuth } from "@/modules/auth/useAuth";
import { trackGrowthEvent } from "@/marketing/lib/growth";
import { UGCContributionPanel } from "@/marketing/components/UGCContributionPanel";
import { TrustLayerPanel } from "@/marketing/components/TrustLayerPanel";
import { listPublishedStations, getStationWithLines } from "@/modules/shared/services/stations";
import { adaptStation } from "@/modules/shared/services/seedAdapter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
  ExternalLink,
  Bus,
  Car,
  Footprints,
  ArrowLeftRight,
  Compass,
  PlayCircle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  Info,
  MessageCircle,
} from "lucide-react";

type OriginMode = "geo" | "manual";

const useFormatKm = () => {
  const { t, i18n } = useTranslation();
  return (km: number) =>
    km < 1
      ? `${formatNumber(Math.round(km * 1000), i18n.language)} ${t("planner.metersUnit")}`
      : `${formatNumber(km.toFixed(1), i18n.language)} ${t("planner.kmUnit")}`;
};

const estimateTripMetrics = (result: PlanResult) => {
  const walkingMinutes = Math.ceil((result.walkToPickupKm + result.walkFromDropoffKm) * 13);
  const rideMinutes = result.isDirect ? 22 : 32;
  const trafficBuffer = result.confidence === "low" ? 12 : result.confidence === "medium" ? 7 : 4;
  const estimatedMinutes = Math.max(18, walkingMinutes + rideMinutes + trafficBuffer);
  const transfers = result.isDirect ? 0 : 1;
  const baseFare = result.transportMode === "metro" ? 10 : result.transportMode === "formal_bus" ? 12 : 15;
  const estimatedCost = baseFare + transfers * 8;
  const traffic = result.confidence === "high" ? "خفيفة" : result.confidence === "medium" ? "متوسطة" : "عالية";

  return { estimatedMinutes, estimatedCost, transfers, traffic };
};

function pickFirstPlace(query: string | null, stations: PlannerStation[]): Place | null {
  if (!query) return null;
  const hit = searchPlaces(query, stations)[0];
  if (!hit) return null;
  return { lat: hit.lat, lng: hit.lng, label: hit.name };
}


const labelStyles: Record<ResultLabel, string> = {
  "مباشر": "bg-success text-success-foreground border-secondary",
  "هتنزل قريب من المكان": "bg-accent text-accent-foreground border-secondary",
  "الأقرب لموقعك": "bg-primary text-primary-foreground border-secondary",
  "أسرع اختيار": "bg-secondary text-secondary-foreground border-secondary",
  "يحتاج تبديل": "bg-surface-alt text-secondary border-secondary",
  "الأفضل الآن": "bg-success text-success-foreground border-secondary",
};

const LABEL_KEY: Record<ResultLabel, string> = {
  "مباشر": "planner.labelDirect",
  "هتنزل قريب من المكان": "planner.labelNearDropoff",
  "الأقرب لموقعك": "planner.labelNearestToYou",
  "أسرع اختيار": "planner.labelFastest",
  "يحتاج تبديل": "planner.labelTransfer",
  "الأفضل الآن": "planner.labelBestNow",
};

const confidenceStyles: Record<ConfidenceLevel, string> = {
  high: "bg-success text-success-foreground border-secondary",
  medium: "bg-primary text-primary-foreground border-secondary",
  low: "bg-surface-alt text-secondary border-secondary",
};

const freshnessStyles: Record<FreshnessCategory, string> = {
  now: "bg-success text-success-foreground border-secondary",
  recent: "bg-surface-alt text-secondary border-secondary",
  stale: "bg-destructive text-destructive-foreground border-destructive",
};

const modeStyles: Record<TransportMode, string> = {
  bus: "bg-primary text-primary-foreground border-secondary",
  microbus: "bg-accent text-accent-foreground border-secondary",
  minibus: "bg-accent text-accent-foreground border-secondary",
  station_taxi: "bg-surface-alt text-secondary border-secondary",
  community: "bg-warning/40 text-secondary border-secondary",
};

const toneDot: Record<ReasonTone, string> = {
  positive: "bg-success",
  neutral: "bg-primary",
  negative: "bg-destructive",
};

const ReasonList = ({ reasons }: { reasons: Reason[] }) => {
  const { t } = useTranslation();
  if (!reasons.length) return null;
  return (
    <ul className="space-y-1.5">
      {reasons.map((r, i) => (
        <li key={`${r.key}:${i}`} className="flex items-start gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${toneDot[r.tone]}`}
            aria-hidden
          />
          <span className="text-xs font-semibold text-secondary leading-relaxed">
            {t(r.key, r.vars)}
          </span>
        </li>
      ))}
    </ul>
  );
};

const VehicleIcon = ({ type }: { type?: string }) => {
  if (type === "تاكسي موقف") return <Car className="w-4 h-4" strokeWidth={2.5} />;
  return <Bus className="w-4 h-4" strokeWidth={2.5} />;
};

const PlaceSearch = ({
  placeholder,
  value,
  stations,
  disabled = false,
  onChange,
  onPick,
  onClear,
}: {
  placeholder: string;
  value: string;
  stations: PlannerStation[];
  disabled?: boolean;
  onChange: (v: string) => void;
  onPick: (hit: SearchHit) => void;
  onClear: () => void;
}) => {
  const { t } = useTranslation();
  const hits = useMemo(() => searchPlaces(value, stations), [value, stations]);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-surface border-2 border-secondary rounded-xl px-3 h-12 shadow-tactile-sm">
        <Search className="w-4 h-4 text-secondary shrink-0" strokeWidth={2.5} />
        <input
          type="text"
          inputMode="search"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-secondary font-bold placeholder:text-muted-foreground placeholder:font-semibold"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("planner.clear")}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-surface-alt"
          >
            <X className="w-4 h-4 text-secondary" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full bg-surface border-2 border-secondary rounded-xl shadow-tactile overflow-hidden">
          {hits.map((h) => (
            <li key={`${h.type}:${h.id}:${h.name}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setOpen(false);
                }}
                className="w-full text-start px-3 py-2.5 hover:bg-surface-alt flex items-center gap-2"
              >
                <MapPin className="w-4 h-4 text-secondary shrink-0" strokeWidth={2.5} />
                <div className="min-w-0">
                  <p className="font-bold text-secondary truncate">{h.name}</p>
                  {h.area && (
                    <p className="text-xs text-muted-foreground font-semibold truncate">
                      {h.area}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const TripSummarySheet = ({
  result,
  open,
  onOpenChange,
}: {
  result: PlanResult | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const { t, i18n } = useTranslation();
  const formatKm = useFormatKm();
  if (!result) return null;
  const vehicle = result.line.vehicleType ?? t("planner.vehicleMicrobus");
  const steps = [
    {
      icon: <Footprints className="w-5 h-5" strokeWidth={2.5} />,
      title: t("planner.stepWalkPickup"),
      detail: `${result.pickupStop.name} • ${formatKm(result.walkToPickupKm)}`,
      action: {
        href: googleMapsUrl(result.pickupStop.lat, result.pickupStop.lng),
        label: t("planner.openInMaps"),
      },
    },
    {
      icon: <Bus className="w-5 h-5" strokeWidth={2.5} />,
      title: t("planner.stepRide", {
        station: result.station.name,
        destination: result.line.destination,
      }),
      detail: `${vehicle} • ${result.line.pickupArea}`,
    },
    {
      icon: <MapPin className="w-5 h-5" strokeWidth={2.5} />,
      title: t("planner.stepDropoff", { name: result.dropoffStop.name }),
      detail: result.station.name,
      action: {
        href: googleMapsUrl(result.dropoffStop.lat, result.dropoffStop.lng),
        label: t("planner.openInMaps"),
      },
    },
    {
      icon: <Compass className="w-5 h-5" strokeWidth={2.5} />,
      title: t("planner.stepWalkDest", { km: formatKm(result.walkFromDropoffKm) }),
      detail: result.isDirect ? t("planner.arriveDirect") : t("planner.arriveNear"),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-t-2 border-secondary max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader className="text-start">
          <SheetTitle className="font-black text-secondary">
            {t("planner.tripSteps")}
          </SheetTitle>
          <SheetDescription className="font-semibold">
            {t("planner.lineLabel", {
              station: result.station.name,
              destination: result.line.destination,
            })}
          </SheetDescription>
        </SheetHeader>

        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm"
            >
              <div className="h-10 w-10 rounded-lg bg-primary text-secondary grid place-items-center shrink-0 border-2 border-secondary">
                <span className="font-black text-sm tabular">
                  {formatNumber(i + 1, i18n.language)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-secondary">
                  {s.icon}
                  <p className="font-black leading-tight text-balance">
                    {s.title}
                  </p>
                </div>
                <p className="text-xs font-semibold text-muted-foreground mt-1">
                  {s.detail}
                </p>
                {s.action && (
                  <a
                    href={s.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-black text-secondary underline mt-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
                    {s.action.label}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>

        <Link
          to={`/route/${result.station.id}/${result.line.id}`}
          className="btn-secondary w-full !h-11 !text-sm mt-4"
        >
          <ArrowLeftRight className="w-4 h-4" strokeWidth={2.5} />
          {t("planner.viewFullRoute")}
        </Link>
      </SheetContent>
    </Sheet>
  );
};

const ResultCard = ({
  r,
  onStart,
}: {
  r: PlanResult;
  onStart: (r: PlanResult) => void;
}) => {
  const { t, i18n } = useTranslation();
  const formatKm = useFormatKm();
  const [whyOpen, setWhyOpen] = useState(false);
  const carsAvailable = r.cars > 0;
  const vehicle = r.line.vehicleType ?? t("planner.vehicleMicrobus");
  const metrics = estimateTripMetrics(r);
  const trackShare = () => {
    void trackGrowthEvent("guest_route_shared", {
      station_id: r.station.id,
      line_id: r.line.id,
      from: r.pickupStop.name,
      to: r.dropoffStop.name,
      channel: "whatsapp",
      pre_login: true,
    });
    void trackGrowthEvent("route_share_created", {
      station_id: r.station.id,
      line_id: r.line.id,
      channel: "whatsapp",
    });
    markInstallValueMoment("route_shared", {
      station_id: r.station.id,
      line_id: r.line.id,
      from: r.pickupStop.name,
      to: r.dropoffStop.name,
    });
  };
  return (
    <article
      className={`card-tactile space-y-4 ${
        r.isTopPick ? "ring-2 ring-success ring-offset-2 ring-offset-background" : ""
      }`}
    >
      {/* Top-pick highlight */}
      {r.isTopPick && (
        <div className="flex items-center gap-2 -mt-1">
          <span className="pill !text-xs !py-0.5 !px-2.5 bg-success text-success-foreground border-secondary inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
            {t("recommend.topPickBadge")}
          </span>
        </div>
      )}

      {/* Labels */}
      <div className="flex flex-wrap gap-2">
        {r.labels.map((l) => (
          <span
            key={l}
            className={`pill !text-xs !py-0.5 !px-2.5 ${labelStyles[l]}`}
          >
            {t(LABEL_KEY[l])}
          </span>
        ))}
      </div>

      {/* Decision-support row: mode + confidence + freshness + operator. */}
      <div className="flex flex-wrap items-center gap-2 -mt-1">
        <span
          className={`pill !text-[11px] !py-0.5 !px-2 ${modeStyles[r.transportMode]}`}
          title={t("transportMode.title", "نوع المواصلة")}
        >
          {t(MODE_LABEL_KEY[r.transportMode])}
          <span className="ms-1 opacity-80">
            · {t(MODE_BADGE_KEY[r.transportMode])}
          </span>
        </span>
        <span
          className={`pill !text-[11px] !py-0.5 !px-2 ${confidenceStyles[r.confidence]}`}
          title={t("confidence.title")}
        >
          {t("confidence.title")}: {t(CONFIDENCE_LABEL_KEY[r.confidence])}
        </span>
        <span
          className={`pill !text-[11px] !py-0.5 !px-2 ${freshnessStyles[r.freshness]}`}
          title={t("freshness.title")}
        >
          {t(FRESHNESS_LABEL_KEY[r.freshness])}
        </span>
        <span
          className={`pill !text-[11px] !py-0.5 !px-2 inline-flex items-center gap-1 ${
            r.operatorConfirmed
              ? "bg-success text-success-foreground border-secondary"
              : "bg-surface-alt text-secondary border-secondary"
          }`}
          title={t(
            r.operatorConfirmed ? "operator.confirmedHint" : "operator.unconfirmedHint"
          )}
        >
          {r.operatorConfirmed ? (
            <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
          ) : (
            <ShieldAlert className="w-3 h-3" strokeWidth={2.5} />
          )}
          {t(r.operatorConfirmed ? "operator.confirmedBadge" : "operator.unconfirmedBadge")}
        </span>
        {r.updatedAt && (
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
            {formatRelativeTime(r.updatedAt, i18n.language)}
          </span>
        )}
      </div>

      {/* Why this result / why this confidence — collapsible explanation. */}
      <div className="rounded-lg border-2 border-secondary bg-surface-alt overflow-hidden">
        <button
          type="button"
          onClick={() => setWhyOpen((v) => !v)}
          aria-expanded={whyOpen}
          className="w-full flex items-center gap-2 px-3 py-2 text-start"
        >
          <Info className="w-4 h-4 text-secondary shrink-0" strokeWidth={2.5} />
          <span className="text-xs font-black text-secondary flex-1">
            {whyOpen ? t("recommend.hideWhy") : t("recommend.showWhy")}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-secondary transition-transform ${
              whyOpen ? "rotate-180" : ""
            }`}
            strokeWidth={2.5}
          />
        </button>
        {whyOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
            <div>
              <p className="text-[11px] font-black text-muted-foreground mb-1.5">
                {t("recommend.whyResult")}
              </p>
              <ReasonList reasons={r.whyResult} />
            </div>
            <div>
              <p className="text-[11px] font-black text-muted-foreground mb-1.5">
                {t("recommend.whyConfidence")} ·{" "}
                <span className="tabular-nums">
                  {formatNumber(r.confidenceScore, i18n.language)}/100
                </span>
              </p>
              <ReasonList reasons={r.whyConfidence} />
            </div>
          </div>
        )}
      </div>

      {/* Header: vehicle + line */}
      <div className="flex items-start gap-3">
        <div
          className="h-12 w-12 rounded-xl border-2 border-secondary grid place-items-center shrink-0 shadow-tactile-sm"
          style={{ backgroundColor: r.line.color }}
        >
          <VehicleIcon type={r.line.vehicleType} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-muted-foreground tracking-wide">
            {t("planner.rideVehicle", { vehicle })}
          </p>
          <h3 className="font-black text-secondary text-lg leading-tight text-balance">
            {t("planner.lineLabel", {
              station: r.station.name,
              destination: r.line.destination,
            })}
          </h3>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5">
            {r.station.area}
          </p>
        </div>
      </div>

      {/* From → To */}
      <div className="grid gap-2 bg-surface-alt rounded-lg p-3 border border-border">
        <div className="flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-success shrink-0 mt-2" />
          <div className="min-w-0">
            <p className="text-[11px] font-black text-muted-foreground">
              {t("planner.pickupHere")}
            </p>
            <p className="text-sm font-bold text-secondary truncate">
              {r.pickupStop.name}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-destructive shrink-0 mt-2" />
          <div className="min-w-0">
            <p className="text-[11px] font-black text-muted-foreground">
              {t("planner.dropoffHere")}
            </p>
            <p className="text-sm font-bold text-secondary truncate">
              {r.dropoffStop.name}
            </p>
          </div>
        </div>
      </div>

      {/* Instant value: time, cost, transfers, traffic — visible before login. */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg border-2 border-secondary p-2 bg-primary">
          <p className="text-[10px] font-black text-secondary/70">الوقت</p>
          <p className="text-sm font-black text-secondary tabular">{formatNumber(metrics.estimatedMinutes, i18n.language)} د</p>
        </div>
        <div className="rounded-lg border-2 border-secondary p-2 bg-primary">
          <p className="text-[10px] font-black text-secondary/70">التكلفة</p>
          <p className="text-sm font-black text-secondary tabular">{formatNumber(metrics.estimatedCost, i18n.language)} ج</p>
        </div>
        <div className="rounded-lg border-2 border-secondary p-2 bg-primary">
          <p className="text-[10px] font-black text-secondary/70">التبديلات</p>
          <p className="text-sm font-black text-secondary tabular">{formatNumber(metrics.transfers, i18n.language)}</p>
        </div>
        <div className="rounded-lg border-2 border-secondary p-2 bg-primary">
          <p className="text-[10px] font-black text-secondary/70">الزحمة</p>
          <p className="text-sm font-black text-secondary">{metrics.traffic}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border-2 border-secondary p-2 bg-surface">
          <Footprints className="w-4 h-4 text-secondary mx-auto" strokeWidth={2.5} />
          <p className="text-[10px] font-bold text-muted-foreground mt-1">
            {t("planner.walkAbout")}
          </p>
          <p className="text-sm font-black text-secondary tabular">
            {formatKm(r.walkToPickupKm)}
          </p>
        </div>
        <div className="rounded-lg border-2 border-secondary p-2 bg-surface">
          <Compass className="w-4 h-4 text-secondary mx-auto" strokeWidth={2.5} />
          <p className="text-[10px] font-bold text-muted-foreground mt-1">
            {t("planner.fromDropoffToDest")}
          </p>
          <p className="text-sm font-black text-secondary tabular">
            {formatKm(r.walkFromDropoffKm)}
          </p>
        </div>
        <div className="rounded-lg border-2 border-secondary p-2 bg-surface">
          <Car className="w-4 h-4 text-secondary mx-auto" strokeWidth={2.5} />
          <p className="text-[10px] font-bold text-muted-foreground mt-1">{t("planner.cars")}</p>
          <p
            className={`text-sm font-black tabular ${
              carsAvailable ? "text-success" : "text-destructive"
            }`}
          >
            {carsAvailable ? formatNumber(r.cars, i18n.language) : t("planner.noVehicles")}
          </p>
        </div>
      </div>

      {/* Pickup area hint */}
      <p className="text-xs font-semibold text-muted-foreground">
        {t("planner.pickupArea", { area: r.line.pickupArea })}
      </p>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={() => onStart(r)}
        className="btn-primary w-full !h-12 !text-base"
      >
        <PlayCircle className="w-5 h-5" strokeWidth={2.5} />
        {t("planner.startTrip")}
      </button>

      {/* WhatsApp-first sharing */}
      <a
        href={routeWhatsAppUrl(r)}
        onClick={trackShare}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-[#25D366] px-4 text-base font-black text-white shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
        aria-label="ابعت الطريق على واتساب"
      >
        <MessageCircle className="w-5 h-5" strokeWidth={2.5} />
        ابعت الجروب يشوفوا الطريق
      </a>

      <p className="-mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold leading-relaxed text-emerald-900">
        نص جاهز باللهجة + لينك يفتح نفس الطريق مباشرة على مواصلات.
      </p>

      <TrustLayerPanel
        compact
        context={{
          routeName: `${r.pickupStop.name} → ${r.dropoffStop.name}`,
          from: r.pickupStop.name,
          to: r.dropoffStop.name,
          stationId: r.station.id,
          lineId: r.line.id,
        }}
      />

      <UGCContributionPanel
        compact
        context={{
          routeName: `${r.pickupStop.name} → ${r.dropoffStop.name}`,
          from: r.pickupStop.name,
          to: r.dropoffStop.name,
          stationId: r.station.id,
          lineId: r.line.id,
        }}
        title="شوفت الطريق؟ ساعد اللي بعدك"
      />

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={googleMapsUrl(r.pickupStop.lat, r.pickupStop.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary !h-11 !text-sm !px-3"
        >
          <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
          {t("planner.pickupLocation")}
        </a>
        <a
          href={googleMapsUrl(r.dropoffStop.lat, r.dropoffStop.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary !h-11 !text-sm !px-3"
        >
          <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
          {t("planner.dropoffLocation")}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/route/${r.station.id}/${r.line.id}`}
          className="btn-secondary !h-11 !text-sm !px-3"
        >
          <ArrowLeftRight className="w-4 h-4" strokeWidth={2.5} />
          {t("planner.viewFullRoute")}
        </Link>
        <a
          href={routeShareUrl(r)}
          onClick={trackShare}
          className="btn-secondary !h-11 !text-sm !px-3"
        >
          <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
          رابط المشاركة
        </a>
      </div>
    </article>
  );
};

const NoResultsCard = ({ destination, stations }: { destination: Place; stations: PlannerStation[] }) => {
  const { t } = useTranslation();
  const formatKm = useFormatKm();
  const nearby = useMemo(
    () => findNearbyKnownStops(destination, 3, 5, stations),
    [destination, stations]
  );
  return (
    <div className="card-tactile space-y-4">
      <div>
        <h4 className="font-black text-secondary text-lg leading-tight text-balance">
          {t("planner.noDirectTitle")}
        </h4>
        <p className="text-sm font-semibold text-muted-foreground mt-1 leading-relaxed">
          {t("planner.noDirectDesc")}
        </p>
      </div>

      {nearby.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-secondary">
            {t("planner.nearbyKnown")}
          </p>
          <ul className="space-y-2">
            {nearby.map((n) => (
              <li
                key={`${n.stationId}:${n.stopId}:${n.stopName}`}
                className="flex items-center gap-2 rounded-lg border-2 border-secondary bg-surface p-2.5"
              >
                <MapPin
                  className="w-4 h-4 text-secondary shrink-0"
                  strokeWidth={2.5}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-secondary truncate text-sm">
                    {n.stopName}
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">
                    {n.stationName} • {formatKm(n.distanceKm)}
                  </p>
                </div>
                <a
                  href={googleMapsUrl(n.lat, n.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-black text-secondary underline"
                >
                  {t("planner.maps")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const PlannerPage = () => {
  const { t, i18n } = useTranslation();
  const [originMode, setOriginMode] = useState<OriginMode>("geo");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [tripOpen, setTripOpen] = useState(false);
  const [tripResult, setTripResult] = useState<PlanResult | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savedReload, setSavedReload] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const loggedDestRef = useRef<string | null>(null);
  const guestRouteLoggedRef = useRef<string | null>(null);
  const seededFromMarketingRef = useRef(false);

  const { currentTenant } = useTenant();
  const currentLocationLabel = t("planner.currentLocationLabel");

  const {
    data: plannerStations = [],
    isLoading: plannerLoading,
    isError: plannerError,
  } = useQuery<PlannerStation[]>({
    queryKey: ["planner:stations", currentTenant?.slug ?? "public"],
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await listPublishedStations();
      if (!rows.length) return [];
      const detailed = await Promise.all(rows.map((s) => getStationWithLines(s.id).catch(() => null)));
      return detailed.filter((row): row is NonNullable<typeof row> => Boolean(row)).map(adaptStation);
    },
  });

  const requestGeo = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError(t("planner.geoUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: currentLocationLabel,
        });
        setOriginMode("geo");
        setLocating(false);
      },
      () => {
        setGeoError(t("planner.geoFailed"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  };

  // Quick re-plan: prefill from URL params (?dest=lat,lng,label, ?origin=..., ?from=geo)
  useEffect(() => {
    const destParam = parsePlaceParam(searchParams.get("dest"));
    if (destParam && !destination) {
      setDestination({ lat: destParam.lat, lng: destParam.lng, label: destParam.label });
      setDestQuery(destParam.label);
    }
    const originParam = parsePlaceParam(searchParams.get("origin"));
    if (originParam && !origin) {
      setOrigin({ lat: originParam.lat, lng: originParam.lng, label: originParam.label });
      setOriginQuery(originParam.label);
      setOriginMode("manual");
    }
    if (searchParams.get("from") === "geo" && !origin) {
      requestGeo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Marketing / WhatsApp entry: calculate a route from plain text params without login.
  useEffect(() => {
    if (seededFromMarketingRef.current || plannerLoading || plannerStations.length === 0) return;
    const fromText = searchParams.get("from");
    const toText = searchParams.get("to");
    if (!fromText && !toText) return;

    const pickedOrigin = pickFirstPlace(fromText, plannerStations);
    const pickedDestination = pickFirstPlace(toText, plannerStations);

    if (fromText) setOriginQuery(fromText);
    if (toText) setDestQuery(toText);
    if (pickedOrigin) {
      setOrigin(pickedOrigin);
      setOriginQuery(pickedOrigin.label ?? fromText ?? "");
      setOriginMode("manual");
    }
    if (pickedDestination) {
      setDestination(pickedDestination);
      setDestQuery(pickedDestination.label ?? toText ?? "");
    }

    seededFromMarketingRef.current = Boolean(pickedOrigin || pickedDestination);
  }, [plannerLoading, plannerStations, searchParams]);

  const results = useMemo<PlanResult[]>(() => {
    if (!origin || !destination) return [];
    return timeSync("planner.search", () => planTrip(origin, destination, plannerStations));
  }, [origin, destination, plannerStations]);

  // Log recent destination once we have a usable result for it.
  useEffect(() => {
    if (!destination || !destination.label) return;
    const key = `${destination.label}|${destination.lat.toFixed(4)}|${destination.lng.toFixed(4)}`;
    if (loggedDestRef.current === key) return;
    if (results.length > 0) {
      pushRecentDestination({
        label: destination.label,
        lat: destination.lat,
        lng: destination.lng,
      });
      loggedDestRef.current = key;
      setSavedReload((n) => n + 1);
    }
  }, [destination, results.length]);

  // Growth: a guest seeing a usable route is the actual wow moment, so track it before signup.
  useEffect(() => {
    if (!origin || !destination || results.length === 0) return;
    const top = results[0];
    const key = `${origin.label ?? origin.lat},${destination.label ?? destination.lat},${top.station.id},${top.line.id}`;
    if (guestRouteLoggedRef.current === key) return;
    guestRouteLoggedRef.current = key;
    const valueMoment = {
      from: origin.label ?? null,
      to: destination.label ?? null,
      station_id: top.station.id,
      line_id: top.line.id,
      pre_login: !user,
      source: searchParams.get("src") ?? "planner",
    };
    void trackGrowthEvent("guest_route_created", valueMoment);
    markInstallValueMoment("route_calculated", valueMoment);
  }, [origin, destination, results, searchParams, user]);

  const canPlan = !!origin && !!destination;


  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={t("welcome.planTrip")} backTo="/" />

      <main className="flex-1 px-5 py-5 space-y-5">
        {/* Intro */}
        <section className="card-tactile bg-primary">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-secondary text-primary grid place-items-center shrink-0">
              <Navigation className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="font-black text-secondary text-lg leading-tight">
                {t("planner.intro")}
              </h2>
              <p className="text-xs font-semibold text-secondary/80 mt-1">
                {t("planner.introDesc")}
              </p>
            </div>
          </div>
        </section>

        <section className="card-tactile bg-surface-alt border-success/50">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={2.5} />
            <div>
              <p className="font-black text-secondary">احسب الأول من غير تسجيل.</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                اكتب منين ورايح فين، شوف الطريق والتكلفة والوقت، وشارك النتيجة. التسجيل يظهر بعد كده بس لو عايز تحفظ الرحلات أو تدخل leaderboard.
              </p>
            </div>
          </div>
        </section>

        {plannerLoading && (
          <section className="card-tactile bg-surface-alt">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" strokeWidth={2.5} />
              <div>
                <p className="font-black text-secondary">جارٍ تحميل بيانات الخطوط…</p>
                <p className="text-xs font-semibold text-muted-foreground">سيتم تفعيل البحث والتخطيط فور اكتمال التحميل.</p>
              </div>
            </div>
          </section>
        )}

        {plannerError && !plannerLoading && (
          <section className="card-tactile bg-surface-alt">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" strokeWidth={2.5} />
              <div>
                <p className="font-black text-secondary">تعذر تحميل بيانات الرحلات</p>
                <p className="text-xs font-semibold text-muted-foreground mt-1">تحقق من اتصال الخادم أو من الجهة الحالية، ثم أعد المحاولة.</p>
              </div>
            </div>
          </section>
        )}

        {/* Origin */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-secondary">{t("planner.fromTitle")}</h3>
            <div className="inline-flex rounded-lg border-2 border-secondary overflow-hidden text-xs font-black">
              <button
                onClick={() => setOriginMode("geo")}
                className={`px-3 h-8 ${
                  originMode === "geo"
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-surface text-secondary"
                }`}
              >
                {t("planner.myLocation")}
              </button>
              <button
                onClick={() => {
                  setOriginMode("manual");
                  setOrigin(null);
                }}
                className={`px-3 h-8 border-r-2 border-secondary ${
                  originMode === "manual"
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-surface text-secondary"
                }`}
              >
                {t("planner.manualInput")}
              </button>
            </div>
          </div>

          {originMode === "geo" ? (
            <div className="card-tactile !p-4">
              {origin && origin.label === currentLocationLabel ? (
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-success" strokeWidth={2.5} />
                  <p className="font-bold text-secondary">
                    {t("planner.currentLocationSet")}
                  </p>
                  <button
                    onClick={requestGeo}
                    className="ms-auto text-xs font-bold text-secondary underline"
                  >
                    {t("planner.refresh")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={requestGeo}
                  disabled={locating}
                  className="btn-primary w-full !h-12 !text-base"
                >
                  {locating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("planner.locating")}
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4" strokeWidth={2.5} />
                      {t("planner.allowGeo")}
                    </>
                  )}
                </button>
              )}
              {geoError && (
                <p className="text-xs font-bold text-destructive mt-2">
                  {geoError}
                </p>
              )}
            </div>
          ) : (
            <PlaceSearch
              placeholder={t("planner.searchPlace")}
              value={originQuery}
              stations={plannerStations}
              disabled={plannerLoading || plannerStations.length === 0}
              onChange={setOriginQuery}
              onClear={() => {
                setOriginQuery("");
                setOrigin(null);
              }}
              onPick={(h) => {
                setOrigin({ lat: h.lat, lng: h.lng, label: h.name });
                setOriginQuery(h.name);
              }}
            />
          )}
        </section>

        {/* Destination */}
        <section className="space-y-3">
          <h3 className="font-black text-secondary">{t("planner.toTitle")}</h3>
          <PlaceSearch
            placeholder={t("planner.searchDest")}
            value={destQuery}
            stations={plannerStations}
            disabled={plannerLoading || plannerStations.length === 0}
            onChange={(v) => {
              setDestQuery(v);
              if (v.length >= 3) pushRecentSearch(v);
            }}
            onClear={() => {
              setDestQuery("");
              setDestination(null);
              if (searchParams.get("dest")) {
                searchParams.delete("dest");
                setSearchParams(searchParams, { replace: true });
              }
            }}
            onPick={(h) => {
              setDestination({ lat: h.lat, lng: h.lng, label: h.name });
              setDestQuery(h.name);
              pushRecentSearch(h.name);
            }}
          />

          {/* Quick re-plan: saved + recent */}
          <SavedPlacesPanel reloadKey={savedReload} asDestinationLinks />

          {destination && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="inline-flex items-center gap-2 text-xs font-black text-secondary underline"
            >
              <Bookmark className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t("quick.saveAsCta")}
            </button>
          )}
        </section>

        {/* Results */}
        <section className="space-y-3 pt-2">
          {!canPlan && (
            <div className="card-tactile bg-surface-alt text-center">
              <p className="font-bold text-secondary">
                {t("planner.needBoth")}
              </p>
            </div>
          )}

          {canPlan && !plannerLoading && plannerStations.length === 0 && (
            <div className="card-tactile bg-surface-alt text-center">
              <p className="font-bold text-secondary">لا توجد بيانات خطوط متاحة للجهة الحالية بعد.</p>
            </div>
          )}

          {canPlan && results.length === 0 && destination && plannerStations.length > 0 && (
            <NoResultsCard destination={destination} stations={plannerStations} />
          )}

          {canPlan && results.length > 0 && (() => {
            const topPicks = results.filter((r) => r.isTopPick);
            const others = results.filter((r) => !r.isTopPick);
            const onStart = (res: PlanResult) => {
              setTripResult(res);
              setTripOpen(true);
            };
            return (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-secondary">
                    {t("planner.suggestionCount", {
                      n: formatNumber(results.length, i18n.language),
                    })}
                  </h3>
                </div>

                {topPicks.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-black text-secondary text-sm inline-flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-success" strokeWidth={2.5} />
                      {t("recommend.topTitle")}
                    </h4>
                    <div className="space-y-4">
                      {topPicks.map((r) => (
                        <ResultCard
                          key={`top:${r.station.id}:${r.line.id}`}
                          r={r}
                          onStart={onStart}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {others.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="font-black text-secondary text-sm">
                      {t("recommend.moreTitle")}
                    </h4>
                    <div className="space-y-4">
                      {others.map((r) => (
                        <ResultCard
                          key={`more:${r.station.id}:${r.line.id}`}
                          r={r}
                          onStart={onStart}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!user && (
                  <div className="card-tactile bg-primary space-y-3">
                    <div>
                      <p className="font-black text-secondary text-lg">عجبك الطريق؟ سجّل بعد ما شوفت القيمة.</p>
                      <p className="mt-1 text-sm font-semibold leading-relaxed text-secondary/80">
                        احفظ مشاويرك اليومية، اجمع نقاط لما تساعد الناس، وادخل leaderboard منطقتك. حساب الطريق والمشاركة يفضلوا متاحين بدون تسجيل.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Link to="/auth" className="btn-primary !h-11 !text-sm">احفظ رحلاتي وادخل التحديات</Link>
                      <a href={routeWhatsAppUrl(results[0])} onClick={() => { void trackGrowthEvent("guest_route_shared", { channel: "whatsapp", pre_login: true, placement: "post_value_prompt" }); markInstallValueMoment("route_shared", { placement: "post_value_prompt", from: results[0].pickupStop.name, to: results[0].dropoffStop.name }); }} target="_blank" rel="noopener noreferrer" className="btn-secondary !h-11 !text-sm">شارك الطريق الأول</a>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </section>
      </main>

      <TripSummarySheet
        result={tripResult}
        open={tripOpen}
        onOpenChange={setTripOpen}
      />

      {showSaveDialog && destination && (
        <SaveDestinationDialog
          defaultLabel={destination.label ?? ""}
          lat={destination.lat}
          lng={destination.lng}
          onClose={() => setShowSaveDialog(false)}
          onSaved={() => setSavedReload((n) => n + 1)}
        />
      )}
    </div>
  );
};

export default PlannerPage;
