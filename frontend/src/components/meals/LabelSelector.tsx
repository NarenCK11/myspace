import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LabelForm, type LabelValues } from "@/components/meals/LabelForm";
import { api, errorMessage } from "@/lib/api";
import { fetchFoodLabels, keys, NUTRITION_KEYS } from "@/lib/queries";
import { labelColor } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { FoodLabel } from "@/types/api";

interface LabelSelectorProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** Toggleable label pills, with a way to invent a new label without leaving the form. */
export function LabelSelector({ value, onChange }: LabelSelectorProps) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data: labels, isLoading } = useQuery({ queryKey: keys.foodLabels, queryFn: fetchFoodLabels });

  const create = useMutation({
    mutationFn: (values: LabelValues) =>
      api.post<FoodLabel>("/meal-labels", values).then((response) => response.data),
    onSuccess: (label) => {
      NUTRITION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      onChange([...value, label.id]);
      setCreating(false);
      toast.success("Label created", { description: label.name });
    },
    onError: (error) => toast.error("Could not create label", { description: errorMessage(error) }),
  });

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading labels...</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {labels?.map((label) => {
          const selected = value.includes(label.id);
          const hex = labelColor(label.color);
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => toggle(label.id)}
              aria-pressed={selected}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                selected ? "text-foreground" : "border-border text-muted-foreground hover:bg-muted",
              )}
              style={selected ? { backgroundColor: `${hex}26`, borderColor: hex } : undefined}
            >
              {selected ? (
                <Check className="size-3" />
              ) : (
                <span className="size-1.5 rounded-full" style={{ backgroundColor: hex }} aria-hidden />
              )}
              {label.name}
            </button>
          );
        })}

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3" /> New label
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-lg border border-border bg-surface-sunken p-3">
          <LabelForm
            submitting={create.isPending}
            onSubmit={(values) => create.mutate(values)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}
    </div>
  );
}
