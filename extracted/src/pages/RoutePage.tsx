import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { toArabicDigits } from "@/lib/storage";
import { isRtl } from "@/i18n";
import { ExternalLink, MapPin, Loader2, MessageCircle, Flag, Clock3 } from "lucide-react";
import { useStation } from "@/modules/shared/hooks/useStationsData";
import { AddRouteFeatureDialog } from "@/components/AddRouteFeatureDialog";
import { useUserContributions } from "@/hooks/useUserContributions";

const RoutePage = () => {
  const { stationId = "", lineId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const rtl = isRtl(i18n.language);
  const [showAddFeature, setShowAddFeature] = useState(false);
  const contributions = useUserContributions();
  const { data: station, isLoading } = useStation(stationId);
  const line = station?.lines.find((l) => l.id === lineId);
  const routeFeatures = useMemo(
    () => contributions.filter((item) => item.type === "route_feature" && item.lineId === lineId),
    [contributions, lineId],
  );

  const fmt = (n: number | string) => (rtl ? toArabicDigits(String(n)) : String(n));
  const sharedFrom = searchParams.get("from") || station?.name || "";
  const sharedTo = searchParams.get("to") || line?.destination || "";
  const currentUrl = typeof window !== "undefined" ? window.location.href : `https://mwasalat.app/route/${stationId}/${lineId}`;
  const whatsappText = [
    `أنا رايح من ${sharedFrom} لـ ${sharedTo}.`,
    `مواصلات حسبتلي الطريق والتكلفة والزحمة.`,
    `شوف الطريق هنا:`,
    currentUrl,
  ].join("\n");
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  useEffect(() => {
    if (!station || !line) return;
    const title = `مواصلات | ${sharedFrom} لـ ${sharedTo}`;
    const description = `شوف الطريق من ${sharedFrom} لـ ${sharedTo} على مواصلات: المحطات، الركوب، والزحمة قبل ما تنزل.`;
    document.title = title;
    const setMeta = (selector: string, attr: "content", value: string) => {
      const el = document.head.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", currentUrl);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
  }, [currentUrl, line, sharedFrom, sharedTo, station]);

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }
  if (!station || !line) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("route.title", { name: line.destination })} backTo={`/station/${station.id}`} />

      <div className="px-5 pt-5 pb-10">
        <div className="rounded-2xl border-2 border-secondary bg-primary p-5 shadow-tactile mb-6 space-y-4">
          <div>
            <p className="text-xs font-black text-secondary tracking-wide">{t("route.fromTo", { from: station.name })}</p>
            <h2 className="text-2xl font-black text-secondary text-balance">{line.destination}</h2>
            <p className="text-secondary/80 font-bold text-sm mt-2">
              {t("route.stopsHint", { count: line.stops.length })}
            </p>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-[#25D366] px-4 text-base font-black text-white shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
          >
            <MessageCircle className="w-5 h-5" strokeWidth={2.5} />
            ابعت الجروب يشوفوا الطريق
          </a>
          <p className="rounded-lg border border-secondary/30 bg-white/70 px-3 py-2 text-xs font-bold leading-relaxed text-secondary">
            الرابط ده يفتح نفس الطريق مباشرة ومعاه معاينة مشاركة واتساب/Facebook.
          </p>
        </div>


        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm mb-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary border-2 border-secondary grid place-items-center shrink-0">
              <Flag className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-black text-secondary text-base">{t("contrib.routeFeatureCardTitle")}</h2>
              <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                {t("contrib.routeFeatureCardDesc")}
              </p>
            </div>
          </div>
          {routeFeatures.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-secondary/30 bg-surface-alt p-3">
              <p className="text-xs font-black text-secondary mb-2 flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5" strokeWidth={2.5} />
                {t("contrib.pendingFeatureSuggestions", { count: routeFeatures.length })}
              </p>
              <ul className="space-y-2">
                {routeFeatures.slice(0, 3).map((item) => (
                  <li key={item.id} className="text-xs font-bold text-secondary flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary border border-secondary shrink-0" />
                    <span className="truncate">{item.title}{item.stopName ? ` · ${item.stopName}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => setShowAddFeature(true)} className="btn-primary w-full">
            <Flag className="w-5 h-5" strokeWidth={2.5} />
            {t("contrib.addFeatureToRoute")}
          </button>
        </section>

        <ol className="relative pe-2 ps-0">
          <div
            className="absolute top-3 bottom-3 w-1.5 rounded-full"
            style={{ backgroundColor: line.color, insetInlineEnd: "0.875rem" }}
            aria-hidden
          />
          {line.stops.map((stop, i) => {
            const isFirst = i === 0;
            const isLast = i === line.stops.length - 1;
            const url = `https://www.openstreetmap.org/?mlat=${stop.lat}&mlon=${stop.lng}#map=16/${stop.lat}/${stop.lng}`;
            return (
              <li key={stop.id} className="relative pe-10 ps-0 pb-5 last:pb-0">
                <span
                  className="absolute top-2 grid place-items-center rounded-full border-[3px] border-secondary bg-surface"
                  style={{
                    insetInlineEnd: "0.25rem",
                    width: "1.75rem",
                    height: "1.75rem",
                  }}
                  aria-hidden
                >
                  <span
                    className="block rounded-full"
                    style={{
                      width: "0.65rem",
                      height: "0.65rem",
                      backgroundColor: line.color,
                    }}
                  />
                </span>

                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-1">
                        {isFirst && <span className="pill bg-success text-success-foreground border-secondary !py-0.5 !px-2 !text-[10px]">{t("route.start")}</span>}
                        {isLast && <span className="pill bg-primary border-secondary !py-0.5 !px-2 !text-[10px]">{t("route.arrival")}</span>}
                        {!isFirst && !isLast && <span>{t("route.stopN", { n: fmt(i + 1) })}</span>}
                      </div>
                      <p className="font-black text-secondary text-base truncate">{stop.name}</p>
                      <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" strokeWidth={2.5} />
                        {fmt(stop.lat.toFixed(4))}, {fmt(stop.lng.toFixed(4))}
                      </p>
                    </div>
                    <span className="h-10 w-10 grid place-items-center rounded-lg bg-secondary text-primary shrink-0">
                      <ExternalLink className="w-5 h-5" strokeWidth={2.5} />
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ol>

        <p className="text-center text-xs text-muted-foreground font-semibold mt-6">
          {t("route.footer")}
        </p>
      </div>
      {showAddFeature && station && line && (
        <AddRouteFeatureDialog station={station} line={line} onClose={() => setShowAddFeature(false)} />
      )}
    </div>
  );
};

export default RoutePage;
