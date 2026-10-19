import { useQuery } from "@tanstack/react-query";
import { Flame, Plus, Scale, UtensilsCrossed } from "lucide-react";
import { useEffect } from "react";

import { StatCard } from "@/components/common/bits";
import { LabelPill } from "@/components/meals/LabelPill";
import { MealRow } from "@/components/meals/MealRow";
import { describeMix, QualityBar } from "@/components/meals/QualityChart";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { formatKg } from "@/lib/nutrition";
import { fetchMeals, fetchNutritionSummary, keys } from "@/lib/queries";
import type { DaySummary, Meal } from "@/types/api";

interface DayViewProps {
  day: string;
  focusId: string | null;
  onAddMeal: () => void;
  onEditMeal: (meal: Meal) => void;
  onLogWeight: () => void;
}

export function DayView({ day, focusId, onAddMeal, onEditMeal, onLogWeight }: DayViewProps) {
  const params = { day, order: "asc", limit: 200 };
  const meals = useQuery({
    queryKey: keys.meals(params),
    queryFn: () => fetchMeals(params),
    staleTime: 10_000,
  });
  const summary = useQuery({
    queryKey: keys.nutritionSummary(day),
    queryFn: () => fetchNutritionSummary(day),
    staleTime: 10_000,
  });

  // Arriving from a search result: bring the matching meal into view.
  const loaded = meals.data?.items.length ?? 0;
  useEffect(() => {
    if (focusId && loaded) {
      document.getElementById(`meal-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusId, loaded]);

  if (meals.isError) {
    return <ErrorState message={errorMessage(meals.error)} onRetry={() => void meals.refetch()} />;
  }

  const data = summary.data;
  const items = meals.data?.items ?? [];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              icon={UtensilsCrossed}
              label="Meals"
              value={data.meals_count}
              hint={data.meals_count ? "logged today" : "nothing logged"}
              tone="info"
            />
            <StatCard
              icon={Flame}
              label="Calories"
              value={data.calories_logged_count ? data.calories_total : "-"}
              hint={
                data.calories_logged_count
                  ? `from ${data.calories_logged_count} of ${data.meals_count} meals`
                  : "add kcal to a meal"
              }
              tone="warning"
            />
            <MixCard summary={data} />
            <StatCard
              icon={Scale}
              label="Weight"
              value={data.weight_kg !== null ? `${formatKg(data.weight_kg)} kg` : "-"}
              hint={data.weight_kg !== null ? "tap to update" : "tap to log"}
              tone="default"
              onClick={onLogWeight}
            />
          </>
        )}
      </section>

      {data && data.label_counts.length > 0 && (
        <section aria-label="Labels used" className="flex flex-wrap items-center gap-1.5">
          {data.label_counts.map((row) => (
            <LabelPill key={row.label_id} label={row} count={row.count} />
          ))}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Eaten today</h2>
          {items.length > 0 && (
            <Button size="sm" variant="secondary" onClick={onAddMeal}>
              <Plus /> Add meal
            </Button>
          )}
        </div>

        {meals.isLoading ? (
          <ListSkeleton rows={3} />
        ) : items.length ? (
          <div className="space-y-2">
            {items.map((meal) => (
              <MealRow key={meal.id} meal={meal} onEdit={onEditMeal} highlighted={focusId === meal.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UtensilsCrossed}
            title="Nothing logged for this day"
            description="Add each thing you eat or drink, then label it healthy, protein, fatty and so on."
            action={
              <Button size="sm" onClick={onAddMeal}>
                <Plus /> Log a meal
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}

/** The healthy / mixed / unhealthy split for the day as one thin stacked bar. */
function MixCard({ summary }: { summary: DaySummary }) {
  return (
    <div className="card-surface flex flex-col gap-2 p-4">
      <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Meal mix
      </span>
      {summary.meals_count ? (
        <>
          <QualityBar counts={summary} />
          <span className="text-xs leading-snug text-muted-foreground">{describeMix(summary)}</span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">Nothing to rate yet</span>
      )}
    </div>
  );
}
