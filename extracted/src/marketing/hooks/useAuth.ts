import { useEffect, useState } from "react";
import { authApi, tokenStore } from "@/lib/api";

export type MarketingAuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export function useAuth() {
  const [user, setUser] = useState<MarketingAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = tokenStore.access;
      if (!token) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await authApi.me<MarketingAuthUser>();
        if (!cancelled) setUser(currentUser);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUser();

    const unsubscribe = tokenStore.subscribe((event) => {
      if (event === "signed_out") {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      loadUser();
    });

    function onStorage(e: StorageEvent) {
      if (e.key !== "auth.accessToken") return;
      setLoading(true);
      loadUser();
    }

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    user,
    loading,
    signOut: async () => {
      await authApi.logout();
      setUser(null);
    },
  };
}
