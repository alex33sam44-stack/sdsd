import { TaxiLine } from "@/data/stations";
import { formatNumber } from "@/lib/storage";
import { useTranslation } from "react-i18next";

type Props = {
  lines: TaxiLine[];
  onSelectLine: (line: TaxiLine) => void;
  highlightedId?: string | null;
};

/**
 * Static illustrated station map (SVG).
 * Shows entrance, exit, waiting area, kiosks and color-coded line bays.
 */
export const StationMap = ({ lines, onSelectLine, highlightedId }: Props) => {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-secondary overflow-hidden shadow-tactile bg-surface">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-auto block"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={t("stationMap.ariaMap")}
        >
          {/* Asphalt background */}
          <rect width="100" height="100" fill="#E2E8F0" />

          {/* Sidewalks */}
          <rect x="0" y="0" width="100" height="6" fill="#CBD5E1" />
          <rect x="0" y="94" width="100" height="6" fill="#CBD5E1" />
          <rect x="0" y="0" width="4" height="100" fill="#CBD5E1" />
          <rect x="96" y="0" width="4" height="100" fill="#CBD5E1" />

          {/* Central road */}
          <rect x="4" y="46" width="92" height="8" fill="#475569" />
          <g stroke="#FFC800" strokeWidth="0.6" strokeDasharray="3 2">
            <line x1="6" y1="50" x2="94" y2="50" />
          </g>

          {/* Entrance (right side, RTL = start) */}
          <g>
            <rect x="92" y="44" width="8" height="12" fill="#16A34A" opacity="0.85" />
            <text
              x="96"
              y="51.5"
              textAnchor="middle"
              fontSize="2.4"
              fontFamily="Cairo, sans-serif"
              fontWeight="700"
              fill="#FFFFFF"
            >
              {t("stationMap.entrance")}
            </text>
          </g>

          {/* Exit (left side) */}
          <g>
            <rect x="0" y="44" width="8" height="12" fill="#DC2626" opacity="0.85" />
            <text
              x="4"
              y="51.5"
              textAnchor="middle"
              fontSize="2.4"
              fontFamily="Cairo, sans-serif"
              fontWeight="700"
              fill="#FFFFFF"
            >
              {t("stationMap.exit")}
            </text>
          </g>

          {/* Waiting area + kiosks in middle */}
          <g>
            <rect x="36" y="37" width="28" height="6" rx="1.2" fill="#0A1128" />
            <text
              x="50"
              y="41.4"
              textAnchor="middle"
              fontSize="2.6"
              fontFamily="Cairo, sans-serif"
              fontWeight="700"
              fill="#FFC800"
            >
              {t("stationMap.waitingArea")}
            </text>
            <rect x="36" y="57" width="28" height="6" rx="1.2" fill="#0A1128" />
            <text
              x="50"
              y="61.4"
              textAnchor="middle"
              fontSize="2.6"
              fontFamily="Cairo, sans-serif"
              fontWeight="700"
              fill="#FFC800"
            >
              {t("stationMap.ticketBooth")}
            </text>
          </g>

          {/* Taxi line bays */}
          {lines.map((line) => {
            const { x, y, w, h } = line.zone;
            const isHi = highlightedId === line.id;
            return (
              <g
                key={line.id}
                className="cursor-pointer"
                onClick={() => onSelectLine(line)}
                role="button"
                aria-label={t("stationMap.bayAria", { destination: line.destination, cars: line.cars })}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx="2"
                  fill={line.color}
                  fillOpacity={isHi ? 1 : 0.85}
                  stroke="#0A1128"
                  strokeWidth={isHi ? 1.4 : 0.8}
                />
                {/* Mini cars */}
                <g>
                  <rect x={x + 2} y={y + h - 5} width="6" height="3" rx="0.6" fill="#0A1128" />
                  <rect x={x + 9.5} y={y + h - 5} width="6" height="3" rx="0.6" fill="#0A1128" opacity={line.cars > 1 ? 1 : 0.25} />
                  <rect x={x + 17} y={y + h - 5} width="6" height="3" rx="0.6" fill="#0A1128" opacity={line.cars > 2 ? 1 : 0.25} />
                </g>
                <text
                  x={x + w / 2}
                  y={y + 6}
                  textAnchor="middle"
                  fontSize="3"
                  fontFamily="Cairo, sans-serif"
                  fontWeight="700"
                  fill="#0A1128"
                >
                  {line.destination}
                </text>
                <text
                  x={x + w / 2}
                  y={y + 10}
                  textAnchor="middle"
                  fontSize="2.4"
                  fontFamily="Cairo, sans-serif"
                  fontWeight="600"
                  fill="#0A1128"
                  opacity="0.75"
                >
                  {line.cars > 0
                    ? t("stationMap.carsCount", { count: formatNumber(line.cars, i18n.language) })
                    : t("stationMap.noCarsShort")}
                </text>
              </g>
            );
          })}

          {/* Compass */}
          <g transform="translate(88,88)">
            <circle r="5" fill="#FFFFFF" stroke="#0A1128" strokeWidth="0.6" />
            <text textAnchor="middle" y="-1" fontSize="2.4" fontFamily="Cairo" fontWeight="700" fill="#DC2626">{t("stationMap.compassN")}</text>
            <text textAnchor="middle" y="3.2" fontSize="2.4" fontFamily="Cairo" fontWeight="700" fill="#0A1128">{t("stationMap.compassS")}</text>
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
        <p className="text-xs font-black text-secondary mb-2">{t("stationMap.colorsLegend")}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <LegendChip color="#16A34A" label={t("stationMap.stationEntrance")} />
          <LegendChip color="#DC2626" label={t("stationMap.stationExit")} />
          <LegendChip color="#0A1128" label={t("stationMap.waitingKiosk")} />
        </div>
        <p className="text-xs font-black text-secondary mb-2">{t("stationMap.lineBays")}</p>
        <div className="flex flex-wrap gap-2">
          {lines.map((l) => (
            <LegendChip
              key={l.id}
              color={l.color}
              label={`${l.destination}${l.vehicleType ? ` · ${l.vehicleType}` : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const LegendChip = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-secondary bg-surface-alt px-2.5 py-1">
    <span
      aria-hidden
      className="w-3 h-3 rounded-sm border border-secondary"
      style={{ backgroundColor: color }}
    />
    <span className="text-[11px] font-bold text-secondary">{label}</span>
  </span>
);
