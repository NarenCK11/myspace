import { format } from "date-fns";
import { Table2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useElementWidth } from "@/hooks/useElementWidth";
import { parseDay } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { MealBuckets, NutritionDay } from "@/types/api";

/**
 * Segments are drawn bottom to top in a fixed order. Their colours carry
 * meaning (good / mixed / bad), so they come from the status palette, and the
 * legend, tooltip and table always name them - colour is never the only cue.
 */
const SEGMENTS = [
  { key: "good_count", label: "Healthy", fill: "fill-viz-good", bg: "bg-viz-good" },
  { key: "mixed_count", label: "Mixed", fill: "fill-viz-mixed", bg: "bg-viz-mixed" },
  { key: "bad_count", label: "Unhealthy", fill: "fill-viz-bad", bg: "bg-viz-bad" },
  { key: "neutral_count", label: "Neutral", fill: "fill-viz-neutral", bg: "bg-viz-neutral" },
] as const;

type Counts = Pick<MealBuckets, "good_count" | "mixed_count" | "bad_count" | "neutral_count">;

/** "2 healthy, 1 mixed, 1 unhealthy" - only the buckets that have meals. */
export function describeMix(counts: Counts) {
  return SEGMENTS.filter((segment) => counts[segment.key] > 0)
    .map((segment) => `${counts[segment.key]} ${segment.label.toLowerCase()}`)
    .join(" · ");
}

/** One thin horizontal bar for a single day or a whole range. */
export function QualityBar({ counts, className }: { counts: Counts; className?: string }) {
  const total = SEGMENTS.reduce((sum, segment) => sum + counts[segment.key], 0);
  return (
    <div
      role="img"
      aria-label={describeMix(counts) || "No meals"}
      className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full", className)}
    >
      {total === 0 ? (
        <span className="h-full w-full bg-muted" />
      ) : (
        SEGMENTS.filter((segment) => counts[segment.key] > 0).map((segment) => (
          <span
            key={segment.key}
            className={cn("h-full", segment.bg)}
            style={{ flexGrow: counts[segment.key], flexBasis: 0 }}
          />
        ))
      )}
    </div>
  );
}

// --- Stacked columns ---------------------------------------------------------

const HEIGHT = 200;
const MARGIN = { top: 8, right: 4, bottom: 26, left: 28 };
const MAX_BAR = 24;
const GAP = 2;

/** A rectangle with only its top corners rounded: round data-end, square baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, h / 2, w / 2));
  return (
    `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}` +
    `H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`
  );
}

function niceMax(value: number) {
  const step = Math.max(1, Math.ceil(Math.max(value, 3) / 4));
  return { step, max: step * Math.ceil(Math.max(value, 3) / step) };
}

function dayTotal(day: NutritionDay) {
  return SEGMENTS.reduce((sum, segment) => sum + day[segment.key], 0);
}

export function QualityChart({ days }: { days: NutritionDay[] }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const width = Math.max(measured, 260);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = plotW / Math.max(days.length, 1);
  const barW = Math.max(3, Math.min(MAX_BAR, slot - 4));

  const peak = Math.max(0, ...days.map(dayTotal));
  const { step, max } = niceMax(peak);
  const y = (value: number) => MARGIN.top + plotH * (1 - value / max);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => index * step);

  const totals = SEGMENTS.map((segment) => ({
    ...segment,
    total: days.reduce((sum, day) => sum + day[segment.key], 0),
  }));
  const labelEvery = days.length <= 7 ? 1 : Math.ceil(days.length / 8);
  const activeDay = active !== null ? days[active] : null;

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
        {totals.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2.5 rounded-[3px]", segment.bg)} aria-hidden />
            {segment.label}
            <span className="font-medium tabular-nums text-foreground">{segment.total}</span>
          </li>
        ))}
      </ul>

      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label="Meals per day, split by how healthy they were"
          className="block overflow-visible"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {tick}
              </text>
            </g>
          ))}

          {days.map((day, index) => {
            const cx = MARGIN.left + slot * (index + 0.5);
            const parts = SEGMENTS.filter((segment) => day[segment.key] > 0);
            let running = 0;
            const date = parseDay(day.date);

            return (
              <g key={day.date}>
                {active === index && (
                  <rect
                    x={MARGIN.left + slot * index}
                    y={MARGIN.top}
                    width={slot}
                    height={plotH}
                    className="fill-muted"
                    opacity={0.6}
                    rx={4}
                  />
                )}

                {parts.map((segment, partIndex) => {
                  const count = day[segment.key];
                  const top = y(running + count);
                  const bottom = y(running);
                  running += count;
                  const isTop = partIndex === parts.length - 1;
                  const isBottom = partIndex === 0;
                  const segY = top + (isTop ? 0 : GAP / 2);
                  const segH = Math.max(2, bottom - segY - (isBottom ? 0 : GAP / 2));
                  const x = cx - barW / 2;
                  return isTop ? (
                    <path
                      key={segment.key}
                      d={topRounded(x, segY, barW, segH, 4)}
                      className={segment.fill}
                    />
                  ) : (
                    <rect key={segment.key} x={x} y={segY} width={barW} height={segH} className={segment.fill} />
                  );
                })}

                {index % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {days.length <= 7 ? format(date, "EEE") : format(date, "d")}
                  </text>
                )}

                {/* A wide, invisible target: aiming at a thin bar is not required. */}
                <rect
                  x={MARGIN.left + slot * index}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${format(date, "EEEE d MMMM")}: ${
                    dayTotal(day) ? `${dayTotal(day)} meals, ${describeMix(day)}` : "no meals"
                  }`}
                  onPointerEnter={() => setActive(index)}
                  onPointerDown={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none focus-visible:stroke-primary"
                />
              </g>
            );
          })}

          <line
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={y(0)}
            y2={y(0)}
            className="stroke-border"
            strokeWidth={1}
          />
        </svg>

        {activeDay && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-border bg-surface-raised p-2.5 shadow-raised"
            style={{
              left: Math.min(
                Math.max(MARGIN.left + slot * (active + 0.5) - 88, 0),
                Math.max(width - 176, 0),
              ),
            }}
          >
            <p className="mb-1.5 text-2xs text-muted-foreground">
              {format(parseDay(activeDay.date), "EEE d MMM")}
            </p>
            <p className="mb-1 text-sm font-semibold tabular-nums">
              {dayTotal(activeDay)} {dayTotal(activeDay) === 1 ? "meal" : "meals"}
            </p>
            <ul className="space-y-0.5">
              {SEGMENTS.filter((segment) => activeDay[segment.key] > 0).map((segment) => (
                <li key={segment.key} className="flex items-center gap-2 text-xs">
                  <span className={cn("size-2 rounded-[2px]", segment.bg)} aria-hidden />
                  <span className="font-medium tabular-nums">{activeDay[segment.key]}</span>
                  <span className="text-muted-foreground">{segment.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((value) => !value)}>
          <Table2 /> {showTable ? "Hide table" : "Show as table"}
        </Button>
        {showTable && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-sunken text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 font-medium">Meals</th>
                  {SEGMENTS.map((segment) => (
                    <th key={segment.key} className="px-3 py-2 font-medium">
                      {segment.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">kcal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {[...days].reverse().map((day) => (
                  <tr key={day.date}>
                    <td className="whitespace-nowrap px-3 py-1.5">{format(parseDay(day.date), "EEE d MMM")}</td>
                    <td className="px-3 py-1.5">{dayTotal(day)}</td>
                    {SEGMENTS.map((segment) => (
                      <td key={segment.key} className="px-3 py-1.5">
                        {day[segment.key]}
                      </td>
                    ))}
                    <td className="px-3 py-1.5">{day.calories_total || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
