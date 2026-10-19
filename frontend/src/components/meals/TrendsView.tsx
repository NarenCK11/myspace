import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CircleCheck, CircleX, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { StatCard } from "@/components/common/bits";
import { LabelPill } from "@/components/meals/LabelPill";
import { QualityBar, QualityChart } from "@/components/meals/QualityChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { fetchNutritionHistory, keys } from "@/lib/queries";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

function share(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "-";
}

export function TrendsView() {
  const [range, setRange] = useState("14");
  const days = Number(range);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.nutritionHistory(days),
    queryFn: () => fetchNutritionHistory(days),
    staleTime: 15_000,
    // Keep the previous chart on screen while a new range loads.
    placeholderData: (previous) => previous,
  });

  if (isError) {
    return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  }

  const maxLabelCount = Math.max(1, ...(data?.label_totals.map((row) => row.count) ?? [1]));

  return (
    <div className="space-y-5">
      {/* One filter row above everything it scopes. */}
      <Tabs value={range} onValueChange={setRange}>
        <TabsList>
          {RANGES.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              Last {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              icon={UtensilsCrossed}
              label="Meals logged"
              value={data.meals_count}
              hint={data.days_with_meals ? `${(data.meals_count / data.days_with_meals).toFixed(1)} per logged day` : "nothing yet"}
              tone="info"
            />
            <StatCard
              icon={CalendarCheck}
              label="Days logged"
              value={`${data.days_with_meals}/${days}`}
              hint={share(data.days_with_meals, days) + " of days"}
            />
            <StatCard
              icon={CircleCheck}
              label="Healthy meals"
              value={data.good_count}
              hint={`${share(data.good_count, data.meals_count)} of meals`}
              tone="success"
            />
            <StatCard
              icon={CircleX}
              label="Unhealthy meals"
              value={data.bad_count}
              hint={`${share(data.bad_count, data.meals_count)} of meals`}
              tone="danger"
            />
          </>
        )}
      </section>

      <Card className={isLoading ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle>Meals per day</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-[200px] w-full" />
          ) : data.meals_count === 0 ? (
            <EmptyState
              compact
              icon={UtensilsCrossed}
              title="No meals in this period"
              description="Log what you eat and how healthy it was, and the pattern shows up here."
              className="border-0"
            />
          ) : (
            <QualityChart days={data.days} />
          )}
        </CardContent>
      </Card>

      {data && data.meals_count > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Overall mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <QualityBar counts={data} className="h-3" />
              <p className="text-sm text-muted-foreground">
                Of {data.meals_count} meals, {share(data.good_count, data.meals_count)} were healthy
                {data.mixed_count ? `, ${share(data.mixed_count, data.meals_count)} mixed` : ""} and{" "}
                {share(data.bad_count, data.meals_count)} unhealthy.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Most used labels</CardTitle>
            </CardHeader>
            <CardContent>
              {data.label_totals.length ? (
                <ul className="space-y-2.5">
                  {data.label_totals.slice(0, 8).map((row) => (
                    <li key={row.label_id} className="flex items-center gap-3">
                      <span className="w-28 shrink-0">
                        <LabelPill label={row} />
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(row.count / maxLabelCount) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 shrink-0 text-right text-xs font-medium tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No labels used in this period.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
