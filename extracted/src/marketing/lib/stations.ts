// محطات حقيقية من OpenStreetMap عبر Overpass API — مجاني تماماً، بدون مفتاح
export type StationType = "مترو" | "أتوبيس" | "ميكروباص" | "ترام" | "موقف";

export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: StationType;
  lines: string[];
};

// معادلة Haversine بالكيلومتر
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// رابط OpenStreetMap اختياري — بدون Google Maps وبدون API key
export function googleMapsDirUrl(dest: { lat: number; lng: number }, origin?: { lat: number; lng: number }) {
  if (origin) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat},${origin.lng};${dest.lat},${dest.lng}`;
  }
  return `https://www.openstreetmap.org/?mlat=${dest.lat}&mlon=${dest.lng}#map=16/${dest.lat}/${dest.lng}`;
}

// تصنيف نوع المحطة من tags الـ OSM
function classifyType(tags: Record<string, string>): StationType {
  const railway = tags.railway;
  const station = tags.station;
  const highway = tags.highway;
  const amenity = tags.amenity;
  const route = tags.route;

  if (railway === "subway_entrance" || station === "subway" || tags.subway === "yes") return "مترو";
  if (railway === "tram_stop" || tags.tram === "yes") return "ترام";
  if (amenity === "bus_station") return "أتوبيس";
  if (highway === "bus_stop" || tags.bus === "yes" || route === "bus") return "أتوبيس";
  if (amenity === "taxi") return "ميكروباص";
  if (tags.share_taxi === "yes" || route === "share_taxi") return "ميكروباص";
  return "موقف";
}

function extractName(tags: Record<string, string>): string {
  return (
    tags["name:ar"] ||
    tags.name ||
    tags["name:en"] ||
    tags.ref ||
    tags.operator ||
    "موقف بدون اسم"
  );
}

function extractLines(tags: Record<string, string>): string[] {
  const lines: string[] = [];
  if (tags.route_ref) lines.push(...tags.route_ref.split(/[;,]/).map((s) => s.trim()).filter(Boolean));
  if (tags.ref && !lines.includes(tags.ref)) lines.push(tags.ref);
  if (tags.network) lines.push(tags.network);
  return lines.slice(0, 4);
}

// استعلام Overpass API — أقرب نقاط مواصلات في دائرة نصف قطرها radiusM متر
export async function fetchNearbyStations(
  user: { lat: number; lng: number },
  radiusM = 1500,
  limit = 15,
): Promise<(Station & { distanceKm: number })[]> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];

  const buildQuery = (r: number) => `
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"](around:${r},${user.lat},${user.lng});
      node["amenity"="bus_station"](around:${r},${user.lat},${user.lng});
      node["railway"="subway_entrance"](around:${r},${user.lat},${user.lng});
      node["railway"="station"](around:${r},${user.lat},${user.lng});
      node["railway"="halt"](around:${r},${user.lat},${user.lng});
      node["railway"="tram_stop"](around:${r},${user.lat},${user.lng});
      node["amenity"="taxi"](around:${r},${user.lat},${user.lng});
      node["amenity"="ferry_terminal"](around:${r},${user.lat},${user.lng});
      node["public_transport"="stop_position"](around:${r},${user.lat},${user.lng});
      node["public_transport"="platform"](around:${r},${user.lat},${user.lng});
      node["public_transport"="station"](around:${r},${user.lat},${user.lng});
    );
    out body ${limit * 4};
  `;

  const tryFetch = async (r: number): Promise<any[]> => {
    const body = "data=" + encodeURIComponent(buildQuery(r));
    let lastErr: unknown = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const data = await res.json();
        return data.elements ?? [];
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("تعذر الوصول لخوادم OpenStreetMap");
  };

  // وسّع نصف القطر تلقائياً لو مفيش نتائج (لحد 15 كم)
  const radii = [radiusM, radiusM * 2, radiusM * 4, radiusM * 8, 15000];
  let elements: any[] = [];
  let lastErr: unknown = null;
  for (const r of radii) {
    try {
      elements = await tryFetch(r);
      if (elements.length > 0) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (elements.length === 0 && lastErr) throw lastErr;

  const seen = new Set<string>();
  const stations = elements
    .filter((el) => el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number")
    .map((el) => {
      const tags = (el.tags ?? {}) as Record<string, string>;
      return {
        id: String(el.id),
        name: extractName(tags),
        lat: el.lat,
        lng: el.lon,
        type: classifyType(tags),
        lines: extractLines(tags),
      } as Station;
    })
    .filter((s) => {
      const key = `${s.name}|${s.lat.toFixed(3)}|${s.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({ ...s, distanceKm: haversineKm(user, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return stations;
}

