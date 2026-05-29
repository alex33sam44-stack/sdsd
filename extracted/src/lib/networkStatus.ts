// Detect connection quality at runtime.
// We surface three honest states:
//   - "offline" : navigator says we are offline.
//   - "weak"    : online but slow (NetworkInformation effectiveType in
//                  {"slow-2g","2g"} OR saveData enabled OR very low downlink).
//   - "online"  : everything looks healthy.
// We never fabricate values: if the API is unavailable we fall back to
// online/offline only.

export type NetworkQuality = "offline" | "weak" | "online";

type ConnectionLike = {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: "change", cb: () => void) => void;
  removeEventListener?: (type: "change", cb: () => void) => void;
};

function getConnection(): ConnectionLike | null {
  if (typeof navigator === "undefined") return null;
  // Chromium / modern browsers expose this. Safari/Firefox may not.
  const c = (navigator as unknown as { connection?: ConnectionLike }).connection;
  return c ?? null;
}

export function readNetworkQuality(): NetworkQuality {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const c = getConnection();
  if (!c) return "online";
  if (c.saveData) return "weak";
  const et = c.effectiveType ?? "";
  if (et === "slow-2g" || et === "2g") return "weak";
  if (typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 0.4) return "weak";
  return "online";
}

export function subscribeNetwork(listener: (q: NetworkQuality) => void): () => void {
  const fire = () => listener(readNetworkQuality());
  if (typeof window !== "undefined") {
    window.addEventListener("online", fire);
    window.addEventListener("offline", fire);
  }
  const c = getConnection();
  c?.addEventListener?.("change", fire);
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", fire);
      window.removeEventListener("offline", fire);
    }
    c?.removeEventListener?.("change", fire);
  };
}
