// Persist a small allow-list of React Query caches to localStorage so the
// passenger essentials survive a cold reload in offline / weak conditions.
//
// What is persisted (allow-list, prefix match on the query key):
//   - "stations:list"   - published stations directory
//   - "stations:detail" - station + lines + stops
//   - "cities:list"     - cities directory (used by Welcome filters)
//
// Everything else (auth, admin, drafts, ops, mutations) is NEVER persisted.
// We always re-fetch on mount; persisted data only fills the gap when the
// network is unavailable.

import type { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

const PERSIST_KEY_PREFIXES = ["stations:list", "stations:detail", "cities:list"];

export function setupQueryPersistence(client: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "taxi.rqcache.v1",
      throttleTime: 1500,
    });
    persistQueryClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient: client as any,
      persister,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      buster: "v1",
      dehydrateOptions: {
        shouldDehydrateQuery: (q) => {
          // Only successful queries that match our allow-list.
          if (q.state.status !== "success") return false;
          const k = q.queryKey?.[0];
          if (typeof k !== "string") return false;
          return PERSIST_KEY_PREFIXES.some((p) => k === p || k.startsWith(p));
        },
      },
    });
  } catch {
    // Storage may be unavailable (private mode, quota). Fail silently —
    // app continues to work with in-memory cache only.
  }
}
