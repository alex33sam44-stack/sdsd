import { useEffect, useState } from "react";
import { listUserContributions, type UserContribution } from "@/modules/shared/services/userContributions";

export function useUserContributions() {
  const [items, setItems] = useState<UserContribution[]>(() => listUserContributions());

  useEffect(() => {
    const refresh = () => setItems(listUserContributions());
    window.addEventListener("storage", refresh);
    window.addEventListener("mwasalat:user-contributions-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("mwasalat:user-contributions-changed", refresh);
    };
  }, []);

  return items;
}
