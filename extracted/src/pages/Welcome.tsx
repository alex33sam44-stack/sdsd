import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Station } from "@/data/stations";
import { getDefaultStationId, setDefaultStationId, toArabicDigits } from "@/lib/storage";
import { isRtl } from "@/i18n";
import {
  MapPin,
  Navigation,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Search,
  Globe2,
  MapPinPlus,
  Route as RouteIcon,
  LocateFixed,
  LogOut,
  HelpCircle,
  Coins,
} from "lucide-react";
import { useStations, findNearestStationHybrid } from "@/modules/shared/hooks/useStationsData";
import { useCities, detectCityFromCoords, type DetectedLocation } from "@/modules/shared/hooks/useCities";
import {
  filterStationsByCountry,
  localizedCityName,
  localizedCountryName,
} from "@/modules/shared/services/cities";
import { SuggestStationDialog } from "@/components/SuggestStationDialog";
import { SuggestLineDialog } from "@/components/SuggestLineDialog";
import { SavedPlacesPanel } from "@/components/SavedPlacesPanel";

type Phase = "pick" | "locating" | "nearest" | "denied";

const Welcome = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rtl = isRtl(i18n.language);
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  const [phase, setPhase] = useState<Phase>("pick");
  const [nearest, setNearest] = useState<{ station: Station; distance: number } | null>(null);
  const [query, setQuery] = useState("");
  const [detected, setDetected] = useState<DetectedLocation | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showSuggestLine, setShowSuggestLine] = useState(false);

  const { data: stations = [], isLoading, isError, refetch, isFetching } = useStations();
  const { data: cities = [] } = useCities();

  useEffect(() => {
    const def = getDefaultStationId();
    if (def && stations.some((s) => s.id === def)) {
      navigate(`/station/${def}`, { replace: true });
    }
  }, [navigate, stations]);

  // Auto-detect city silently on mount (no prompt — just if already granted)
  useEffect(() => {
    if (!cities.length || detected) return;
    if (!("permissions" in navigator) || !("geolocation" in navigator)) return;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (res.state === "granted") {
          navigator.geolocation.getCurrentPosition(
            (pos) => setDetected(detectCityFromCoords(cities, pos.coords.latitude, pos.coords.longitude)),
            () => {},
            { maximumAge: 300_000, timeout: 5000 },
          );
        }
      })
      .catch(() => {});
  }, [cities, detected]);

  // Country is auto-selected from the user's geolocation — no manual override.
  const activeCountry = detected?.city?.country_code || "";

  // Country-aware filter: prefers station.country_code (authoritative);
  // falls back to detected-city name match for legacy stations without one.
  // If geolocation-based filter wipes everything, show all to avoid blank list.
  const countryFiltered = useMemo(() => {
    if (!activeCountry) return stations;
    const result = filterStationsByCountry(stations, activeCountry, detected?.city?.name ?? null);
    if (result.length === 0) return stations;
    return result;
  }, [stations, activeCountry, detected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countryFiltered;
    return countryFiltered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.area ?? "").toLowerCase().includes(q),
    );
  }, [countryFiltered, query]);

  const requestLocation = () => {
    setPhase("locating");
    if (!("geolocation" in navigator)) {
      setPhase("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cities.length) {
          setDetected(detectCityFromCoords(cities, pos.coords.latitude, pos.coords.longitude));
        }
        const r = await findNearestStationHybrid(pos.coords.latitude, pos.coords.longitude);
        if (!r) {
          setPhase("pick");
          return;
        }
        setNearest(r);
        setPhase("nearest");
      },
      () => setPhase("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  };

  const choose = (id: string) => {
    setDefaultStationId(id);
    navigate(`/station/${id}`);
  };

  const formatKm = (km: number) =>
    rtl
      ? t("welcome.kmAway", { km: toArabicDigits(km.toFixed(1)) })
      : t("welcome.kmAway", { km: km.toFixed(1) });

  // Distinct empty-state buckets so users get the right CTA & message.
  const baseLoaded = phase === "pick" && !isLoading && !isFetching && !isError && !query;
  const showEmptyCity =
    baseLoaded && !!detected?.city && stations.length > 0 && filtered.length === 0;
  const showEmptyGlobal = baseLoaded && stations.length === 0;

  const detectedCityLabel = detected?.city ? localizedCityName(detected.city, i18n.language) : "";
  const detectedCountryLabel = detected?.city ? localizedCountryName(detected.city, i18n.language) : "";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="relative bg-primary border-b-2 border-secondary px-6 pt-10 pb-8 overflow-hidden">
        <div className="absolute -bottom-10 -start-10 w-40 h-40 rounded-full bg-secondary/10" aria-hidden />
        <div className="absolute -top-12 -end-8 w-32 h-32 rounded-full bg-secondary/10" aria-hidden />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-primary font-bold text-xs mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" />
            {t("welcome.badge")}
          </div>
          <h1 className="text-3xl font-black text-secondary leading-tight text-balance">
            {t("welcome.heroTitle")}
          </h1>
          <p className="text-secondary/80 font-semibold mt-2 text-base">
            {t("welcome.heroSubtitle")}
          </p>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        {phase === "locating" && (
          <div className="card-tactile flex flex-col items-center text-center py-10 animate-fade-in">
            <Loader2 className="w-10 h-10 text-secondary animate-spin mb-3" strokeWidth={2.5} />
            <p className="font-bold text-secondary text-lg">{t("welcome.locating")}</p>
          </div>
        )}

        {phase === "nearest" && nearest && (
          <div className="space-y-3 animate-fade-in">
            <div className="card-tactile bg-primary">
              <p className="text-xs font-black text-secondary tracking-wide">{t("welcome.nearestLabel")}</p>
              <h2 className="text-2xl font-black text-secondary mt-1 text-balance">{nearest.station.name}</h2>
              <p className="text-secondary/80 font-bold text-sm mt-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" strokeWidth={2.5} />
                {nearest.station.area} · {formatKm(nearest.distance)}
              </p>
              <div className="mt-5 grid gap-3">
                <button onClick={() => choose(nearest.station.id)} className="btn-dark w-full">
                  {t("welcome.chooseThis")}
                </button>
                <button onClick={() => setPhase("pick")} className="btn-secondary w-full">
                  {t("welcome.chooseAnother")}
                </button>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground font-semibold">{t("welcome.savedHint")}</p>
          </div>
        )}

        {phase === "denied" && (
          <div className="card-tactile animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-destructive border-2 border-secondary grid place-items-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-destructive-foreground" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="font-bold text-lg text-secondary">{t("welcome.deniedTitle")}</h2>
                <p className="text-sm text-muted-foreground font-semibold">{t("welcome.deniedDesc")}</p>
              </div>
            </div>
            <button onClick={() => setPhase("pick")} className="btn-primary w-full mt-5">
              {t("welcome.pickManual")}
            </button>
          </div>
        )}

        {phase === "pick" && (
          <div className="space-y-5 animate-fade-in">
            {/* Detected city banner */}
            {detected?.city && (
              <div className="rounded-xl border-2 border-secondary bg-surface-alt p-3 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary border-2 border-secondary grid place-items-center shrink-0">
                  <Globe2 className="w-5 h-5 text-secondary" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-secondary">{t("welcome.detectedCity")}</p>
                  <p className="text-sm font-bold text-secondary truncate">
                    {t("welcome.detectedCityHint", {
                      city: detectedCityLabel,
                      country: detectedCountryLabel,
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Nearest CTA */}
            <button
              onClick={requestLocation}
              className="w-full card-tactile bg-primary flex items-center gap-3 active:translate-y-1 active:shadow-none transition-transform"
            >
              <div className="h-12 w-12 rounded-xl bg-secondary text-primary grid place-items-center shrink-0">
                <Navigation className="w-6 h-6" strokeWidth={2.5} />
              </div>
              <div className="text-start flex-1">
                <p className="font-black text-secondary text-lg">{t("welcome.useNearest")}</p>
                <p className="text-xs font-semibold text-secondary/80">{t("welcome.locateDesc")}</p>
              </div>
              <Chevron className="w-6 h-6 text-secondary shrink-0" strokeWidth={2.5} />
            </button>

            {/* Context shortcuts */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={requestLocation}
                className="card-tactile !p-3 bg-surface text-start active:translate-y-1 active:shadow-none transition-transform"
              >
                <div className="h-9 w-9 rounded-lg bg-primary border-2 border-secondary grid place-items-center mb-2">
                  <LocateFixed className="w-4 h-4 text-secondary" strokeWidth={2.5} />
                </div>
                <p className="font-black text-secondary text-[12px] leading-tight">
                  {t("welcome.shortcutInside")}
                </p>
              </button>
              <button
                onClick={() => navigate("/planner?from=geo")}
                className="card-tactile !p-3 bg-surface text-start active:translate-y-1 active:shadow-none transition-transform"
              >
                <div className="h-9 w-9 rounded-lg bg-primary border-2 border-secondary grid place-items-center mb-2">
                  <LogOut className="w-4 h-4 text-secondary" strokeWidth={2.5} />
                </div>
                <p className="font-black text-secondary text-[12px] leading-tight">
                  {t("welcome.shortcutOutside")}
                </p>
              </button>
              <button
                onClick={() => navigate("/planner?focus=dest")}
                className="card-tactile !p-3 bg-surface text-start active:translate-y-1 active:shadow-none transition-transform"
              >
                <div className="h-9 w-9 rounded-lg bg-primary border-2 border-secondary grid place-items-center mb-2">
                  <HelpCircle className="w-4 h-4 text-secondary" strokeWidth={2.5} />
                </div>
                <p className="font-black text-secondary text-[12px] leading-tight">
                  {t("welcome.shortcutWhatRide")}
                </p>
              </button>
            </div>

            {/* Savings is a core loop, not a side page. */}
            <button
              onClick={() => navigate("/savings")}
              className="w-full card-tactile bg-emerald-50 border-success/60 flex items-center gap-3 active:translate-y-1 active:shadow-none transition-transform"
            >
              <div className="h-12 w-12 rounded-xl bg-emerald-500 text-white grid place-items-center shrink-0 border-2 border-secondary">
                <Coins className="w-6 h-6" strokeWidth={2.5} />
              </div>
              <div className="text-start flex-1">
                <p className="font-black text-secondary text-lg">وفرت كام هذا الأسبوع؟</p>
                <p className="text-xs font-semibold text-secondary/80">اعمل كارت توفير وشاركه: فلوس، وقت، ومشاوير أقل بهدلة.</p>
              </div>
              <Chevron className="w-6 h-6 text-secondary shrink-0" strokeWidth={2.5} />
            </button>

            {/* Saved places & recent destinations (one-tap re-plan) */}
            <SavedPlacesPanel />


            {/* Contribute: add station / add line */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowSuggest(true)}
                className="card-tactile bg-surface-alt text-start active:translate-y-1 active:shadow-none transition-transform"
              >
                <div className="h-10 w-10 rounded-xl bg-primary border-2 border-secondary grid place-items-center mb-2">
                  <MapPinPlus className="w-5 h-5 text-secondary" strokeWidth={2.5} />
                </div>
                <p className="font-black text-secondary text-sm leading-tight">
                  {t("welcome.addStationCta")}
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground mt-1 leading-snug">
                  {t("welcome.addStationDesc")}
                </p>
              </button>
              <button
                onClick={() => setShowSuggestLine(true)}
                className="card-tactile bg-surface-alt text-start active:translate-y-1 active:shadow-none transition-transform"
              >
                <div className="h-10 w-10 rounded-xl bg-primary border-2 border-secondary grid place-items-center mb-2">
                  <RouteIcon className="w-5 h-5 text-secondary" strokeWidth={2.5} />
                </div>
                <p className="font-black text-secondary text-sm leading-tight">
                  {t("welcome.addLineCta")}
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground mt-1 leading-snug">
                  {t("welcome.addLineDesc")}
                </p>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-0.5 bg-secondary/20" />
              <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">
                {t("welcome.orDivider")}
              </span>
              <div className="flex-1 h-0.5 bg-secondary/20" />
            </div>

            <div className="space-y-3">
              <h2 className="font-black text-xl text-secondary">{t("welcome.allStations")}</h2>

              {/* Country filter removed — country is auto-selected from geolocation. */}

              <div className="relative">
                <Search
                  className="absolute top-1/2 -translate-y-1/2 start-3 w-5 h-5 text-muted-foreground"
                  strokeWidth={2.5}
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("welcome.searchStations")}
                  className="w-full h-12 ps-10 pe-3 rounded-xl border-2 border-secondary bg-surface font-bold text-secondary placeholder:text-muted-foreground/70 shadow-tactile-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {(isLoading || isFetching) && stations.length === 0 && (
                <div className="card-tactile flex flex-col items-center text-center py-8">
                  <Loader2 className="w-8 h-8 text-secondary animate-spin mb-2" strokeWidth={2.5} />
                  <p className="font-bold text-secondary">{t("common.loading")}</p>
                </div>
              )}

              {!isLoading && !isFetching && isError && stations.length === 0 && (
                <div className="card-tactile">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-xl bg-destructive border-2 border-secondary grid place-items-center shrink-0">
                      <AlertTriangle className="w-6 h-6 text-destructive-foreground" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-bold text-secondary">{t("welcome.deniedTitle")}</h3>
                      <p className="text-sm text-muted-foreground font-semibold">
                        {t("welcome.deniedDesc")}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => refetch()} className="btn-primary w-full mt-4">
                    {t("common.search")}
                  </button>
                </div>
              )}

              {/* Cached-data freshness warning: showing stale list while live fetch failed */}
              {isError && stations.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 px-3 py-2 text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                  <span>{t("network.staleData")}</span>
                  <button onClick={() => refetch()} className="underline">{t("common.search")}</button>
                </div>
              )}

              {/* Empty city — suggestion CTA */}
              {showEmptyCity && (
                <div className="card-tactile bg-surface-alt">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary border-2 border-secondary grid place-items-center shrink-0">
                      <MapPinPlus className="w-6 h-6 text-secondary" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-secondary">
                        {t("welcome.noStationsHere", { city: detectedCityLabel })}
                      </h3>
                      <p className="text-sm text-muted-foreground font-semibold">
                        {t("welcome.noStationsHereDesc")}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowSuggest(true)} className="btn-primary w-full mt-4">
                    <MapPinPlus className="w-5 h-5" strokeWidth={2.5} />
                    {t("welcome.suggestStation")}
                  </button>
                </div>
              )}

              {/* Empty global — no stations seeded at all */}
              {showEmptyGlobal && (
                <div className="card-tactile bg-surface-alt">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary border-2 border-secondary grid place-items-center shrink-0">
                      <Globe2 className="w-6 h-6 text-secondary" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-secondary">{t("welcome.noStationsGlobal")}</h3>
                      <p className="text-sm text-muted-foreground font-semibold">
                        {t("welcome.noStationsGlobalDesc")}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowSuggest(true)} className="btn-primary w-full mt-4">
                    <MapPinPlus className="w-5 h-5" strokeWidth={2.5} />
                    {t("welcome.suggestStation")}
                  </button>
                </div>
              )}

              {!isLoading && !isError && filtered.length === 0 && stations.length > 0 &&
                !showEmptyCity && (
                <div className="card-tactile text-center py-8">
                  <p className="font-bold text-secondary">{t("welcome.noResults")}</p>
                </div>
              )}

              <ul className="space-y-3">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => choose(s.id)}
                      className="w-full text-start card-tactile hover:bg-surface-alt active:translate-y-1 active:shadow-none transition-transform"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-secondary text-lg truncate">{s.name}</p>
                          <p className="text-sm text-muted-foreground font-semibold truncate flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
                            {s.area}
                          </p>
                        </div>
                        <Chevron className="w-6 h-6 text-secondary shrink-0" strokeWidth={2.5} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => navigate("/planner")}
              className="w-full mt-2 h-12 font-bold text-secondary rounded-xl border-2 border-dashed border-secondary/40 hover:bg-surface-alt"
            >
              {t("welcome.planTrip")}
            </button>

            {!showEmptyCity && (
              <button
                onClick={() => setShowSuggest(true)}
                className="w-full text-xs font-bold text-muted-foreground underline pt-2"
              >
                {t("welcome.suggestStation")}
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="px-6 pb-6 pt-2 text-center">
        <a href="/admin" className="text-xs font-bold text-muted-foreground underline">
          {t("welcome.adminFooter")}
        </a>
      </footer>

      {showSuggest && (
        <SuggestStationDialog
          defaultCity={detected?.city?.name}
          defaultCountryCode={detected?.city?.country_code ?? null}
          defaultCountryName={detected?.city?.country_name ?? null}
          defaultLat={detected?.lat ?? null}
          defaultLng={detected?.lng ?? null}
          onClose={() => setShowSuggest(false)}
        />
      )}

      {showSuggestLine && (
        <SuggestLineDialog
          defaultCity={detected?.city?.name}
          defaultCountryCode={detected?.city?.country_code ?? null}
          defaultCountryName={detected?.city?.country_name ?? null}
          onClose={() => setShowSuggestLine(false)}
        />
      )}
    </div>
  );
};

export default Welcome;
