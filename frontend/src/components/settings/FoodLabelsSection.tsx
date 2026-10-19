import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LabelForm, type LabelValues } from "@/components/meals/LabelForm";
import { LabelPill } from "@/components/meals/LabelPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { fetchFoodLabels, keys, NUTRITION_KEYS } from "@/lib/queries";
import { TONES } from "@/lib/nutrition";
import type { FoodLabelWithCount } from "@/types/api";

const TONE_BADGE: Record<string, "success" | "danger" | "default"> = {
  good: "success",
  bad: "danger",
  neutral: "default",
};

export function FoodLabelsSection() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ label: FoodLabelWithCount | null } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.foodLabels,
    queryFn: fetchFoodLabels,
  });

  function refresh() {
    NUTRITION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const save = useMutation({
    mutationFn: (values: LabelValues) =>
      dialog?.label ? api.patch(`/meal-labels/${dialog.label.id}`, values) : api.post("/meal-labels", values),
    onSuccess: () => {
      refresh();
      toast.success(dialog?.label ? "Label updated" : "Label created");
      setDialog(null);
    },
    onError: (caught) => toast.error("Could not save label", { description: errorMessage(caught) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/meal-labels/${id}`),
    onSuccess: () => {
      refresh();
      toast.success("Label deleted", { description: "Meals that used it were kept." });
    },
    onError: (caught) => toast.error("Could not delete label", { description: errorMessage(caught) }),
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Food labels</CardTitle>
          <CardDescription>
            Used to describe meals. Healthy and unhealthy ones drive the daily summaries.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialog({ label: null })}>
          <Plus /> New label
        </Button>
      </CardHeader>

      <CardContent>
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ListSkeleton rows={4} />
        ) : data?.length ? (
          <ul className="divide-y divide-border">
            {data.map((label) => (
              <li key={label.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <LabelPill label={label} />
                </span>
                <Badge variant={TONE_BADGE[label.tone]}>
                  {TONES.find((tone) => tone.value === label.tone)?.label}
                </Badge>
                <span className="hidden w-16 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {label.meal_count} {label.meal_count === 1 ? "meal" : "meals"}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDialog({ label })}
                  aria-label={`Edit ${label.name}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    if (window.confirm(`Delete the label "${label.name}"? Meals that use it are kept.`)) {
                      remove.mutate(label.id);
                    }
                  }}
                  aria-label={`Delete ${label.name}`}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={TagIcon}
            title="No labels"
            description="Create labels such as Healthy, Protein or Fatty to describe your meals."
            className="border-0"
          />
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.label ? "Edit label" : "New label"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5">
            {dialog && (
              <LabelForm
                key={dialog.label?.id ?? "new"}
                initial={dialog.label}
                submitting={save.isPending}
                onSubmit={(values) => save.mutate(values)}
                onCancel={() => setDialog(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
