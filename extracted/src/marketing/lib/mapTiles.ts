export const DEFAULT_CAIRO_CENTER: [number, number] = [31.2357, 30.0444];

export type ClientMapLayerId =
  | "pmtiles"
  | "none"
  | "osm_standard"
  | "carto_positron"
  | "carto_dark_matter"
  | "carto_voyager"
  | "opentopomap"
  | "esri_world_imagery";

export type ClientMapLayer = {
  id: ClientMapLayerId;
  label: string;
  shortLabel: string;
  description: string;
  kind: "pmtiles" | "raster" | "none";
  maxzoom?: number;
  attribution: string;
  tiles?: string[];
  requiresPmtilesUrl?: boolean;
  heavyTrafficNote?: string;
};

export function getPmtilesUrl(): string | null {
  const configured = import.meta.env.VITE_PMTILES_URL as string | undefined;
  return configured?.trim() || null;
}

const MAP_LAYERS: ClientMapLayer[] = [
  {
    id: "pmtiles",
    label: "PMTiles على CDN / Object Storage",
    shortLabel: "PMTiles",
    description: "أفضل اختيار للإنتاج والضغط العالي: ملف ثابت يطلبه المتصفح مباشرة من CDN، وليس من backend.",
    kind: "pmtiles",
    attribution: "© OpenStreetMap contributors · Protomaps PMTiles · MapLibre",
    requiresPmtilesUrl: true,
  },
  {
    id: "none",
    label: "بدون طبقة خرائط خارجية",
    shortLabel: "بدون Tiles",
    description: "يحافظ على التتبع فقط ولا يحمّل أي tiles من أي جهة خارجية.",
    kind: "none",
    attribution: "MapLibre",
  },
  {
    id: "osm_standard",
    label: "OpenStreetMap Standard",
    shortLabel: "OSM",
    description: "طبقة مجانية مباشرة من متصفح العميل للتجارب والحجم المحدود.",
    kind: "raster",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    maxzoom: 19,
    attribution: "© OpenStreetMap contributors",
    heavyTrafficNote: "غير مناسبة لمليون مستخدم متزامن على tile.openstreetmap.org؛ استخدم PMTiles/CDN للإنتاج.",
  },
  {
    id: "carto_positron",
    label: "CARTO Positron",
    shortLabel: "CARTO Light",
    description: "خريطة فاتحة مناسبة لإظهار خطوط الرحلة فوقها.",
    kind: "raster",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    ],
    maxzoom: 20,
    attribution: "© OpenStreetMap contributors © CARTO",
    heavyTrafficNote: "راجع ترخيص CARTO قبل الاستخدام التجاري أو الضغط العالي.",
  },
  {
    id: "carto_dark_matter",
    label: "CARTO Dark Matter",
    shortLabel: "CARTO Dark",
    description: "خريطة داكنة مناسبة للتتبع الليلي والواجهة الحالية.",
    kind: "raster",
    tiles: [
      "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    ],
    maxzoom: 20,
    attribution: "© OpenStreetMap contributors © CARTO",
    heavyTrafficNote: "راجع ترخيص CARTO قبل الاستخدام التجاري أو الضغط العالي.",
  },
  {
    id: "carto_voyager",
    label: "CARTO Voyager",
    shortLabel: "CARTO Voyager",
    description: "طبقة ملونة أوضح للطرق والأماكن.",
    kind: "raster",
    tiles: [
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    ],
    maxzoom: 20,
    attribution: "© OpenStreetMap contributors © CARTO",
    heavyTrafficNote: "راجع ترخيص CARTO قبل الاستخدام التجاري أو الضغط العالي.",
  },
  {
    id: "opentopomap",
    label: "OpenTopoMap",
    shortLabel: "Topo",
    description: "طبقة طبوغرافية مفيدة للمناطق الجبلية والرحلات الخارجية.",
    kind: "raster",
    tiles: [
      "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    maxzoom: 17,
    attribution: "© OpenStreetMap contributors, SRTM · OpenTopoMap CC-BY-SA",
    heavyTrafficNote: "OpenTopoMap يطلب التواصل قبل المشاريع الكبيرة؛ لا تستخدمه للضغط العالي.",
  },
  {
    id: "esri_world_imagery",
    label: "Esri World Imagery",
    shortLabel: "Satellite",
    description: "صور أقمار صناعية مباشرة من متصفح العميل عند الحاجة لمعاينة المكان.",
    kind: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    maxzoom: 19,
    attribution: "Tiles © Esri",
    heavyTrafficNote: "راجع شروط Esri قبل الاستخدام التجاري أو الضغط العالي.",
  },
];

export function getClientMapLayers(): ClientMapLayer[] {
  const pmtilesUrl = getPmtilesUrl();
  return MAP_LAYERS.filter((layer) => !layer.requiresPmtilesUrl || Boolean(pmtilesUrl));
}

export function getClientMapLayer(id?: string | null): ClientMapLayer {
  const layers = getClientMapLayers();
  const found = layers.find((layer) => layer.id === id);
  return found ?? layers[0] ?? MAP_LAYERS[1];
}

export function getDefaultClientMapLayer(): ClientMapLayer {
  const configured = (import.meta.env.VITE_DEFAULT_MAP_LAYER as string | undefined)?.trim();
  return getClientMapLayer(configured || (getPmtilesUrl() ? "pmtiles" : "none"));
}

export function getMapAttribution(layer?: ClientMapLayer | null): string {
  return layer?.attribution || "© OpenStreetMap contributors · Protomaps PMTiles · MapLibre";
}

export function buildMapShareText(input: {
  from: string;
  to: string;
  url: string;
  minsAgo?: number | null;
}) {
  return [
    `أنا متابع مشوار من ${input.from} لـ ${input.to}.`,
    input.minsAgo == null ? `الخريطة لايف على مواصلات.` : `آخر تحديث على الخريطة: منذ ${input.minsAgo} دقيقة.`,
    `شوفه هنا:`,
    input.url,
  ].filter(Boolean).join('\n');
}
