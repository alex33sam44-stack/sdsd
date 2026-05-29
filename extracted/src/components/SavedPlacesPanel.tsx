import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Home, Briefcase, GraduationCap, Stethoscope, Star, Clock, Trash2 } from "lucide-react";
import {
  listSavedPlaces,
  listRecentDestinations,
  clearRecentDestinations,
  placeToParams,
  type SavedPlaceKind,
} from "@/lib/quickAccess";
import { useEffect, useState } from "react";

const ICON_BY_KIND: Record<SavedPlaceKind, React.ElementType> = {
  home: Home,
  work: Briefcase,
  university: GraduationCap,
  hospital: Stethoscope,
  custom: Star,
};

type Props = {
  /** Reload signal — bump from parent to refresh after a save. */
  reloadKey?: number;
  /** When true, link goes to planner with destination prefilled. */
  asDestinationLinks?: boolean;
};

export function SavedPlacesPanel({ reloadKey = 0, asDestinationLinks = true }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [places, setPlaces] = useState(() => listSavedPlaces());
  const [recents, setRecents] = useState(() => listRecentDestinations());

  useEffect(() => {
    setPlaces(listSavedPlaces());
    setRecents(listRecentDestinations());
  }, [reloadKey]);

  const goTo = (label: string, lat: number, lng: number) => {
    const param = placeToParams(label, lat, lng);
    navigate(asDestinationLinks ? `/planner?dest=${param}` : `/planner?origin=${param}`);
  };

  if (places.length === 0 && recents.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="saved-places-heading">
      {places.length > 0 && (
        <div className="space-y-2">
          <h3 id="saved-places-heading" className="font-black text-secondary text-sm">
            {t("quick.savedPlacesTitle")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {places.map((p) => {
              const Icon = ICON_BY_KIND[p.kind] ?? Star;
              return (
                <button
                  key={p.id}
                  onClick={() => goTo(p.label, p.lat, p.lng)}
                  className="inline-flex items-center gap-2 px-3 h-10 rounded-full border-2 border-secondary bg-surface hover:bg-surface-alt shadow-tactile-sm font-bold text-secondary text-sm"
                >
                  <Icon className="w-4 h-4" strokeWidth={2.5} />
                  <span className="truncate max-w-[10rem]">{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {recents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-secondary text-sm flex items-center gap-1">
              <Clock className="w-4 h-4" strokeWidth={2.5} />
              {t("quick.recentDestinations")}
            </h3>
            <button
              onClick={() => {
                clearRecentDestinations();
                setRecents([]);
              }}
              className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1 hover:text-secondary"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t("quick.clear")}
            </button>
          </div>
          <ul className="space-y-2">
            {recents.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => goTo(r.label, r.lat, r.lng)}
                  className="w-full text-start flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-secondary bg-surface hover:bg-surface-alt"
                >
                  <Clock className="w-4 h-4 text-secondary shrink-0" strokeWidth={2.5} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-secondary text-sm truncate">{r.label}</p>
                    {r.area && (
                      <p className="text-[11px] font-semibold text-muted-foreground truncate">{r.area}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
