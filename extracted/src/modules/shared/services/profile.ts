// Current-user profile reads/writes. Backed by `/users/me` (GET, PATCH).
import { api } from "@/lib/api";
import { tokenStore } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import type { Profile } from "../types";

export async function getMyProfile(): Promise<Profile | null> {
  if (!tokenStore.access) return null;
  try {
    const data = await api.get<unknown>("/users/me");
    return snakify<Profile>(data);
  } catch {
    return null;
  }
}

export async function setDefaultStation(stationId: string | null): Promise<void> {
  if (!tokenStore.access) throw new Error("غير مسجل دخول");
  // Backend uses camelCase (Prisma): defaultStationId.
  await api.patch("/users/me", { defaultStationId: stationId });
}
