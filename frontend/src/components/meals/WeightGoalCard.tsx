import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { Link } from "react-router-dom";

import { WeightChart } from "@/components/meals/WeightChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { formatDay, shiftDay } from "@/lib/datetime";
import { formatKg } from "@/lib/nutrition";
import { fetchWeights, keys } from "@/lib/queries";
import type { WeightStats } from "@/types/api";

const TARGET_KG = 75;
const TREND_DAYS = 90;

export function WeightGoalCard({
  today,
  weight,
}: {
  today: string;
  weight: WeightStats;
}) {
  const start = shiftDay(today, -(TREND_DAYS - 1));
  const params = { start, end: today, limit: 400 };
  const entries = useQuery({
    queryKey: keys.weights(params),
    queryFn: () => fetchWeights(params),
    staleTime: 30_000,
  });

  const latest = weight.latest;
  const remaining = latest ? Math.max(latest.weight_kg - TARGET_KG, 0) : null;
  const reachedTarget = latest !== null && latest.weight_kg <= TARGET_KG;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4 text-muted-foreground" />
          Weight goal
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/meals?tab=weight">View log</Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {remaining === null
                ? "—"
                : reachedTarget
                  ? "Target reached"
                  : `${formatKg(remaining)} kg`}
            </p>
            <p className="text-xs text-muted-foreground">
              {reachedTarget ? "At or below your goal" : "remaining to lose"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Target
            </p>
            <p className="font-semibold tabular-nums">{TARGET_KG} kg</p>
          </div>
        </div>

        {latest && (
          <p className="text-xs text-muted-foreground">
            Latest: {formatKg(latest.weight_kg)} kg
            {latest.logged_on !== today && ` · ${formatDay(`${latest.logged_on}T12:00:00`)}`}
          </p>
        )}

        {entries.isLoading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : entries.isError ? (
          <ErrorState
            message="Could not load weight history."
            onRetry={() => void entries.refetch()}
            className="px-3 py-5"
          />
        ) : entries.data?.length ? (
          <WeightChart
            entries={entries.data}
            start={start}
            end={today}
            targetKg={TARGET_KG}
          />
        ) : (
          <EmptyState
            compact
            icon={Scale}
            title="No weight history yet"
            description="Log your weight to see progress toward your goal."
            className="border-0 py-4"
          />
        )}
      </CardContent>
    </Card>
  );
}
