import { Check, Scale, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router-dom";

import { describeMix, QualityBar } from "@/components/meals/QualityChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKg } from "@/lib/nutrition";
import type { NutritionDashboard } from "@/types/api";

/** Today at a glance: what has been eaten, how it rated, and whether weight is logged. */
export function NutritionCard({ nutrition }: { nutrition: NutritionDashboard }) {
  const { today, weight } = nutrition;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="size-4 text-muted-foreground" />
          Nutrition
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/meals">Open</Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {today.meals_count ? (
          <div className="space-y-2">
            <p className="text-sm">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{today.meals_count}</span>{" "}
              <span className="text-muted-foreground">
                {today.meals_count === 1 ? "meal" : "meals"} today
                {today.calories_logged_count ? ` · ${today.calories_total} kcal` : ""}
              </span>
            </p>
            <QualityBar counts={today} />
            <p className="text-xs text-muted-foreground">{describeMix(today)}</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/meals?new=meal">Log another</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Nothing eaten logged yet today.</p>
            <Button asChild size="sm">
              <Link to="/meals?new=meal">Log a meal</Link>
            </Button>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-border pt-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Scale className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tabular-nums">
              {weight.latest ? `${formatKg(weight.latest.weight_kg)} kg` : "No weight yet"}
              {weight.change_since_previous !== null && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {formatKg(weight.change_since_previous, true)} kg
                </span>
              )}
            </p>
            <p className="text-2xs text-muted-foreground">
              {weight.logged_today ? "Logged today" : weight.latest ? `Last on ${weight.latest.logged_on}` : "Start your log"}
            </p>
          </div>
          {weight.logged_today ? (
            <Check className="size-4 shrink-0 text-viz-good" aria-label="Logged today" />
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link to="/meals?new=weight">Log</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
