import { differenceInCalendarDays, format } from "date-fns";
import { useRef, useState } from "react";

import { useElementWidth } from "@/hooks/useElementWidth";
import { parseDay } from "@/lib/datetime";
import { formatKg } from "@/lib/nutrition";
import type { WeightEntry } from "@/types/api";

const HEIGHT = 220;
const MARGIN = { top: 14, right: 14, bottom: 26, left: 40 };

/** Picks a tick step that gives at most five labelled gridlines. */
function niceScale(low: number, high: number) {
  const span = Math.max(high - low, 1);
  const step = [0.5, 1, 2, 5, 10].find((candidate) => span / candidate <= 4) ?? 20;
  return {
    lo: Math.floor(low / step) * step,
    hi: Math.ceil(high / step) * step,
    step,
  };
}

interface WeightChartProps {
  entries: WeightEntry[];
  /** First and last day of the window, YYYY-MM-DD. Days without an entry are simply empty. */
  start: string;
  end: string;
  targetKg?: number;
}

/**
 * One series, so no legend: the card title says what is plotted. Entries are
 * placed by date, so a gap in logging shows as a gap rather than being squeezed.
 * The history list under the chart is the table view for the same numbers.
 */
export function WeightChart({ entries, start, end, targetKg }: WeightChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const width = Math.max(measured, 260);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const startDate = parseDay(start);
  const spanDays = Math.max(differenceInCalendarDays(parseDay(end), startDate), 1);
  const x = (day: string) =>
    MARGIN.left + plotW * (differenceInCalendarDays(parseDay(day), startDate) / spanDays);

  const weights = entries.map((entry) => entry.weight_kg);
  const padding = Math.max(0.5, (Math.max(...weights) - Math.min(...weights)) * 0.2);
  const low = Math.min(...weights, targetKg ?? Infinity) - padding;
  const high = Math.max(...weights, targetKg ?? -Infinity) + padding;
  const { lo, hi, step } = niceScale(low, high);
  const y = (kg: number) => MARGIN.top + plotH * (1 - (kg - lo) / (hi - lo));
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

  const points = entries.map((entry) => ({ entry, px: x(entry.logged_on), py: y(entry.weight_kg) }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join("");
  const baseline = MARGIN.top + plotH;
  const area = points.length > 1 ? `${line}L${points.at(-1)!.px},${baseline}L${points[0].px},${baseline}Z` : "";

  const last = points.at(-1)!;
  const showAllDots = points.length <= 20;
  const current = active !== null ? points[active] : null;
  const previous = active !== null && active > 0 ? points[active - 1].entry : null;

  function nearest(clientX: number) {
    const left = svgRef.current?.getBoundingClientRect().left ?? 0;
    const px = clientX - left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.px - px) < Math.abs(points[best].px - px)) best = i;
    });
    return best;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    setActive((index) => Math.min(Math.max((index ?? points.length) + delta, 0), points.length - 1));
  }

  const labelAnchor = last.px > width - 48 ? "end" : "middle";
  const middle = new Date(startDate.getTime() + (spanDays / 2) * 86_400_000);

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        tabIndex={0}
        role="img"
        aria-label={`Weight trend. Latest ${formatKg(last.entry.weight_kg)} kilograms on ${last.entry.logged_on}. Use the left and right arrow keys to move between entries.`}
        className="block overflow-visible rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}

        {targetKg !== undefined && (
          <g aria-hidden="true">
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y(targetKg)}
              y2={y(targetKg)}
              className="stroke-warning"
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <text
              x={width - MARGIN.right}
              y={y(targetKg) - 5}
              textAnchor="end"
              className="fill-warning text-[11px] font-medium"
            >
              {formatKg(targetKg)} kg goal
            </text>
          </g>
        )}

        {[
          { at: startDate, anchor: "start" as const, px: MARGIN.left },
          { at: middle, anchor: "middle" as const, px: MARGIN.left + plotW / 2 },
          { at: parseDay(end), anchor: "end" as const, px: width - MARGIN.right },
        ].map((item) => (
          <text key={item.px} x={item.px} y={HEIGHT - 8} textAnchor={item.anchor} className="fill-muted-foreground text-[11px]">
            {format(item.at, "d MMM")}
          </text>
        ))}

        {area && <path d={area} className="fill-primary" opacity={0.1} />}
        {points.length > 1 && (
          <path d={line} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {current && (
          <line x1={current.px} x2={current.px} y1={MARGIN.top} y2={baseline} className="stroke-muted-foreground" strokeWidth={1} opacity={0.5} />
        )}

        {points.map((p, i) => {
          const isLast = p === last;
          if (!showAllDots && !isLast && i !== active) return null;
          return (
            <g key={p.entry.id}>
              <circle cx={p.px} cy={p.py} r={6} className="fill-surface" />
              <circle cx={p.px} cy={p.py} r={i === active ? 5 : 4} className="fill-primary" />
            </g>
          );
        })}

        <text x={last.px} y={last.py - 12} textAnchor={labelAnchor} className="fill-foreground text-xs font-semibold tabular-nums">
          {formatKg(last.entry.weight_kg)}
        </text>

        {/* The pointer target spans the whole plot, so the nearest day is found for the reader. */}
        <rect
          x={MARGIN.left}
          y={0}
          width={plotW}
          height={HEIGHT}
          fill="transparent"
          onPointerMove={(event) => setActive(nearest(event.clientX))}
          onPointerDown={(event) => setActive(nearest(event.clientX))}
        />
      </svg>

      {current && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-40 rounded-lg border border-border bg-surface-raised p-2.5 shadow-raised"
          style={{ left: Math.min(Math.max(current.px - 80, 0), Math.max(width - 160, 0)) }}
        >
          <p className="text-sm font-semibold tabular-nums">{formatKg(current.entry.weight_kg)} kg</p>
          <p className="text-2xs text-muted-foreground">{format(parseDay(current.entry.logged_on), "EEE d MMM")}</p>
          {previous && (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {formatKg(current.entry.weight_kg - previous.weight_kg, true)} kg since{" "}
              {format(parseDay(previous.logged_on), "d MMM")}
            </p>
          )}
          {current.entry.note && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{current.entry.note}</p>}
        </div>
      )}
    </div>
  );
}
