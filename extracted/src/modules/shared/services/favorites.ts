// Favorites — backed by REST `/favorites` (JWT-protected on the server).
import { api, ApiError, tokenStore } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import type { Favorite } from "../types";

export async function listFavorites(): Promise<Favorite[]> {
  if (!tokenStore.access) return [];
  try {
    const rows = await api.get<unknown[]>("/favorites");
    const list = snakify<Favorite[]>(rows);
    return list
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return [];
    throw e;
  }
}

export async function addFavorite(input: {
  kind: "station" | "line" | "place";
  refId?: string | null;
  label?: string;
  payload?: Record<string, unknown>;
}): Promise<Favorite> {
  if (!tokenStore.access) throw new Error("سجّل الدخول لحفظ المفضلات");
  const body = {
    kind: input.kind,
    refId: input.refId ?? null,
    label: input.label,
    payload: input.payload ?? null,
  };
  const created = await api.post<unknown>("/favorites", body);
  return snakify<Favorite>(created);
}

export async function removeFavorite(id: string): Promise<void> {
  await api.delete<void>(`/favorites/${encodeURIComponent(id)}`);
}
