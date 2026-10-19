import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LABEL_COLORS, LABEL_COLOR_KEYS, TONES } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { FoodLabel, LabelTone } from "@/types/api";

export interface LabelValues {
  name: string;
  color: string;
  tone: LabelTone;
}

interface LabelFormProps {
  initial?: FoodLabel | null;
  submitting?: boolean;
  submitText?: string;
  onSubmit: (values: LabelValues) => void;
  onCancel?: () => void;
}

/** Name, what the label says about a meal, and a colour. Used to create and to edit. */
export function LabelForm({ initial, submitting, submitText, onSubmit, onCancel }: LabelFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [tone, setTone] = useState<LabelTone>(initial?.tone ?? "neutral");
  const [color, setColor] = useState(initial?.color ?? "slate");

  function chooseTone(next: LabelTone) {
    setTone(next);
    // A fresh label follows its tone's colour until a colour is picked by hand.
    if (!initial) setColor(TONES.find((item) => item.value === next)?.color ?? "slate");
  }

  function submit() {
    const trimmed = name.trim();
    if (trimmed) onSubmit({ name: trimmed, color, tone });
  }

  // Deliberately not a <form>: this component is used inside other forms
  // (the meal dialog), and nested forms are invalid HTML.
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="label-name">Name</Label>
        <Input
          id="label-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. Spicy, Dairy, Home cooked"
          maxLength={40}
          autoFocus
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Counts as
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {TONES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => chooseTone(item.value)}
              aria-pressed={tone === item.value}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                tone === item.value
                  ? "border-primary bg-primary-soft"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="block font-medium">{item.label}</span>
              <span className="block text-2xs text-muted-foreground">{item.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Colour
        </legend>
        <div className="flex flex-wrap gap-2">
          {LABEL_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setColor(key)}
              aria-label={key}
              aria-pressed={color === key}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-surface transition-shadow",
                color === key && "ring-2 ring-primary",
              )}
              style={{ backgroundColor: LABEL_COLORS[key] }}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={submit} loading={submitting} disabled={!name.trim()}>
          {submitText ?? (initial ? "Save label" : "Create label")}
        </Button>
      </div>
    </div>
  );
}
