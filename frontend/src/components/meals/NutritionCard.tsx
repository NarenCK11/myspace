import { Flame, Scale, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router-dom";

import { describeMix, QualityBar } from "@/components/meals/QualityChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKg } from "@/lib/nutrition";
import type { NutritionDashboard } from "@/types/api";

/** Today at a glance: what has been eaten, how it rated, and whether weight is logged. */
export function NutritionCard({ nutrition }: { nutrition: NutritionDashboard }) {
  const { today } = nutrition;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="size-4 text-muted-foreground" />
          Today
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/meals">Open</Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-lg border border-border/70 bg-surface-raised p-3">
            <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <Flame className="size-3.5" />
              Calories today
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
              {today.calories_total.toLocaleString()} <span className="text-sm font-medium">kcal</span>
            </p>
            <p className="text-2xs text-muted-foreground">
              {today.calories_logged_count
                ? `From ${today.calories_logged_count} meal${today.calories_logged_count === 1 ? "" : "s"}`
                : "None logged"}
            </p>
          </div>

          <div className="min-w-0 rounded-lg border border-border/70 bg-surface-raised p-3">
            <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <Scale className="size-3.5" />
              Weight today
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
              {today.weight_kg !== null
                ? <>{formatKg(today.weight_kg)} <span className="text-sm font-medium">kg</span></>
                : "—"}
            </p>
            <p className="text-2xs text-muted-foreground">
              {today.weight_kg !== null ? "Logged today" : "Not logged"}
            </p>
          </div>
        </div>

        {today.meals_count > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {today.meals_count} meal{today.meals_count === 1 ? "" : "s"} logged
            </p>
            <QualityBar counts={today} />
            <p className="text-xs text-muted-foreground">{describeMix(today)}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button asChild size="sm">
            <Link to="/meals?new=meal">{today.meals_count ? "Log another meal" : "Log a meal"}</Link>
          </Button>
          {today.weight_kg === null && (
            <Button asChild variant="secondary" size="sm">
              <Link to="/meals?new=weight">Log weight</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
