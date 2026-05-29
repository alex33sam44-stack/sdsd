import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { Camera, ExternalLink, MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import {
  DEFAULT_CAIRO_CENTER,
  getClientMapLayers,
  getDefaultClientMapLayer,
  getMapAttribution,
  getPmtilesUrl,
  type ClientMapLayer,
  type ClientMapLayerId,
} from "@/marketing/lib/mapTiles";
import { buildStreetImageryFallbackText, buildStreetImageryLink } from "@/marketing/lib/openStreetView";

export type TripMapPoint = {
  lat: number;
  lng: number;
  created_at?: string | null;
};

type Props = {
  lastLat?: number | null;
  lastLng?: number | null;
  lastPingAt?: string | null;
  pings?: TripMapPoint[];
  fromLabel: string;
  toLabel: string;
  status: string;
};

let pmtilesProtocolInstalled = false;

function ensurePmtilesProtocol() {
  if (pmtilesProtocolInstalled) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile as never);
  pmtilesProtocolInstalled = true;
}

function getStyle(pmtilesUrl: string | null, mapLayer: ClientMapLayer): maplibregl.StyleSpecification {
  const layers: maplibregl.LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": "#0f172a" } },
  ];

  if (mapLayer.kind === "pmtiles" && pmtilesUrl) {
    layers.push(
      { id: "water", type: "fill", source: "protomaps", "source-layer": "water", paint: { "fill-color": "#1e40af", "fill-opacity": 0.55 } },
      { id: "earth", type: "fill", source: "protomaps", "source-layer": "earth", paint: { "fill-color": "#111827" } },
      { id: "landuse", type: "fill", source: "protomaps", "source-layer": "landuse", paint: { "fill-color": "#164e63", "fill-opacity": 0.22 } },
      { id: "roads-minor", type: "line", source: "protomaps", "source-layer": "roads", filter: ["in", ["get", "kind"], ["literal", ["minor_road", "path", "other"]]], paint: { "line-color": "#38bdf8", "line-opacity": 0.22, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 15, 1.6] } },
      { id: "roads-major", type: "line", source: "protomaps", "source-layer": "roads", filter: ["in", ["get", "kind"], ["literal", ["major_road", "highway"]]], paint: { "line-color": "#facc15", "line-opacity": 0.52, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.9, 15, 3.2] } },
      { id: "buildings", type: "fill", source: "protomaps", "source-layer": "buildings", minzoom: 14, paint: { "fill-color": "#475569", "fill-opacity": 0.28 } },
      { id: "places", type: "symbol", source: "protomaps", "source-layer": "places", minzoom: 9, layout: { "text-field": ["coalesce", ["get", "name:ar"], ["get", "name"]], "text-size": 12, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#f8fafc", "text-halo-color": "#0f172a", "text-halo-width": 1.2 } },
    );
  }

  if (mapLayer.kind === "raster" && mapLayer.tiles?.length) {
    layers.push({ id: "client-raster-basemap", type: "raster", source: "basemap", paint: { "raster-opacity": 0.92 } });
  }

  layers.push(
    { id: "trip-line", type: "line", source: "trip", paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.9 } },
    { id: "trip-line-glow", type: "line", source: "trip", paint: { "line-color": "#bbf7d0", "line-width": 13, "line-opacity": 0.16 } },
    { id: "trip-points", type: "circle", source: "trip-points", paint: { "circle-radius": 4, "circle-color": "#f8fafc", "circle-stroke-color": "#22c55e", "circle-stroke-width": 2 } },
  );

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      ...(mapLayer.kind === "pmtiles" && pmtilesUrl ? { protomaps: { type: "vector", url: `pmtiles://${pmtilesUrl}`, attribution: getMapAttribution(mapLayer) } } : {}),
      ...(mapLayer.kind === "raster" && mapLayer.tiles?.length ? {
        basemap: {
          type: "raster" as const,
          tiles: mapLayer.tiles,
          tileSize: 256,
          maxzoom: mapLayer.maxzoom,
          attribution: getMapAttribution(mapLayer),
        },
      } : {}),
      trip: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "trip-points": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers,
  };
}

function markerEl(label: string, tone: "start" | "end" | "live") {
  const el = document.createElement("div");
  const bg = tone === "live" ? "#22c55e" : tone === "start" ? "#38bdf8" : "#fb7185";
  el.dir = "rtl";
  el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:${bg};color:white;font:700 12px system-ui;box-shadow:0 12px 28px rgba(15,23,42,.35);white-space:nowrap;border:2px solid rgba(255,255,255,.85)">${label}</div>`;
  return el;
}

function toLineFeature(points: TripMapPoint[]): GeoJSON.FeatureCollection {
  const coords = points.map((p) => [p.lng, p.lat]);
  return {
    type: "FeatureCollection",
    features: coords.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] : [],
  };
}

function toPointFeatures(points: TripMapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p, index) => ({
      type: "Feature",
      properties: { index, created_at: p.created_at ?? null },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}

export function InteractiveTripMap({ lastLat, lastLng, lastPingAt, pings = [], fromLabel, toLabel, status }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const pmtilesUrl = getPmtilesUrl();
  const [mapLayerId, setMapLayerId] = useState<ClientMapLayerId>(() => getDefaultClientMapLayer().id);
  const mapLayer = useMemo(() => getClientMapLayers().find((layer) => layer.id === mapLayerId) ?? getDefaultClientMapLayer(), [mapLayerId]);
  const mapLayers = useMemo(() => getClientMapLayers(), []);

  const points = useMemo<TripMapPoint[]>(() => {
    const clean = pings.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (clean.length) return clean;
    if (lastLat != null && lastLng != null) return [{ lat: lastLat, lng: lastLng, created_at: lastPingAt ?? null }];
    return [];
  }, [lastLat, lastLng, lastPingAt, pings]);

  const livePoint = points.at(-1) ?? null;
  const streetLink = livePoint ? buildStreetImageryLink(livePoint.lat, livePoint.lng) : null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (pmtilesUrl) ensurePmtilesProtocol();
    const center = points.at(-1) ? [points.at(-1)!.lng, points.at(-1)!.lat] as [number, number] : DEFAULT_CAIRO_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyle(pmtilesUrl, mapLayer),
      center,
      zoom: points.length ? 14 : 10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    mapRef.current = map;
    map.on("load", () => setReady(true));
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pmtilesUrl) ensurePmtilesProtocol();
    setReady(false);
    map.setStyle(getStyle(pmtilesUrl, mapLayer));
    map.once("style.load", () => setReady(true));
  }, [mapLayer, pmtilesUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const lineSource = map.getSource("trip") as maplibregl.GeoJSONSource | undefined;
    const pointSource = map.getSource("trip-points") as maplibregl.GeoJSONSource | undefined;
    lineSource?.setData(toLineFeature(points));
    pointSource?.setData(toPointFeatures(points));

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (points.length) {
      const start = points[0];
      const last = points[points.length - 1];
      markersRef.current.push(new maplibregl.Marker({ element: markerEl("البداية", "start") }).setLngLat([start.lng, start.lat]).addTo(map));
      if (points.length > 1) {
        markersRef.current.push(new maplibregl.Marker({ element: markerEl("آخر موقع", "live") }).setLngLat([last.lng, last.lat]).addTo(map));
      }
      const bounds = new maplibregl.LngLatBounds([start.lng, start.lat], [start.lng, start.lat]);
      points.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 650 });
    }
  }, [points, ready]);

  return (
    <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <RouteIcon className="h-4 w-4 text-emerald-600" /> خريطة تفاعلية بدون Google Maps
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            MapLibre: كل طبقات الخريطة تُطلب من متصفح العميل مباشرة، بدون مرور أي tile على backend مواصلات.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {streetLink && (
            <a
              href={streetLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700 hover:bg-sky-200"
              title={streetLink.description}
            >
              <Camera className="h-3.5 w-3.5" /> {streetLink.label} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-black ${status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {status === "active" ? "لايف" : "منتهية"}
          </span>
        </div>
      </div>

      <div className="relative h-[380px] bg-slate-950">
        <div ref={containerRef} className="h-full w-full" />
        <div className="absolute inset-x-4 top-4 flex flex-col gap-2 sm:inset-x-auto sm:left-4 sm:w-72">
          <label className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs font-black text-slate-800 shadow-sm backdrop-blur">
            <span className="mb-2 block">طبقة الخريطة من جهاز العميل</span>
            <select
              value={mapLayer.id}
              onChange={(event) => setMapLayerId(event.target.value as ClientMapLayerId)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
            >
              {mapLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.label}</option>
              ))}
            </select>
            <span className="mt-2 block text-[11px] font-bold leading-4 text-slate-500">{mapLayer.description}</span>
          </label>
          {mapLayer.heavyTrafficNote && (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-50/95 p-3 text-[11px] font-bold leading-5 text-amber-900 shadow-sm">
              {mapLayer.heavyTrafficNote}
            </div>
          )}
          {!pmtilesUrl && mapLayer.kind === "none" && (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-50/95 p-3 text-[11px] font-bold leading-5 text-amber-900 shadow-sm">
              أضف <code>VITE_PMTILES_URL</code> لتشغيل طبقة إنتاجية تتحمل الضغط عبر CDN/Object Storage. بدونها ستظهر طبقة التتبع فقط أو طبقات عامة يختارها العميل.
            </div>
          )}
        </div>
        {!points.length && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="rounded-2xl bg-white/95 p-4 text-sm font-bold text-slate-700 shadow-lg">
              <MapPin className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              لسه مفيش موقع لايف ظاهر على الخريطة.
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2 bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-3"><b className="text-slate-900">من:</b> {fromLabel}</div>
        <div className="rounded-2xl bg-white p-3"><b className="text-slate-900">إلى:</b> {toLabel}</div>
        <div className="rounded-2xl bg-white p-3"><b className="text-slate-900">نقاط التتبع:</b> {points.length}</div>
      </div>

      <div className="border-t bg-sky-50 px-4 py-3 text-xs font-bold leading-6 text-sky-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            الطبقة الحالية: {mapLayer.shortLabel}. كل tiles تُطلب من المتصفح مباشرة؛ backend يرسل بيانات الرحلة فقط.
          </span>
          {streetLink ? (
            <a href={streetLink.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-3 py-2 text-white hover:bg-sky-700">
              <Camera className="h-4 w-4" /> افتح منظر الشارع
            </a>
          ) : (
            <span className="rounded-2xl bg-white px-3 py-2 text-slate-600">{buildStreetImageryFallbackText({ from: fromLabel, to: toLabel })}</span>
          )}
        </div>
      </div>
    </section>
  );
}
