import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Minus, Pencil, Scale, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { StatCard } from "@/components/common/bits";
import { WeightChart } from "@/components/meals/WeightChart";
import { WeightForm } from "@/components/meals/WeightForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { formatDay, parseDay, shiftDay } from "@/lib/datetime";
import { formatKg } from "@/lib/nutrition";
import { fetchWeights, fetchWeightStats, keys, NUTRITION_KEYS } from "@/lib/queries";
import type { WeightEntry } from "@/types/api";

const RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
];

/** A signed change in kilograms with a direction icon. Neutral colour: up or down is not good or bad. */
function changeText(value: number | null) {
  return value === null ? "-" : `${formatKg(value, true)} kg`;
}

function changeIcon(value: number | null) {
  if (value === null || Math.abs(value) < 0.05) return Minus;
  return value > 0 ? ArrowUpRight : ArrowDownRight;
}

export function WeightView({ today }: { today: string }) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState("90");
  const [formDate, setFormDate] = useState(today);

  const days = Number(range);
  const start = shiftDay(today, -(days - 1));
  const params = { start, end: today, limit: 400 };

  const stats = useQuery({ queryKey: keys.weightStats, queryFn: fetchWeightStats, staleTime: 10_000 });
  const entries = useQuery({
    queryKey: keys.weights(params),
    queryFn: () => fetchWeights(params),
    staleTime: 10_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/weights/${id}`),
    onSuccess: () => {
      NUTRITION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success("Weight entry deleted");
    },
    onError: (error) => toast.error("Could not delete entry", { description: errorMessage(error) }),
  });

  // Newest first for the list, with each row's change against the entry before it.
  const history = useMemo(() => {
    const rows = entries.data ?? [];
    return rows
      .map((entry, index) => ({
        entry,
        delta: index > 0 ? entry.weight_kg - rows[index - 1].weight_kg : null,
      }))
      .reverse();
  }, [entries.data]);

  if (stats.isError) {
    return <ErrorState message={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />;
  }

  const s = stats.data;
  const sinceIcon = changeIcon(s?.change_since_previous ?? null);
  const monthIcon = changeIcon(s?.change_30d ?? null);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!s ? (
          Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              icon={Scale}
              label="Latest"
              value={s.latest ? `${formatKg(s.latest.weight_kg)} kg` : "-"}
              hint={s.latest ? formatDay(`${s.latest.logged_on}T12:00:00`) : "nothing logged yet"}
              tone="info"
            />
            <StatCard
              icon={sinceIcon}
              label="Since last entry"
              value={changeText(s.change_since_previous)}
              hint={s.previous ? `vs ${format(parseDay(s.previous.logged_on), "d MMM")}` : "needs two entries"}
            />
            <StatCard
              icon={TrendingUp}
              label="7-day average"
              value={s.average_7d !== null ? `${formatKg(s.average_7d)} kg` : "-"}
              hint="up to the latest entry"
            />
            <StatCard
              icon={monthIcon}
              label="30-day change"
              value={changeText(s.change_30d)}
              hint={s.change_30d === null ? "needs older entries" : "since the oldest in 30 days"}
            />
          </>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="order-2 lg:order-1 lg:col-span-2">
          <CardHeader className="flex-wrap">
            <CardTitle>Weight over time</CardTitle>
            <Tabs value={range} onValueChange={setRange}>
              <TabsList>
                {RANGES.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {entries.isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : entries.isError ? (
              <ErrorState message={errorMessage(entries.error)} onRetry={() => void entries.refetch()} />
            ) : entries.data && entries.data.length > 0 ? (
              <WeightChart entries={entries.data} start={start} end={today} />
            ) : (
              <EmptyState
                compact
                icon={Scale}
                title="No weights in this period"
                description="Log your weight each day and the trend appears here."
                className="border-0"
              />
            )}
          </CardContent>
        </Card>

        <Card className="order-1 lg:order-2 lg:self-start">
          <CardHeader>
            <CardTitle>Log weight</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightForm date={formDate} today={today} onDateChange={setFormDate} />
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">History</h2>
        {history.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {history.map(({ entry, delta }) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  delta={delta}
                  onEdit={() => {
                    setFormDate(entry.logged_on);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onDelete={() => remove.mutate(entry.id)}
                />
              ))}
            </ul>
          </Card>
        ) : (
          !entries.isLoading && <p className="text-sm text-muted-foreground">No entries in this period.</p>
        )}
      </section>
    </div>
  );
}

function HistoryRow({
  entry,
  delta,
  onEdit,
  onDelete,
}: {
  entry: WeightEntry;
  delta: number | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{formatKg(entry.weight_kg)} kg</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {format(parseDay(entry.logged_on), "EEE d MMM yyyy")}
          </span>
        </p>
        {entry.note && <p className="truncate text-xs text-muted-foreground">{entry.note}</p>}
      </div>
      {delta !== null && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatKg(delta, true)} kg</span>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit weight for ${entry.logged_on}`}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Delete weight for ${entry.logged_on}`}>
        <Trash2 />
      </Button>
    </li>
  );
}
