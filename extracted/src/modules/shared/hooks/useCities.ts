import { useQuery } from "@tanstack/react-query";
import { listCities, findNearestCity, type City } from "@/modules/shared/services/cities";

export type DetectedLocation = {
  lat: number;
  lng: number;
  city: City | null;
  distanceToCity: number | null;
};

export function useCities() {
  return useQuery<City[]>({
    queryKey: ["cities:list"],
    staleTime: 5 * 60_000,
    queryFn: listCities,
    retry: (failureCount) => failureCount < 1,
  });
}

/** Map browser coordinates to the nearest seeded Arab city. */
export function detectCityFromCoords(
  cities: City[],
  lat: number,
  lng: number,
): DetectedLocation {
  const r = findNearestCity(cities, lat, lng);
  return {
    lat,
    lng,
    city: r?.city ?? null,
    distanceToCity: r?.distance ?? null,
  };
}
