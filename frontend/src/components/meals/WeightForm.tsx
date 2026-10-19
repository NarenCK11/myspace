import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { formatKg } from "@/lib/nutrition";
import { fetchWeights, keys, NUTRITION_KEYS } from "@/lib/queries";
import type { WeightEntry } from "@/types/api";

interface WeightFormProps {
  date: string;
  today: string;
  onDateChange: (date: string) => void;
  onSaved?: () => void;
  /** Stacks fields on one column, for use inside a dialog or a narrow card. */
  className?: string;
}

/** One weight per day: saving a date that already has one replaces it. */
export function WeightForm({ date, today, onDateChange, onSaved, className }: WeightFormProps) {
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");

  const params = { start: date, end: date };
  const { data } = useQuery({
    queryKey: keys.weights(params),
    queryFn: () => fetchWeights(params),
    enabled: Boolean(date),
  });
  const existing: WeightEntry | undefined = data?.[0];

  // Show what is already logged for the chosen day so it can be corrected.
  useEffect(() => {
    if (existing) {
      setWeight(existing.weight_kg.toFixed(1));
      setNote(existing.note ?? "");
    }
  }, [existing?.id, existing?.weight_kg, existing?.note]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (body: { logged_on: string; weight_kg: number; note: string | null }) =>
      api.post<WeightEntry>("/weights", body),
    onSuccess: (response) => {
      NUTRITION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(response.status === 201 ? "Weight logged" : "Weight updated", {
        description: `${formatKg(response.data.weight_kg)} kg on ${response.data.logged_on}`,
      });
      onSaved?.();
    },
    onError: (error) => toast.error("Could not save weight", { description: errorMessage(error) }),
  });

  const parsed = Number(weight.replace(",", "."));
  const valid = weight.trim() !== "" && Number.isFinite(parsed) && parsed >= 20 && parsed <= 500;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate({ logged_on: date, weight_kg: parsed, note: note.trim() || null });
  }

  return (
    <form onSubmit={submit} className={className ?? "space-y-3"}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="weight-date">Day</Label>
          <Input
            id="weight-date"
            type="date"
            value={date}
            max={today}
            onChange={(event) => event.target.value && onDateChange(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weight-kg">Weight (kg)</Label>
          <Input
            id="weight-kg"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="e.g. 72.4"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="weight-note">Note</Label>
        <Input
          id="weight-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional, e.g. after a run"
          maxLength={500}
        />
      </div>

      {weight.trim() !== "" && !valid && (
        <p role="alert" className="text-2xs text-danger">
          Enter a weight between 20 and 500 kg.
        </p>
      )}

      <Button type="submit" className="w-full" loading={mutation.isPending} disabled={!valid}>
        {existing ? "Update weight" : "Log weight"}
      </Button>
    </form>
  );
}

export function WeightDialog({
  open,
  onOpenChange,
  day,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
  today: string;
}) {
  const [date, setDate] = useState(day);

  useEffect(() => {
    if (open) setDate(day > today ? today : day);
  }, [open, day, today]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log your weight</DialogTitle>
          <DialogDescription>One entry per day. Saving a day again replaces it.</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-5">
          <WeightForm
            date={date}
            today={today}
            onDateChange={setDate}
            onSaved={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
