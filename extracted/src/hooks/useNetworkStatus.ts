import { useEffect, useState } from "react";
import { readNetworkQuality, subscribeNetwork, type NetworkQuality } from "@/lib/networkStatus";

/**
 * React hook reflecting the current connection quality.
 * Returns: "online" | "weak" | "offline".
 */
export function useNetworkStatus(): NetworkQuality {
  const [q, setQ] = useState<NetworkQuality>(() =>
    typeof window === "undefined" ? "online" : readNetworkQuality(),
  );
  useEffect(() => subscribeNetwork(setQ), []);
  return q;
}
