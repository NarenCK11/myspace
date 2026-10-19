import { ChevronLeft, ChevronRight, Plus, RotateCcw, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DayView } from "@/components/meals/DayView";
import { MealDialog } from "@/components/meals/MealDialog";
import { TrendsView } from "@/components/meals/TrendsView";
import { WeightDialog } from "@/components/meals/WeightForm";
import { WeightView } from "@/components/meals/WeightView";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLongDate, shiftDay, todayISO } from "@/lib/datetime";
import { useAuth } from "@/providers/AuthProvider";
import type { Meal } from "@/types/api";

const TABS = [
  { value: "day", label: "Day" },
  { value: "weight", label: "Weight" },
  { value: "trends", label: "Trends" },
];

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function MealsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = todayISO(user?.timezone);
  const requested = searchParams.get("day");
  const day = requested && DAY_PATTERN.test(requested) && requested <= today ? requested : today;
  const isToday = day === today;
  const tab = TABS.some((item) => item.value === searchParams.get("tab")) ? searchParams.get("tab")! : "day";
  const focusId = searchParams.get("focus");

  const [mealOpen, setMealOpen] = useState(false);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // Links such as /meals?new=meal (the dashboard card) open the matching dialog.
  const request = searchParams.get("new");
  useEffect(() => {
    if (!request) return;
    if (request === "meal") {
      setEditing(null);
      setMealOpen(true);
    } else if (request === "weight") {
      setWeightOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  function setDay(next: string) {
    update({ day: next === today ? null : next, focus: null });
  }

  function addMeal() {
    setEditing(null);
    setMealOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meals"
        description={
          tab === "day"
            ? formatLongDate(`${day}T12:00:00`)
            : tab === "weight"
              ? "Your day-to-day weight."
              : "How your eating has looked lately."
        }
        actions={
          tab === "day" ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button variant="secondary" size="icon-sm" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day">
                <ChevronLeft />
              </Button>
              {!isToday && (
                <Button variant="secondary" size="sm" onClick={() => setDay(today)}>
                  <RotateCcw /> Today
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => setDay(shiftDay(day, 1))}
                disabled={isToday}
                aria-label="Next day"
              >
                <ChevronRight />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setWeightOpen(true)} className="ml-1">
                <Scale /> Weight
              </Button>
              <Button size="sm" onClick={addMeal}>
                <Plus /> Log meal
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(value) => update({ tab: value === "day" ? null : value })}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="day">
          <DayView
            day={day}
            focusId={focusId}
            onAddMeal={addMeal}
            onEditMeal={(meal) => {
              setEditing(meal);
              setMealOpen(true);
            }}
            onLogWeight={() => setWeightOpen(true)}
          />
        </TabsContent>
        <TabsContent value="weight">
          <WeightView today={today} />
        </TabsContent>
        <TabsContent value="trends">
          <TrendsView />
        </TabsContent>
      </Tabs>

      <MealDialog open={mealOpen} onOpenChange={setMealOpen} meal={editing} day={day} today={today} />
      <WeightDialog open={weightOpen} onOpenChange={setWeightOpen} day={day} today={today} />
    </div>
  );
}
