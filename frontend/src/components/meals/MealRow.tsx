import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Flame, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { LabelPill } from "@/components/meals/LabelPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorMessage } from "@/lib/api";
import { formatTime } from "@/lib/datetime";
import { mealTypeLabel } from "@/lib/nutrition";
import { NUTRITION_KEYS } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Meal } from "@/types/api";

interface MealRowProps {
  meal: Meal;
  onEdit: (meal: Meal) => void;
  highlighted?: boolean;
}

export function MealRow({ meal, onEdit, highlighted }: MealRowProps) {
  const queryClient = useQueryClient();

  function refresh() {
    NUTRITION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const remove = useMutation({
    mutationFn: () => api.delete(`/meals/${meal.id}`),
    onSuccess: () => {
      refresh();
      toast.success("Meal deleted", { description: meal.name });
    },
    onError: (error) => toast.error("Could not delete meal", { description: errorMessage(error) }),
  });

  // Logs the same item again, stamped with the current time.
  const repeat = useMutation({
    mutationFn: () =>
      api.post("/meals", {
        name: meal.name,
        meal_type: meal.meal_type,
        portion: meal.portion,
        calories: meal.calories,
        notes: meal.notes,
        eaten_at: new Date().toISOString(),
        label_ids: meal.labels.map((label) => label.id),
      }),
    onSuccess: () => {
      refresh();
      toast.success("Logged again", { description: meal.name });
    },
    onError: (error) => toast.error("Could not log again", { description: errorMessage(error) }),
  });

  return (
    <div
      id={`meal-${meal.id}`}
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors",
        "hover:bg-surface-raised hover:shadow-subtle animate-fade-up",
        highlighted && "ring-2 ring-primary/40",
      )}
    >
      <span className="mt-0.5 w-11 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {formatTime(meal.eaten_at)}
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-snug">{meal.name}</p>
          <Badge variant="outline">{mealTypeLabel(meal.meal_type)}</Badge>
        </div>

        {(meal.portion || meal.calories !== null) && (
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {meal.portion && <span>{meal.portion}</span>}
            {meal.calories !== null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Flame className="size-3" /> {meal.calories} kcal
              </span>
            )}
          </p>
        )}

        {meal.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {meal.labels.map((label) => (
              <LabelPill key={label.id} label={label} />
            ))}
          </div>
        )}

        {meal.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{meal.notes}</p>}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-lg:opacity-100"
            aria-label={`Actions for ${meal.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(meal)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => repeat.mutate()}>
            <Copy /> Log again now
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => remove.mutate()}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
