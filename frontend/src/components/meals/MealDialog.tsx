import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LabelSelector } from "@/components/meals/LabelSelector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { MEAL_TYPES, mealTypeForHour } from "@/lib/nutrition";
import { fetchMealSuggestions, keys, NUTRITION_KEYS } from "@/lib/queries";
import type { Meal, MealPayload, MealSuggestion, MealType } from "@/types/api";

interface MealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal?: Meal | null;
  /** The day being viewed (YYYY-MM-DD), used to pick a default time for new meals. */
  day: string;
  today: string;
}

/** Now when logging for today, otherwise midday on the day being viewed. */
function defaultWhen(day: string, today: string) {
  return day === today ? toLocalInputValue(new Date()) : `${day}T12:00`;
}

export function MealDialog({ open, onOpenChange, meal, day, today }: MealDialogProps) {
  const editing = Boolean(meal);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("other");
  const [typeChosen, setTypeChosen] = useState(false);
  const [eatenAt, setEatenAt] = useState("");
  const [portion, setPortion] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);

  const { data: suggestions } = useQuery({
    queryKey: keys.mealSuggestions,
    queryFn: fetchMealSuggestions,
    enabled: open && !editing,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    if (meal) {
      setName(meal.name);
      setMealType(meal.meal_type);
      setTypeChosen(true);
      setEatenAt(toLocalInputValue(meal.eaten_at));
      setPortion(meal.portion ?? "");
      setCalories(meal.calories !== null ? String(meal.calories) : "");
      setNotes(meal.notes ?? "");
      setLabelIds(meal.labels.map((label) => label.id));
      return;
    }
    const when = defaultWhen(day, today);
    setName("");
    setEatenAt(when);
    setMealType(mealTypeForHour(Number(when.slice(11, 13))));
    setTypeChosen(false);
    setPortion("");
    setCalories("");
    setNotes("");
    setLabelIds([]);
  }, [open, meal, day, today]);

  function changeTime(value: string) {
    setEatenAt(value);
    // Follow the time of day until the type is picked by hand.
    if (!typeChosen && value.length >= 13) setMealType(mealTypeForHour(Number(value.slice(11, 13))));
  }

  function applySuggestion(item: MealSuggestion) {
    setName(item.name);
    setMealType(item.meal_type);
    setTypeChosen(true);
    setPortion(item.portion ?? "");
    setCalories(item.calories !== null ? String(item.calories) : "");
    setLabelIds(item.labels.map((label) => label.id));
  }

  const mutation = useMutation({
    mutationFn: (body: MealPayload) =>
      editing ? api.patch(`/meals/${meal!.id}`, body) : api.post("/meals", body),
    onSuccess: () => {
      NUTRITION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(editing ? "Meal updated" : "Meal logged");
      onOpenChange(false);
    },
    onError: (error) => toast.error("Could not save meal", { description: errorMessage(error) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    mutation.mutate({
      name: trimmed,
      meal_type: mealType,
      eaten_at: fromLocalInputValue(eatenAt),
      portion: portion.trim() || null,
      calories: calories.trim() ? Math.round(Number(calories)) : null,
      notes: notes.trim() || null,
      label_ids: labelIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit meal" : "Log a meal"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            {!editing && suggestions && suggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <History className="size-3" /> Log again
                </p>
                <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {suggestions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => applySuggestion(item)}
                      className="shrink-0 rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-muted"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="meal-name">What did you have?</Label>
              <Input
                id="meal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Masala dosa with chutney"
                maxLength={200}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="meal-when">When</Label>
                <Input
                  id="meal-when"
                  type="datetime-local"
                  value={eatenAt}
                  onChange={(event) => changeTime(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Meal</Label>
                <Select
                  value={mealType}
                  onValueChange={(value) => {
                    setMealType(value as MealType);
                    setTypeChosen(true);
                  }}
                >
                  <SelectTrigger aria-label="Meal type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meal-portion">Portion</Label>
                <Input
                  id="meal-portion"
                  value={portion}
                  onChange={(event) => setPortion(event.target.value)}
                  placeholder="e.g. 2 rotis, 1 bowl"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meal-calories">Calories (optional)</Label>
                <Input
                  id="meal-calories"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  value={calories}
                  onChange={(event) => setCalories(event.target.value)}
                  placeholder="kcal"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Labels</Label>
              <LabelSelector value={labelIds} onChange={setLabelIds} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meal-notes">Notes</Label>
              <Textarea
                id="meal-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!name.trim()}>
              {editing ? "Save changes" : "Log meal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
